import type { PageServerLoad } from './$types';
import type { Day, Item } from '$lib/types';

const SLOT_ORDER: Record<string, number> = { morning: 0, afternoon: 1, evening: 2, anytime: 3 };

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
				sort: 'day,start_time,rank'
			})
		: [];
	items.sort((a, b) => (SLOT_ORDER[a.slot] ?? 9) - (SLOT_ORDER[b.slot] ?? 9));

	return { upcomingDays, upcomingItems: items };
};
