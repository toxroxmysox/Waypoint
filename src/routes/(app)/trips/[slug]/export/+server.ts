import type { RequestHandler } from './$types';
import type { Trip, Phase, Day, Item, TripBudget } from '$lib/types';
import { buildTripExport } from '$lib/utils/export';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	const trip = await locals.pb
		.collection('trips')
		.getFirstListItem<Trip>(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

	await locals.pb
		.collection('trip_members')
		.getFirstListItem(`trip = "${trip.id}" && user = "${locals.user.id}"`);

	const [phases, days, items] = await Promise.all([
		locals.pb.collection('phases').getFullList<Phase>({
			filter: `trip = "${trip.id}"`,
			sort: 'order'
		}),
		locals.pb.collection('days').getFullList<Day>({
			filter: `trip = "${trip.id}"`,
			sort: 'date'
		}),
		locals.pb.collection('items').getFullList<Item>({
			filter: `trip = "${trip.id}"`,
			sort: 'day,slot,order'
		})
	]);

	let budget = null;
	try {
		const tripBudget = await locals.pb
			.collection('trip_budgets')
			.getFirstListItem<TripBudget>(`trip = "${trip.id}"`);
		if (tripBudget) {
			budget = { categories: tripBudget.categories || [] };
		}
	} catch {
		// No budget
	}

	const exportData = buildTripExport(trip, phases, days, items, budget);
	const filename = `waypoint-${trip.slug}-${new Date().toISOString().split('T')[0]}.json`;

	return new Response(JSON.stringify(exportData, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
