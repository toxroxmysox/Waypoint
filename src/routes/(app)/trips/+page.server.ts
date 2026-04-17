import type { PageServerLoad } from './$types';
import type { Trip, TripMember } from '$lib/types';

export const load: PageServerLoad = async ({ locals }) => {
	// Get all trip memberships for the current user
	const memberships = await locals.pb.collection('trip_members').getFullList<TripMember>({
		filter: `user = "${locals.user!.id}"`,
		expand: 'trip'
	});

	const now = new Date().toISOString().split('T')[0];

	const trips = memberships
		.map((m) => ({
			trip: m.expand?.trip as Trip | undefined,
			role: m.role,
			memberId: m.id
		}))
		.filter((m) => m.trip)
		.sort((a, b) => {
			// Active first (start <= now <= end), then upcoming, then past
			const aTrip = a.trip!;
			const bTrip = b.trip!;
			const aStart = aTrip.start_date.split('T')[0];
			const bStart = bTrip.start_date.split('T')[0];
			return aStart > bStart ? 1 : aStart < bStart ? -1 : 0;
		});

	const active = trips.filter((t) => {
		const start = t.trip!.start_date.split('T')[0];
		const end = t.trip!.end_date.split('T')[0];
		return start <= now && now <= end;
	});

	const upcoming = trips.filter((t) => {
		const start = t.trip!.start_date.split('T')[0];
		return start > now;
	});

	const past = trips.filter((t) => {
		const end = t.trip!.end_date.split('T')[0];
		return end < now;
	});

	return { active, upcoming, past };
};
