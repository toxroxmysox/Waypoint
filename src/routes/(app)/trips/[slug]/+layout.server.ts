import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { Trip, TripMember, Phase, Day } from '$lib/types';

export const load: LayoutServerLoad = async ({ params, locals }) => {
	let trip: Trip;
	try {
		trip = await locals.pb
			.collection('trips')
			.getFirstListItem<Trip>(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
	} catch {
		error(404, 'Trip not found');
	}

	// Verify membership
	let membership: TripMember;
	try {
		membership = await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}"`);
	} catch {
		error(403, 'You are not a member of this trip');
	}

	const [phases, days] = await Promise.all([
		locals.pb.collection('phases').getFullList<Phase>({
			filter: `trip = "${trip.id}"`,
			sort: 'order'
		}),
		locals.pb.collection('days').getFullList<Day>({
			filter: `trip = "${trip.id}"`,
			sort: 'date'
		})
	]);

	return { trip, membership, phases, days };
};
