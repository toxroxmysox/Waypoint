import type { PageServerLoad } from './$types';
import type { Day, Item } from '$lib/types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { trip, days } = await parent();

	const now = new Date();

	// Find today's day record (UTC date match)
	const todayStr = now.toISOString().split('T')[0];
	const today = days.find((d: Day) => d.date.split(/[T ]/)[0] === todayStr) ?? null;

	// Load items for today + upcoming (let client derive state)
	const todayAndUpcomingIds: string[] = [];
	if (today) todayAndUpcomingIds.push(today.id);

	for (let i = 1; i <= 3; i++) {
		const d = new Date(now);
		d.setUTCDate(d.getUTCDate() + i);
		const ds = d.toISOString().split('T')[0];
		const found = days.find((day: Day) => day.date.split(/[T ]/)[0] === ds);
		if (found) todayAndUpcomingIds.push(found.id);
	}

	const items = todayAndUpcomingIds.length > 0
		? await locals.pb.collection('items').getFullList<Item>({
				filter: todayAndUpcomingIds.map((id) => `day = "${id}"`).join(' || '),
				sort: 'day,start_time,rank'
			})
		: [];

	return {
		items,
		now: now.toISOString()
	};
};
