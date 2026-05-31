import type { PageServerLoad } from './$types';
import type { Day, Item } from '$lib/types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { trip, days } = await parent();

	const now = new Date();
	const upcomingDayIds: string[] = [];

	for (let i = 1; i <= 3; i++) {
		const d = new Date(now);
		d.setUTCDate(d.getUTCDate() + i);
		const ds = d.toISOString().split('T')[0];
		const found = days.find((day: Day) => day.date.split(/[T ]/)[0] === ds);
		if (found) upcomingDayIds.push(found.id);
	}

	const items = upcomingDayIds.length > 0
		? await locals.pb.collection('items').getFullList<Item>({
				filter: upcomingDayIds.map((id) => `day = "${id}"`).join(' || '),
				sort: 'day,start_time,rank'
			})
		: [];

	return { items, now: now.toISOString() };
};
