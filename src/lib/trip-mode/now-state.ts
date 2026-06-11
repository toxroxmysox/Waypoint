import type { Item } from '$lib/types';
import type { NowViewState } from './types';

/**
 * Evening cutoff (trip-local hour). It does NOT hide upcoming items — it ONLY
 * decides how an *empty* forward list reads: before → "nothing else planned",
 * at/after → wrapped done-count summary. day-wrapped triggers on nothing-ahead,
 * never on the clock alone (#121 grill: a 9pm dinner keeps Focus at 8:30).
 */
const CUTOFF_HOUR = 20; // 8pm

function parseDateTime(dt: string): Date {
	if (!dt) return new Date(0);
	return new Date(dt.replace(' ', 'T'));
}

/**
 * Multi-day items (rental car, lodging) carry an `end_date`. They run in the
 * background and surface separately as ongoing banners (the loader provides
 * them). They must never be the discrete Focus pick — otherwise their far-future
 * `end_time` hijacks the current-item choice (#82) and drives a trip-length
 * countdown (#83) — nor a forward-list row.
 */
function isMultiDay(i: Item): boolean {
	return !!i.end_date && i.end_date.trim() !== '';
}

/** The ongoing same-day timed item (latest end_time wins when several overlap). */
function findCurrentItem(items: Item[], now: Date): Item | null {
	const t = now.getTime();
	const ongoing = items.filter((i) => {
		if (isMultiDay(i)) return false;
		if (!i.start_time || !i.end_time) return false;
		return parseDateTime(i.start_time).getTime() <= t && t < parseDateTime(i.end_time).getTime();
	});
	if (ongoing.length === 0) return null;
	return ongoing.sort(
		(a, b) => parseDateTime(b.end_time).getTime() - parseDateTime(a.end_time).getTime()
	)[0];
}

/** Same-day timed items that have not yet started, earliest first. */
function upcomingItems(items: Item[], now: Date): Item[] {
	const t = now.getTime();
	return items
		.filter((i) => !isMultiDay(i) && !!i.start_time && parseDateTime(i.start_time).getTime() > t)
		.sort((a, b) => parseDateTime(a.start_time).getTime() - parseDateTime(b.start_time).getTime());
}

function minutesBetween(from: Date, to: Date): number {
	return Math.round((to.getTime() - from.getTime()) / 60000);
}

/**
 * Derive the Now view state from today's items and the trip-local moment.
 * `todayItems` is today-only; `now` is a trip-local-as-UTC Date (see
 * trip-time.ts `tripNow`). Pure — no IO.
 */
export function getNowViewState(
	todayItems: Item[],
	now: Date,
	hasToday: boolean
): NowViewState {
	if (!hasToday) return { focus: { kind: 'no-day' }, forwardItems: [] };

	const currentItem = findCurrentItem(todayItems, now);
	const forwardItems = upcomingItems(todayItems, now);

	if (currentItem) {
		const minutesRemaining = minutesBetween(now, parseDateTime(currentItem.end_time));
		return { focus: { kind: 'mid-event', currentItem, minutesRemaining }, forwardItems };
	}

	if (forwardItems.length > 0) {
		const nextItem = forwardItems[0];
		const minutesUntilNext = minutesBetween(now, parseDateTime(nextItem.start_time));
		return { focus: { kind: 'free-time', nextItem, minutesUntilNext }, forwardItems };
	}

	// Nothing ahead. The cutoff only decides how this empty state reads.
	if (now.getUTCHours() >= CUTOFF_HOUR) {
		const counted = todayItems.filter((i) => !isMultiDay(i));
		const completedCount = counted.filter((i) => i.status === 'done').length;
		return {
			focus: { kind: 'wrapped-summary', completedCount, totalCount: counted.length },
			forwardItems: []
		};
	}

	return { focus: { kind: 'nothing-else-planned' }, forwardItems: [] };
}
