import type { PageServerLoad } from './$types';
import type { Item, Day, Expense, Settlement } from '$lib/types';
import { fetchManualChecklists, rollupChecklists } from '$lib/itinerary/checklist-loaders';
import { summarizeDays } from '$lib/itinerary/day-card';
import { getTripLifecycle } from '$lib/trip-mode/trip-lifecycle';
import { simplifyDebts } from '$lib/money/debt-simplify';

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
// the page (trip-details card + Flights & Stays); Itinerary/Days stay below. Every
// other state (planning, active, AND closed for now — Slice 4 adds the record view)
// falls through to the normal planning Overview, unchanged. Navigation is untouched:
// still the 5 planning tabs, no new mode.
export const load: PageServerLoad = async ({ parent, locals }) => {
	const { trip, days } = await parent();

	const lifecycle = getTripLifecycle(trip);

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
			.map((i) => ({ id: i.id, type: i.type, title: i.title }))
	};
};
