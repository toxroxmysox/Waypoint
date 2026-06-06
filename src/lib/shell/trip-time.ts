/** Resolve the effective timezone for a trip, defaulting to UTC when unset. */
export function tripTz(trip: { timezone?: string }): string {
	return trip.timezone && trip.timezone.trim() ? trip.timezone : 'UTC';
}

/**
 * "Now" expressed as a Date whose UTC fields equal the wall clock in `tz`.
 * This makes it directly comparable to item times, which are stored as
 * naive-local strings parsed as UTC. Uses the sv-SE locale because it renders
 * as ISO-like `YYYY-MM-DD HH:MM:SS`.
 */
export function tripNow(tz: string, now: Date = new Date()): Date {
	const fmt = new Intl.DateTimeFormat('sv-SE', {
		timeZone: tz,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	});
	// sv-SE -> "2026-06-09 00:30:00"
	const s = fmt.format(now).replace(' ', 'T');
	return new Date(s + 'Z');
}

/** Current calendar date in `tz` as `YYYY-MM-DD`. */
export function tripToday(tz: string, now: Date = new Date()): string {
	return tripNow(tz, now).toISOString().split('T')[0];
}

/**
 * Combine a day's date with a time-of-day into the stored naive-local format
 * `YYYY-MM-DD HH:MM:00.000Z`. Returns '' if either part is missing.
 */
export function combineDateTime(dayDate: string, time: string): string {
	if (!dayDate || !time) return '';
	const date = dayDate.split(/[T ]/)[0];
	return `${date} ${time}:00.000Z`;
}
