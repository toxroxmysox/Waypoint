import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Item, ItemType, Day, Phase, Expense, Settlement, TripMember } from '$lib/types';
import { fetchManualChecklists, rollupChecklists } from '$lib/itinerary/checklist-loaders';
import { summarizeDays } from '$lib/itinerary/day-card';
import { getTripLifecycle } from '$lib/trip-mode/trip-lifecycle';
import { simplifyDebts } from '$lib/money/debt-simplify';
import { buildArchiveView } from '$lib/portability/archive-view';
import { publishStatus } from '$lib/portability/archive-visibility';

// Overview checklist previews (#51): roll up each manual, non-item-scoped
// Checklist's done/total so the Overview can show compact mini-cards under the
// whole-trip header and each phase's days. Same shape as the Lists index.
//
// Day-card content (#65): the overview now also rides ONE items fetch to compute
// per-day summaries (count + booked + budget + stay chip). The day count and the
// booked|budget toggle share this single query — no N+1 per day.
//
// Lifecycle router (#239/#195): the Overview is a lifecycle router computed HERE in
// server load (NOT in AppShell). `wrap-up` → the wrap-up banner replaces the top of
// the page (trip-details card + Flights & Stays); `closed` → the read-only Record view
// (#242, via buildArchiveView) with the Share affordance; planning/active fall through
// to the normal planning Overview, unchanged. Navigation is untouched: still the 5
// planning tabs, no new mode.
export const load: PageServerLoad = async ({ parent, locals, url }) => {
	const { trip, membership, days, phases } = await parent();

	const lifecycle = getTripLifecycle(trip);

	// Closed → the read-only Record view (#242). Reuse buildArchiveView (same
	// sanitization as the public archive) for the done-items record + the curated
	// "what we considered". Compute the Share affordance facts: an ABSOLUTE share URL
	// (origin + /archive/[token]) and the plain-language publish status. The owner/
	// co_owner gets the Publish/change-date/disable + reopen controls (the page gates
	// them; the server actions re-enforce role).
	if (lifecycle === 'closed') {
		const recordItems = await locals.pb.collection('items').getFullList<Item>({
			filter: `trip = "${trip.id}"`,
			sort: 'day,sort_order'
		});
		const record = buildArchiveView(trip, phases as Phase[], days as Day[], recordItems);
		const status = publishStatus(trip);
		const canManage = membership.role === 'owner' || membership.role === 'co_owner';
		return {
			lifecycle,
			record,
			canManage,
			share: {
				// Absolute URL so it pastes into a group text as a working link (no
				// hand-assembled domain). "" token → not yet shareable (Publish mints it).
				url: trip.public_share_token
					? `${url.origin}/archive/${trip.public_share_token}`
					: '',
				status,
				archiveEnabled: trip.archive_enabled,
				// Pre-seed the date control on re-edit: a scheduled record carries its date.
				publishDate: status.status === 'scheduled' ? status.date : '',
				showBudget: trip.archive_show_budget
			},
			// Planning-Overview keys, defaulted — the page never reads them when closed,
			// but a consistent shape keeps the page-data union from narrowing them to
			// `undefined` in the other branches.
			wrapUp: { balanceOwed: false },
			lists: [] as ReturnType<typeof rollupChecklists>,
			daySummaries: {} as ReturnType<typeof summarizeDays>,
			keyItems: [] as { id: string; type: ItemType; title: string }[]
		};
	}

	const [{ checklists, tasks }, items] = await Promise.all([
		fetchManualChecklists(locals.pb, trip.id),
		locals.pb.collection('items').getFullList<Item>({
			filter: `trip = "${trip.id}"`,
			fields: 'id,day,end_date,type,title,status,booked,requires_booking,cost_estimate_usd'
		})
	]);

	// Settle-up is gated on BALANCE, not lifecycle (Grill Resolution #6): the row shows
	// only when an outstanding debt exists. `simplifyDebts` already nets expenses against
	// settlements and applies a float tolerance — a non-empty edge list means someone
	// still owes someone. We only pay for this query on a wrap-up trip (the only state
	// that renders the banner); other states never read it.
	let balanceOwed = false;
	if (lifecycle === 'wrap-up') {
		const [expenses, settlements] = await Promise.all([
			locals.pb.collection('expenses').getFullList<Expense>({ filter: `trip = "${trip.id}"` }),
			locals.pb
				.collection('settlements')
				.getFullList<Settlement>({ filter: `trip = "${trip.id}"` })
		]);
		balanceOwed = simplifyDebts(expenses, settlements).length > 0;
	}

	return {
		lifecycle,
		// Wrap-up banner facts (only meaningful when lifecycle === 'wrap-up'). Close-out
		// is always outstanding in wrap-up (it's how you LEAVE wrap-up). Settle-up is
		// outstanding only when a balance is owed.
		wrapUp: { balanceOwed },
		lists: rollupChecklists(checklists, tasks),
		daySummaries: summarizeDays(items, days as Day[]),
		// #200 — light findability lens: surface flights + lodging on the Overview so
		// a member finds the flight/hotel without opening days one by one. Not search.
		keyItems: items
			.filter((i) => i.type === 'flight' || i.type === 'lodging')
			.map((i) => ({ id: i.id, type: i.type, title: i.title })),
		// Closed-only keys, absent here (the page reads them only under `isClosed`).
		record: undefined as ReturnType<typeof buildArchiveView> | undefined,
		share: undefined as ClosedShare | undefined,
		canManage: false
	};
};

type ClosedShare = {
	url: string;
	status: ReturnType<typeof publishStatus>;
	archiveEnabled: boolean;
	publishDate: string;
	showBudget: boolean;
};

// Helper inlined per action (server load can't share a closure with actions): resolve
// the trip + the caller's ACTIVE membership, throwing fail(403) for a non-owner.
async function requireOwner(
	locals: App.Locals,
	slug: string
): Promise<{ tripId: string; ok: true } | { ok: false; status: number; message: string }> {
	const trip = await locals.pb
		.collection('trips')
		.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug }));
	const membership = await locals.pb
		.collection('trip_members')
		.getFirstListItem<TripMember>(
			`trip = "${trip.id}" && user = "${locals.user!.id}" && removed_at = ""`
		);
	if (membership.role !== 'owner' && membership.role !== 'co_owner') {
		return { ok: false, status: 403, message: 'Only owners or co-owners can do that.' };
	}
	return { tripId: trip.id, ok: true };
}

export const actions: Actions = {
	// Standalone Publish/share control on the closed Record view (#242/#241). Owner/
	// co_owner ONLY, SERVER-ENFORCED, gated on role alone (an owner can publish an
	// already-closed trip later — closed-and-private is a normal terminal state).
	// Binary: Publish sets archive_publish_at (+ enables sharing, mints a token);
	// "Keep private"/disable clears the date (and turns sharing off on explicit disable).
	publishRecord: async ({ request, locals, params }) => {
		try {
			const gate = await requireOwner(locals, params.slug);
			if (!gate.ok) return fail(gate.status, { error: gate.message });

			const data = await request.formData();
			const publish = data.get('publish')?.toString() === 'on';
			const disable = data.get('disable')?.toString() === 'on';
			const showBudget = data.get('show_budget')?.toString() === 'on';

			const updates: Record<string, unknown> = {};
			if (disable) {
				// "Disable sharing" — turn the public link off and pause publishing.
				updates.archive_enabled = false;
				updates.archive_publish_at = '';
			} else if (publish) {
				const rawDate = (data.get('publish_date')?.toString() || '').split(/[T ]/)[0];
				const today = new Date().toISOString().split('T')[0];
				const day = rawDate || today;
				updates.archive_publish_at = `${day} 00:00:00.000Z`;
				updates.archive_enabled = true;
				updates.archive_show_budget = showBudget;
				const trip = await locals.pb.collection('trips').getOne(gate.tripId);
				if (!trip.public_share_token) {
					const { generateArchiveToken } = await import('$lib/portability/archive-token');
					updates.public_share_token = generateArchiveToken();
				}
			} else {
				// Keep private — clear the publish date (sharing stays enabled but unpublished).
				updates.archive_publish_at = '';
			}

			await locals.pb.collection('trips').update(gate.tripId, updates);
			return { publishSaved: true };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to update sharing.' });
		}
	},

	// Reopen a closed trip (#242). Owner/co_owner ONLY, behind a confirm (the UI). Sets
	// archived:false → the trip RE-DERIVES its lifecycle from dates (wrap-up if past end,
	// active if still in range) — there is no special "reopened" state. ALSO clears
	// archive_publish_at so a trip pulled back into editing isn't left publicly exposed
	// (publishing pauses until the next closeout re-sets it).
	reopenTrip: async ({ locals, params }) => {
		try {
			const gate = await requireOwner(locals, params.slug);
			if (!gate.ok) return fail(gate.status, { error: gate.message });

			await locals.pb.collection('trips').update(gate.tripId, {
				archived: false,
				archive_publish_at: ''
			});
			redirect(303, `/trips/${params.slug}`);
		} catch (err: unknown) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to reopen trip.' });
		}
	}
};
