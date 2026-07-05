import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Phase } from '$lib/types';

// #252 — the idea/plan fork sheet's "Add an idea" submit target. Action-only route:
// it has no page of its own, so a direct GET bounces to the Overview.
export const load: PageServerLoad = async ({ params }) => {
	redirect(307, `/trips/${params.slug}`);
};

const IDEA_TYPES = ['activity', 'meal', 'lodging', 'transportation', 'flight', 'note'] as const;

export const actions: Actions = {
	// "Add an idea" → an unplanned, phase-REQUIRED contribution. Routed through
	// /api/suggestions/create so the one path serves every role: a traveler queues
	// (or auto-approves when the trip allows), an owner/co_owner auto-approves. The
	// response status ('pending' | 'approved') decides the redirect + toast.
	//
	// Phase is required (#252 / #217 invariant): every idea has a phase. The picker
	// always has ≥1 option because #217 guarantees at least one phase exists.
	create: async ({ request, params, locals }) => {
		let trip: { id: string; start_date: string };
		try {
			trip = await locals.pb
				.collection('trips')
				.getFirstListItem<{
					id: string;
					start_date: string;
				}>(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
		} catch {
			return fail(404, { error: 'Trip not found.' });
		}

		// #270 / ADR-0022 — a forming (dateless) trip has NO phases yet; its ideas
		// are collected phase-less (phase='') and re-homed into the seeded Phase 1
		// at promotion (the trips.pb.js update hook). The phase requirement only
		// holds once the trip is dated (#252/#217: every idea has a phase).
		const forming = !trip.start_date;

		const data = await request.formData();
		const title = data.get('title')?.toString().trim() || '';
		const phaseId = data.get('phase')?.toString() || '';
		const typeRaw = data.get('type')?.toString() || 'activity';
		const type = (IDEA_TYPES as readonly string[]).includes(typeRaw) ? typeRaw : 'activity';

		if (!title) return fail(400, { error: 'Give the idea a title.' });
		if (!phaseId && !forming) return fail(400, { error: 'Pick a phase for this idea.' });

		// Validate the phase belongs to this trip (the picker is trusted, but a
		// stale/forged value must not create a cross-trip ghost).
		let phase: Phase | null = null;
		if (phaseId) {
			try {
				phase = await locals.pb.collection('phases').getOne<Phase>(phaseId);
			} catch {
				return fail(400, { error: 'That phase no longer exists.' });
			}
			if (!phase || phase.trip !== trip.id)
				return fail(400, { error: 'Pick a phase for this trip.' });
		}

		// An idea is unplanned + phase-scoped: payload names a phase, never a day.
		// (Forming: no phase exists yet — the suggestions hook stores phase=''.)
		const payload = phaseId ? { title, type, phase: phaseId } : { title, type };

		// Post through the request-scoped PB client (locals.pb) — its baseURL and auth
		// token are already correct for this session. A raw fetch to a hardcoded/env
		// base broke twice over: the token came from locals.pb but the fetch targeted a
		// DIFFERENT base (→ "Authentication required"), and in prod it routed an SSR call
		// out through the public Cloudflare Tunnel and back (the cold-tunnel EOF class,
		// bug-205). `send()` uses the client's own base + attaches the auth header.
		let status = 'pending';
		try {
			const body = (await locals.pb.send('/api/suggestions/create', {
				method: 'POST',
				body: { trip_id: trip.id, payload }
			})) as { status?: string };
			status = body.status === 'approved' ? 'approved' : 'pending';
		} catch (err: unknown) {
			const e = err as { status?: number; response?: { message?: string }; message?: string };
			const code = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
			return fail(code, { error: e.response?.message || e.message || 'Failed to add idea.' });
		}

		// #270 — a forming idea has no phase page to land on; the Overview IS the
		// idea list on a dateless trip. The new idea is visible right there.
		if (!phaseId || !phase) {
			redirect(303, `/trips/${params.slug}`);
		}

		// #252 — replace the old silent redirect-to-Overview with a redirect to the
		// phase where the contribution now lives, plus a toast. Both paths follow
		// this redirect (enhance's update() applies it as a client goto; no-JS does a
		// real 303) and the destination phase page reads + clears ?ideaToast, so the
		// toast text lives in the query param rather than action-return state.
		const queued = status === 'pending';
		const toastMsg = queued ? `Sent for review — pending in ${phase.name}` : `Added to ${phase.name}`;
		redirect(303, `/trips/${params.slug}/phases/${phaseId}?ideaToast=${encodeURIComponent(toastMsg)}`);
	}
};
