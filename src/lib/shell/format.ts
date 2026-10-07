import { timeShape, type TimeFields } from '$lib/itinerary/timeline';
import type { ItemType } from '$lib/itinerary/types';

export function titleCase(s: string): string {
	return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** @deprecated The legacy "6:30 PM" form. Card surfaces use `formatClock` / `formatTimeText` (#419 time grammar). */
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

/** @deprecated The legacy "6:30 PM – 8:00 PM" form. Card surfaces use `formatTimeText` / `railTimeLabels` (#419 time grammar). */
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

// --- The card time grammar (#419; spec §Time grammar, CARD_SYSTEM D5/D9/D11) ---
// The legacy `formatTime` ("6:30 PM") above stays until each surface moves to
// this grammar in its own ticket.

/**
 * `6:30p` / `10:30a`: the colon stays, the space and the "m" go. Reads the wall
 * clock straight from the stored string ('YYYY-MM-DD HH:MM:SS.sssZ', ISO, or a
 * bare 'HH:MM'), never through `Date`, so no zone can shift it. '' for ''.
 */
export function formatClock(t: string): string {
	if (!t) return '';
	const timePart = t.includes('T') ? t.split('T')[1] : t.includes(' ') ? t.split(' ')[1] : t;
	// A date-only or malformed string has no clock: '' rather than a throw.
	const clock = /^(\d{1,2}):(\d{2})/.exec(timePart ?? '');
	if (!clock) return '';
	const hour = parseInt(clock[1], 10);
	return `${hour % 12 || 12}:${clock[2]}${hour >= 12 ? 'p' : 'a'}`;
}

/**
 * A calendar day as `Thu Oct 1` (no comma) from 'YYYY-MM-DD' or a stored
 * 'YYYY-MM-DD 00:00:00.000Z'. Goes through `formatCalendarDate`, so it formats in
 * UTC: a calendar-day date is not an instant (#393). Built from parts because
 * Intl's en-US weekday form adds a comma. '' for ''.
 */
export function formatDayDate(date: string): string {
	if (!date) return '';
	const part = (opts: Intl.DateTimeFormatOptions) => formatCalendarDate(date, opts);
	return `${part({ weekday: 'short' })} ${part({ month: 'short' })} ${part({ day: 'numeric' })}`;
}

/**
 * The text form of an item's time, for shapes without a rail (Row, Hero, Span):
 * start-only `9:30p`, range `10:00a–12:00p`, deadline `by 4:30p`, untimed ''.
 * A flight's range reads `2:05p → 4:20p`. In text an end never appears without
 * `by`. With `opts.date` (a calendar day), the date leads: `Thu Oct 1 · 6:30p`,
 * or the date alone when untimed.
 */
export function formatTimeText(
	item: TimeFields & { type?: ItemType },
	opts: { date?: string } = {}
): string {
	const start = formatClock(item.start_time ?? '');
	const end = formatClock(item.end_time ?? '');
	const time = {
		untimed: '',
		'start-only': start,
		range: item.type === 'flight' ? `${start} → ${end}` : `${start}–${end}`,
		'end-only': `by ${end}`
	}[timeShape(item)];
	const date = formatDayDate(opts.date ?? '');
	return [date, time].filter(Boolean).join(' · ');
}

/**
 * The Timeline Rail's labels: the start on the card's top edge, the end on its
 * bottom edge. A deadline is a plain bottom label, with no `by` on the rail (D9).
 * '' where the shape has no time for that edge.
 */
export function railTimeLabels(item: TimeFields): { top: string; bottom: string } {
	const shape = timeShape(item);
	return {
		top: shape === 'range' || shape === 'start-only' ? formatClock(item.start_time ?? '') : '',
		bottom: shape === 'range' || shape === 'end-only' ? formatClock(item.end_time ?? '') : ''
	};
}
