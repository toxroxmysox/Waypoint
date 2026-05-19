import type { PageServerLoad } from './$types';
import type { Day, Item } from '$lib/types';

const SLOT_ORDER: Record<string, number> = { morning: 0, afternoon: 1, evening: 2, anytime: 3 };

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { trip, days } = await parent();

	const now = new Date();

	// Find today's day record (UTC date match)
	const todayStr = now.toISOString().split('T')[0];
	const today = days.find((d: Day) => d.date.split(/[T ]/)[0] === todayStr) ?? null;

	// Find tomorrow
	const tomorrow = new Date(now);
	tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
	const tomorrowStr = tomorrow.toISOString().split('T')[0];
	const tomorrowDay = days.find((d: Day) => d.date.split(/[T ]/)[0] === tomorrowStr) ?? null;

	// Next 3 days (including tomorrow)
	const upcomingDays: Day[] = [];
	for (let i = 1; i <= 3; i++) {
		const d = new Date(now);
		d.setUTCDate(d.getUTCDate() + i);
		const ds = d.toISOString().split('T')[0];
		const found = days.find((day: Day) => day.date.split(/[T ]/)[0] === ds);
		if (found) upcomingDays.push(found);
	}

	// Load items for today
	const todayItems = today
		? await locals.pb.collection('items').getFullList<Item>({
				filter: `day = "${today.id}"`,
				sort: 'start_time,rank'
			})
		: [];
	todayItems.sort((a, b) => (SLOT_ORDER[a.slot] ?? 9) - (SLOT_ORDER[b.slot] ?? 9));

	// Load items for upcoming days
	const upcomingDayIds = upcomingDays.map((d) => d.id);
	const upcomingItems =
		upcomingDayIds.length > 0
			? await locals.pb.collection('items').getFullList<Item>({
					filter: upcomingDayIds.map((id) => `day = "${id}"`).join(' || '),
					sort: 'day,start_time,rank'
				})
			: [];
	upcomingItems.sort((a, b) => (SLOT_ORDER[a.slot] ?? 9) - (SLOT_ORDER[b.slot] ?? 9));

	return {
		today,
		todayItems,
		tomorrowDay,
		upcomingDays,
		upcomingItems,
		now: now.toISOString()
	};
};
