import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { Trip, TripMember, Phase, Day, Notification, Item } from '$lib/types';

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
			.getFirstListItem<TripMember>(
				// #133: a Departed Member's `user` is cleared on removal, but guard the
				// access gate explicitly — a tombstone must never resolve as a member.
				`trip = "${trip.id}" && user = "${locals.user!.id}" && removed_at = ""`
			);
	} catch {
		error(403, 'You are not a member of this trip');
	}

	const [phases, days, notifications, parkingLotItems] = await Promise.all([
		locals.pb.collection('phases').getFullList<Phase>({
			filter: `trip = "${trip.id}"`,
			sort: 'order'
		}),
		locals.pb.collection('days').getFullList<Day>({
			filter: `trip = "${trip.id}"`,
			sort: 'date'
		}),
		locals.pb.collection('notifications').getFullList<Notification>({
			filter: `recipient = "${membership.id}"`,
			sort: '-id',
			perPage: 30
		}).catch(() => [] as Notification[]),
		locals.pb.collection('items').getFullList<Item>({
			filter: `trip = "${trip.id}" && status = "unplanned"`,
			sort: 'sort_order'
		}).catch(() => [] as Item[])
	]);

	const unreadCount = notifications.filter((n) => !n.read_at).length;

	return { trip, membership, phases, days, notifications, unreadCount, parkingLotItems };
};
