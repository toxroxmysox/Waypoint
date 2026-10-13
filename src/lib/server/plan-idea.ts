import type PocketBase from 'pocketbase';
import { GAP } from '$lib/itinerary/sort-order';

/**
 * #401 — plan an idea on a day: append it to the day's tail and mark it planned.
 * The one write behind the day page's tap-to-plan and Phase Detail's Do this.
 * Returns the idea's prior day and sort_order so the caller can offer Undo.
 * items.pb.js stays the permission authority (creator or owner/co_owner).
 */
export async function planIdeaOnDay(
	pb: PocketBase,
	itemId: string,
	dayId: string
): Promise<{ prevDay: string; prevSortOrder: number }> {
	const before = await pb.collection('items').getOne(itemId, { fields: 'id,day,sort_order' });
	const tail = await pb.collection('items').getFullList({
		filter: pb.filter('day = {:d}', { d: dayId }),
		sort: '-sort_order',
		fields: 'sort_order'
	});
	await pb.collection('items').update(itemId, {
		day: dayId,
		status: 'planned',
		sort_order: tail.length > 0 ? Number(tail[0].sort_order) + GAP : GAP
	});
	return { prevDay: String(before.day ?? ''), prevSortOrder: Number(before.sort_order) || 0 };
}
