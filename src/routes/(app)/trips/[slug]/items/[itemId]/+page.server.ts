import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Item, ChecklistItem, TripMember } from '$lib/types';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { trip, phases, days } = await parent();

	let item: Item;
	try {
		item = await locals.pb.collection('items').getOne<Item>(params.itemId);
	} catch {
		error(404, 'Item not found');
	}

	if (item.trip !== trip.id) {
		error(404, 'Item not found');
	}

	const [checklistItems, members] = await Promise.all([
		item.type === 'checklist'
			? locals.pb.collection('checklist_items').getFullList<ChecklistItem>({
					filter: `item = "${item.id}"`,
					sort: 'order'
				})
			: Promise.resolve([]),
		locals.pb.collection('trip_members').getFullList<TripMember>({
			filter: `trip = "${trip.id}"`,
			expand: 'user'
		})
	]);

	const day = item.day ? days.find((d) => d.id === item.day) ?? null : null;
	const phase = item.phase ? phases.find((p) => p.id === item.phase) ?? null : null;

	return { item, checklistItems, members, itemDay: day, itemPhase: phase };
};
