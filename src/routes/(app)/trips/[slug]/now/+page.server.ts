import type { PageServerLoad } from './$types';
import type { Day, Item } from '$lib/types';
import { tripNow, tripTz } from '$lib/shell/trip-time';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { trip, days } = await parent();

	const now = tripNow(tripTz(trip));
	const todayStr = now.toISOString().split('T')[0];
	const today = days.find((d: Day) => d.date.split(/[T ]/)[0] === todayStr) ?? null;

	const tomorrow = new Date(now);
	tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
	const tomorrowStr = tomorrow.toISOString().split('T')[0];
	const tomorrowDay = days.find((d: Day) => d.date.split(/[T ]/)[0] === tomorrowStr) ?? null;

	const dayIds: string[] = [];
	if (today) dayIds.push(today.id);
	if (tomorrowDay) dayIds.push(tomorrowDay.id);

	const items =
		dayIds.length > 0
			? await locals.pb.collection('items').getFullList<Item>({
					filter: dayIds.map((id) => `day = "${id}"`).join(' || '),
					sort: 'start_time,sort_order'
				})
			: [];

	const todayItems = items.filter((i) => i.day === today?.id);
	const tomorrowItems = items.filter((i) => i.day === tomorrowDay?.id);
	const tomorrowFirstItem = tomorrowItems.length > 0 ? tomorrowItems[0] : null;

	return {
		todayItems,
		tomorrowFirstItem,
		hasToday: today !== null,
		now: now.toISOString()
	};
};
