import type { PageServerLoad } from './$types';
import type { Day, Item } from '$lib/types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { trip, days } = await parent();

	const now = new Date();
	const upcomingDays: Day[] = [];

	for (let i = 1; i <= 3; i++) {
		const d = new Date(now);
		d.setUTCDate(d.getUTCDate() + i);
		const ds = d.toISOString().split('T')[0];
		const found = days.find((day: Day) => day.date.split(/[T ]/)[0] === ds);
		if (found) upcomingDays.push(found);
	}

	const dayIds = upcomingDays.map((d) => d.id);
	const items = dayIds.length > 0
		? await locals.pb.collection('items').getFullList<Item>({
				filter: dayIds.map((id) => `day = "${id}"`).join(' || '),
				sort: 'day,slot,start_time,rank'
			})
		: [];

	return { upcomingDays, upcomingItems: items };
};
