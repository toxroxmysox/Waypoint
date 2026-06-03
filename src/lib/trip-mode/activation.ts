export type TripViewMode = 'planning' | 'trip';

export interface TripDateInfo {
	start_date: string;
	end_date: string;
	archived: boolean;
}

export function isTripActive(trip: TripDateInfo, now: Date = new Date()): boolean {
	if (trip.archived || !trip.start_date || !trip.end_date) return false;
	const today = now.toISOString().split('T')[0];
	const start = trip.start_date.split(/[T ]/)[0];
	const end = trip.end_date.split(/[T ]/)[0];
	return today >= start && today <= end;
}
