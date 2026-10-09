import type { Item, Day } from '$lib/types';
import { formatClock, formatCalendarDate } from '$lib/shell/format';

/** Extract 'YYYY-MM-DD' from a stored date/datetime string. '' if empty. */
export function toDateOnly(s: string): string {
	if (!s) return '';
	return s.split(/[T ]/)[0];
}

function startDateOf(item: Item, dayById: Map<string, Day>): string {
	const d = item.day ? dayById.get(item.day) : undefined;
	return d ? toDateOnly(d.date) : '';
}

function daysBetween(a: string, b: string): number {
	const ms = new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
	return Math.round(ms / 86_400_000);
}

/** True when the item has an end_date strictly after its start day's date. */
export function isMultiDay(item: Item, days: Day[]): boolean {
	return itemDateRange(item, days) !== null;
}

/** Inclusive { start, end } calendar range (YYYY-MM-DD), or null if not multi-day. */
export function itemDateRange(item: Item, days: Day[]): { start: string; end: string } | null {
	const dayById = new Map(days.map((d) => [d.id, d]));
	const start = startDateOf(item, dayById);
	const end = toDateOnly(item.end_date ?? '');
	if (!start || !end || end <= start) return null;
	return { start, end };
}

/** Multi-day items whose [start, end] range includes targetDate ('YYYY-MM-DD'). */
export function spanningItemsForDate(items: Item[], days: Day[], targetDate: string): Item[] {
	return sortSpans(
		items.filter((item) => {
			const range = itemDateRange(item, days);
			return range !== null && range.start <= targetDate && targetDate <= range.end;
		}),
		days
	);
}

/**
 * Span bands in a stable, chronological order: earliest start date, then start
 * time (untimed after timed on the same day), then title. Loaders can't do this
 * in the query — `sort: 'day'` orders by the day's random id.
 */
export function sortSpans(items: Item[], days: Day[]): Item[] {
	const key = (i: Item) => itemDateRange(i, days)?.start ?? '';
	const time = (i: Item) => String(i.start_time ?? '') || '~';
	return [...items].sort(
		(a, b) =>
			key(a).localeCompare(key(b)) ||
			time(a).localeCompare(time(b)) ||
			(a.title ?? '').localeCompare(b.title ?? '')
	);
}

/** 'night X of N' for a spanned target date. total = number of nights. null if not multi-day. */
export function nightInfo(
	item: Item,
	days: Day[],
	targetDate: string
): { night: number; total: number } | null {
	const range = itemDateRange(item, days);
	if (!range) return null;
	const total = daysBetween(range.start, range.end);
	const night = Math.min(daysBetween(range.start, targetDate) + 1, total);
	return { night, total };
}

export type SpanPhase = 'first' | 'middle' | 'last';

/**
 * The Span band's one line for a spanned date (#423; spec §Span, CARD_SYSTEM D10/D11).
 *  - stay (lodging):          `Check-in 3:00p · 3 nights` · `Night 2 of 3 · check-out Sat by 11:00a` · `Check-out by 11:00a`
 *  - rental (transportation): `Pick up 10:00a` · `Day 2 of 5 · return Sun by 12:00p` · `Return by 12:00p`
 *  - anything else:           `Starts` · `Day 2 of 5 · ends Sun` · `Ends` (neutral; the spec names only the two above)
 * Times come from the stored wall clock (`start_time` on the first day, `end_time`
 * on the last) and drop out when absent. The check-out weekday is a calendar date,
 * formatted in UTC (#393). null when the item isn't multi-day.
 */
export function spanBandText(
	item: Item,
	days: Day[],
	targetDate: string
): { phase: SpanPhase; text: string } | null {
	const range = itemDateRange(item, days);
	if (!range) return null;
	const nights = daysBetween(range.start, range.end);
	const phase: SpanPhase =
		targetDate <= range.start ? 'first' : targetDate >= range.end ? 'last' : 'middle';
	const start = formatClock(item.start_time ?? '');
	const end = formatClock(item.end_time ?? '');
	const join = (...parts: string[]) => parts.filter(Boolean).join(' ');
	const lodging = item.type === 'lodging';
	const rental = item.type === 'transportation';
	const startWord = lodging ? 'Check-in' : rental ? 'Pick up' : 'Starts';
	const endWord = lodging ? 'Check-out' : rental ? 'Return' : 'Ends';

	if (phase === 'first') {
		const lead = join(startWord, start);
		return { phase, text: lodging ? `${lead} · ${nights} ${nights === 1 ? 'night' : 'nights'}` : lead };
	}
	if (phase === 'last') return { phase, text: join(endWord, end ? `by ${end}` : '') };
	const weekday = formatCalendarDate(range.end, { weekday: 'short' });
	const idx = daysBetween(range.start, targetDate);
	const count = lodging ? `Night ${idx + 1} of ${nights}` : `Day ${idx + 1} of ${nights + 1}`;
	return { phase, text: `${count} · ${endWord.toLowerCase()} ${join(weekday, end ? `by ${end}` : '')}` };
}
