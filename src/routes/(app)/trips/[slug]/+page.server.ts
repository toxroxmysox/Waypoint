import type { PageServerLoad } from './$types';
import type { Item, Day } from '$lib/types';
import { fetchManualChecklists, rollupChecklists } from '$lib/itinerary/checklist-loaders';
import { summarizeDays } from '$lib/itinerary/day-card';

// Overview checklist previews (#51): roll up each manual, non-item-scoped
// Checklist's done/total so the Overview can show compact mini-cards under the
// whole-trip header and each phase's days. Same shape as the Lists index.
//
// Day-card content (#65): the overview now also rides ONE items fetch to compute
// per-day summaries (count + booked + budget + stay chip). The day count and the
// booked|budget toggle share this single query — no N+1 per day.
export const load: PageServerLoad = async ({ parent, locals }) => {
	const { trip, days } = await parent();

	const [{ checklists, tasks }, items] = await Promise.all([
		fetchManualChecklists(locals.pb, trip.id),
		locals.pb.collection('items').getFullList<Item>({
			filter: `trip = "${trip.id}"`,
			fields: 'id,day,end_date,type,title,status,booked,requires_booking,cost_estimate_usd'
		})
	]);

	return {
		lists: rollupChecklists(checklists, tasks),
		daySummaries: summarizeDays(items, days as Day[])
	};
};
