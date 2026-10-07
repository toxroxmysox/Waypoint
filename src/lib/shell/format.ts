export function titleCase(s: string): string {
	return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatTime(t: string): string {
	if (!t) return '';
	const timePart = t.includes('T') ? t.split('T')[1] : t.includes(' ') ? t.split(' ')[1] : t;
	const [h, m] = timePart.split(':');
	const hour = parseInt(h, 10);
	const ampm = hour >= 12 ? 'PM' : 'AM';
	const h12 = hour % 12 || 12;
	return `${h12}:${m} ${ampm}`;
}

export function timeToDatetime(time: string): string {
	if (!time) return '';
	return `1970-01-01 ${time}:00.000Z`;
}

export function datetimeToTime(dt: string): string {
	if (!dt) return '';
	const match = dt.match(/(\d{2}:\d{2})/);
	return match ? match[1] : '';
}

export function formatTimeRange(start: string, end: string): string {
	if (!start && !end) return '';
	if (start && end) return `${formatTime(start)} – ${formatTime(end)}`;
	return formatTime(start || end);
}

export function formatCountdown(minutes: number): string {
	if (minutes <= 0) return '< 1m';
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h === 0) return `${m}m`;
	if (m === 0) return `${h}h`;
	return `${h}h ${m}m`;
}

/** "Jun 18 → Jun 22" from two 'YYYY-MM-DD' (or stored datetime) strings. */
export function formatDateRange(start: string, end: string): string {
	if (!start || !end) return '';
	const fmt = (s: string) =>
		new Date(`${s.split(/[T ]/)[0]}T00:00:00Z`).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	return `${fmt(start)} → ${fmt(end)}`;
}

/**
 * Format a stored calendar day for display. Accepts 'YYYY-MM-DD' or the stored
 * day shape ('YYYY-MM-DD 00:00:00.000Z' / ISO). Calendar days are UTC midnight, so
 * they MUST be formatted in UTC — in the viewer's local zone a viewer west of UTC
 * sees every day one day early (#393). Not for timestamps (created, decided_at):
 * those are real instants and format in local time.
 */
export function formatCalendarDate(day: string, options: Intl.DateTimeFormatOptions): string {
	if (!day) return '';
	return new Date(`${day.split(/[T ]/)[0]}T00:00:00Z`).toLocaleDateString('en-US', {
		...options,
		timeZone: 'UTC'
	});
}
