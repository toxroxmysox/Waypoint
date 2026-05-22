import type { PageServerLoad } from './$types';
import type { Item, Phase } from '$lib/types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { trip, phases } = await parent();

	const items = await locals.pb.collection('items').getFullList<Item>({
		filter: `trip = "${trip.id}" && parking_lot_scope != "none"`,
		sort: '-created'
	});

	return { parkingLotItems: items, phases: phases as Phase[] };
};
