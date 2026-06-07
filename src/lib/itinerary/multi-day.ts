import type { Item, Day } from '$lib/types';

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
	return items.filter((item) => {
		const range = itemDateRange(item, days);
		return range !== null && range.start <= targetDate && targetDate <= range.end;
	});
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
