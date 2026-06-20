import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Phase } from '$lib/types';

const PB_BASE = process.env.PUBLIC_PB_URL || 'http://127.0.0.1:8090';

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
		let trip: { id: string };
		try {
			trip = await locals.pb
				.collection('trips')
				.getFirstListItem<{ id: string }>(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
		} catch {
			return fail(404, { error: 'Trip not found.' });
		}

		const data = await request.formData();
		const title = data.get('title')?.toString().trim() || '';
		const phaseId = data.get('phase')?.toString() || '';
		const typeRaw = data.get('type')?.toString() || 'activity';
		const type = (IDEA_TYPES as readonly string[]).includes(typeRaw) ? typeRaw : 'activity';

		if (!title) return fail(400, { error: 'Give the idea a title.' });
		if (!phaseId) return fail(400, { error: 'Pick a phase for this idea.' });

		// Validate the phase belongs to this trip (the picker is trusted, but a
		// stale/forged value must not create a cross-trip ghost).
		let phase: Phase | null = null;
		try {
			phase = await locals.pb.collection('phases').getOne<Phase>(phaseId);
		} catch {
			return fail(400, { error: 'That phase no longer exists.' });
		}
		if (!phase || phase.trip !== trip.id) return fail(400, { error: 'Pick a phase for this trip.' });

		const token = locals.pb.authStore.token;
		// An idea is unplanned + phase-scoped: payload names a phase, never a day.
		const payload = { title, type, phase: phaseId };

		let status = 'pending';
		try {
			const res = await fetch(`${PB_BASE}/api/suggestions/create`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
				body: JSON.stringify({ trip_id: trip.id, payload })
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				return fail(res.status, { error: (err as { message?: string }).message || 'Failed to add idea.' });
			}
			const body = (await res.json()) as { status?: string };
			status = body.status === 'approved' ? 'approved' : 'pending';
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to add idea.';
			return fail(500, { error: message });
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
