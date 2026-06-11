import type { PageServerLoad } from './$types';
import type { Day, Item } from '$lib/types';
import { tripNow, tripTz } from '$lib/shell/trip-time';
import { fetchManualChecklists } from '$lib/itinerary/checklist-loaders';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { trip, days } = await parent();

	const now = tripNow(tripTz(trip));
	const todayStr = now.toISOString().split('T')[0];
	const today = days.find((d: Day) => d.date.split(/[T ]/)[0] === todayStr) ?? null;

	// Now is today-only and forward-looking: the full set of today's discrete
	// (non-spanning) items. No tomorrow / next-3-days — that's Today's job.
	const todayItems = today
		? await locals.pb.collection('items').getFullList<Item>({
				filter: `day = "${today.id}" && end_date = ""`,
				sort: 'start_time,sort_order'
			})
		: [];

	// Spanning multi-day items (lodging, rental car) that cover today: they start
	// on/before today and end on/after it. Surfaced as slim context banners (Slice
	// B) — never the Focus pick (#82/#83). Lexicographic compare is safe for the
	// `YYYY-MM-DD...` date/datetime strings PocketBase stores.
	const startedByTodayIds = days
		.filter((d: Day) => d.date.split(/[T ]/)[0] <= todayStr)
		.map((d: Day) => d.id);
	const multiDayItems =
		startedByTodayIds.length > 0
			? await locals.pb.collection('items').getFullList<Item>({
					filter: `(${startedByTodayIds.map((id) => `day = "${id}"`).join(' || ')}) && end_date != "" && end_date >= "${todayStr}"`,
					sort: 'start_time'
				})
			: [];

	// Trip Mode checklists (#52): read + check-off in place (Slice B). Trip/phase-
	// scoped manual lists only; item-scoped lists stay on their Item.
	const { checklists: lists, tasks: listTasks } = await fetchManualChecklists(locals.pb, trip.id);
	const checklists = lists.map((c) => ({
		id: c.id,
		title: c.title,
		tasks: listTasks.filter((t) => t.checklist === c.id)
	}));

	return {
		todayItems,
		multiDayItems,
		checklists,
		hasToday: today !== null,
		now: now.toISOString()
	};
};
