import { tripToday, tripTz } from '$lib/shell/trip-time';

export type TripViewMode = 'planning' | 'trip';

export interface TripDateInfo {
	start_date: string;
	end_date: string;
	archived: boolean;
	/** IANA timezone; "today" is computed in this zone, falling back to UTC. */
	timezone?: string;
}

export function isTripActive(trip: TripDateInfo, now: Date = new Date()): boolean {
	if (trip.archived || !trip.start_date || !trip.end_date) return false;
	// Compare against the trip-local calendar date, not UTC — otherwise an
	// ahead-of-UTC trip flips to Planning mid-evening on its last day (#167).
	const today = tripToday(tripTz(trip), now);
	const start = trip.start_date.split(/[T ]/)[0];
	const end = trip.end_date.split(/[T ]/)[0];
	return today >= start && today <= end;
}
