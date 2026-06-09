import type { Item } from '$lib/types';
import type { NowViewState } from './types';

function parseDateTime(dt: string): Date {
	if (!dt) return new Date(0);
	return new Date(dt.replace(' ', 'T'));
}

/**
 * Multi-day items (e.g. a rental car spanning several days, lodging) carry an
 * `end_date`. They run in the background and are surfaced separately as ongoing
 * banners (mirroring Today, whose timeline loads only `end_date = ""` items).
 * They must not be treated as the discrete "right now" event — otherwise their
 * far-future `end_time` both hijacks the current-item pick (#82) and drives a
 * trip-length "92h remaining" countdown (#83).
 */
function isMultiDay(i: Item): boolean {
	return !!i.end_date && i.end_date.trim() !== '';
}

function findCurrentItem(items: Item[], now: Date): Item | null {
	const ongoing = items.filter((i) => {
		if (isMultiDay(i)) return false;
		if (!i.start_time || !i.end_time) return false;
		const start = parseDateTime(i.start_time).getTime();
		const end = parseDateTime(i.end_time).getTime();
		return now.getTime() >= start && now.getTime() < end;
	});
	if (ongoing.length === 0) return null;
	return ongoing.sort(
		(a, b) => parseDateTime(b.end_time).getTime() - parseDateTime(a.end_time).getTime()
	)[0];
}

function findNextTimedItem(items: Item[], now: Date): Item | null {
	return items
		.filter((i) => i.start_time && parseDateTime(i.start_time).getTime() > now.getTime())
		.sort((a, b) => parseDateTime(a.start_time).getTime() - parseDateTime(b.start_time).getTime())
		[0] ?? null;
}

function minutesBetween(from: Date, to: Date): number {
	return Math.round((to.getTime() - from.getTime()) / 60000);
}

export function getNowViewState(
	todayItems: Item[],
	now: Date,
	hasToday: boolean
): NowViewState {
	if (!hasToday) return { kind: 'no-day' };

	const hour = now.getUTCHours();
	const isPast10pm = hour >= 22;

	const totalCount = todayItems.length;
	const completedCount = todayItems.filter((i) => i.status === 'done').length;

	if (isPast10pm || totalCount === 0) {
		return { kind: 'day-wrapped', completedCount, totalCount };
	}

	const currentItem = findCurrentItem(todayItems, now);

	if (currentItem) {
		const minutesRemaining = minutesBetween(now, parseDateTime(currentItem.end_time));
		const nextItem = findNextTimedItem(todayItems, now);
		return { kind: 'mid-event', currentItem, nextItem, tomorrowFirstItem: null, minutesRemaining };
	}

	const nextItem = findNextTimedItem(todayItems, now);

	if (nextItem) {
		const minutesUntilNext = minutesBetween(now, parseDateTime(nextItem.start_time));
		return { kind: 'between-things', nextItem, minutesUntilNext };
	}

	return { kind: 'day-wrapped', completedCount, totalCount };
}
