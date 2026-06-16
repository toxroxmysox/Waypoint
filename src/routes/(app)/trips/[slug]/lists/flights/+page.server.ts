import type { PageServerLoad } from './$types';
import type { Item, Day, TripMember } from '$lib/types';
import { flightsLineup, type FlightItemInput } from '$lib/itinerary/flights-lineup';
import { withAvatarUrls } from '$lib/collaboration/member-avatar';
import { formatTime } from '$lib/shell/format';

// Flights Smart List (#225) — a trip-wide READ-ONLY lens, sibling to Booking.
// Loads every `type='flight'` Item, resolves each one's owning-day calendar date
// (mirrors the Booking route's day lookup), attaches the member roster's avatars,
// and hands both to the pure `flightsLineup` projection. NO write actions: this
// is a read-only view of stored flight data — it never calls the flight API.

// Render a projected 'YYYY-MM-DD HH:MM' (or bare 'YYYY-MM-DD') datetime as a
// { date, time } pair for the template. time is '' when only a date is known.
function splitWhen(when: string): { date: string; time: string } {
	if (!when) return { date: '', time: '' };
	const [date, clock] = when.split(' ');
	const dateLabel = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
	return { date: dateLabel, time: clock ? formatTime(clock) : '' };
}

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { trip, days } = await parent();

	const [items, members] = await Promise.all([
		locals.pb.collection('items').getFullList<Item>({
			filter: `trip = "${trip.id}" && type = "flight"`,
			sort: 'start_time'
		}),
		// Active roster with `expand: user` so `withAvatarUrls` can resolve avatars
		// (mirrors the Lists index loader). Placeholders/removed members excluded.
		locals.pb.collection('trip_members').getFullList<TripMember>({
			filter: `trip = "${trip.id}" && removed_at = ""`,
			expand: 'user'
		})
	]);

	// Resolve each flight's owning-day calendar date for the pure projection's
	// time-less sort/fallback (a flight with a day but no start_time).
	const withDays: FlightItemInput[] = items.map((item) => ({
		...item,
		dayDate: item.day ? (days.find((d: Day) => d.id === item.day)?.date ?? '').split(/[T ]/)[0] : ''
	}));

	const lineup = flightsLineup(withDays, withAvatarUrls(locals.pb, members));

	// Pre-format the date/time strings for the template (keeps the projection pure
	// and the component dumb).
	const rows = lineup.map((r) => ({
		...r,
		dep: splitWhen(r.departure),
		arr: splitWhen(r.arrival)
	}));

	return { rows };
};
