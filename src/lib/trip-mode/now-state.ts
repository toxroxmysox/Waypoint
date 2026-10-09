import type { Item } from '$lib/types';
import type { NowViewState, NowFeed } from './types';
import { orderDayItems } from '$lib/itinerary/timeline';

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

/**
 * Every ongoing same-day timed item (#430: each one gets a Hero). Order: items
 * the viewer is going to (their trip_members id in `assigned_to`) first, then
 * everyone else's; each group by start time, then end time.
 */
function findOngoingItems(items: Item[], now: Date, viewerMemberId: string): Item[] {
	const t = now.getTime();
	const isMine = (i: Item) => !!viewerMemberId && (i.assigned_to ?? []).includes(viewerMemberId);
	return items
		.filter((i) => {
			if (isMultiDay(i)) return false;
			if (!i.start_time || !i.end_time) return false;
			return parseDateTime(i.start_time).getTime() <= t && t < parseDateTime(i.end_time).getTime();
		})
		.sort(
			(a, b) =>
				Number(isMine(b)) - Number(isMine(a)) ||
				parseDateTime(a.start_time).getTime() - parseDateTime(b.start_time).getTime() ||
				parseDateTime(a.end_time).getTime() - parseDateTime(b.end_time).getTime()
		);
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
	hasToday: boolean,
	viewerMemberId = ''
): NowViewState {
	if (!hasToday) return { focus: { kind: 'no-day' }, forwardItems: [] };

	const heroes = findOngoingItems(todayItems, now, viewerMemberId);
	const forwardItems = upcomingItems(todayItems, now);

	if (heroes.length > 0) {
		const currentItem = heroes[0];
		const minutesRemaining = minutesBetween(now, parseDateTime(currentItem.end_time));
		return { focus: { kind: 'mid-event', heroes, currentItem, minutesRemaining }, forwardItems };
	}

	if (forwardItems.length > 0) {
		const nextItem = forwardItems[0];
		const minutesUntilNext = minutesBetween(now, parseDateTime(nextItem.start_time));
		return { focus: { kind: 'free-time', nextItem, minutesUntilNext }, forwardItems };
	}

	// Nothing ahead. The cutoff only decides how this empty state reads.
	if (now.getUTCHours() >= CUTOFF_HOUR) {
		// Count what was PLANNED for today, not a done-count: done is assigned at
		// Closeout and no Trip-Mode surface can move it, so "0 of N done" all day
		// was a lie (#199). The summary reads "N things on today's plan".
		const counted = todayItems.filter((i) => !isMultiDay(i));
		return {
			focus: { kind: 'wrapped-summary', totalCount: counted.length },
			forwardItems: []
		};
	}

	return { focus: { kind: 'nothing-else-planned' }, forwardItems: [] };
}

/** Timed same-day items that have already ended, earliest first. */
function pastItems(items: Item[], now: Date): Item[] {
	const t = now.getTime();
	return items
		.filter((i) => !isMultiDay(i) && !!i.end_time && parseDateTime(i.end_time).getTime() <= t)
		.sort((a, b) => parseDateTime(a.start_time).getTime() - parseDateTime(b.start_time).getTime());
}

/**
 * The merged Now feed (#244): the whole of today split into exactly THREE visual
 * weights, top → bottom.
 *   - `pastItems`   — timed items already ended (faded peek, revealed on scroll-up)
 *   - `focus`       — the live state (mid-event / free-time / nothing / wrapped)
 *   - `restItems`   — everything else still relevant: forward TIMED items woven
 *                     with ALL UNTIMED items by sort_order (normal-weight cards).
 *
 * Untimed items are the reason this exists: the old Now filtered to timed-only,
 * so a promoted (untimed) idea never rendered. The merge surfaces them here.
 *
 * In mid-event the Focus holds a Hero per ongoing item (#430: mine first, then by
 * start) and none of them is in `restItems`.
 * In free-time / nothing-else / wrapped the Focus is a countdown/summary CARD
 * (not an item), so the next item stays as the first `restItems` row. Pure (no IO).
 */
export function getNowFeed(
	todayItems: Item[],
	now: Date,
	hasToday: boolean,
	viewerMemberId = ''
): NowFeed {
	const view = getNowViewState(todayItems, now, hasToday, viewerMemberId);

	if (!hasToday) {
		return { focus: view.focus, pastItems: [], restItems: [] };
	}

	const past = pastItems(todayItems, now);

	// Every Hero (ongoing item) must not double-render in the rest. They have
	// started, so `forwardItems` already omits them; this is a belt-and-braces guard.
	const heroIds = new Set(view.focus.kind === 'mid-event' ? view.focus.heroes.map((i) => i.id) : []);

	// Untimed, non-spanning items always belong to the rest (they're never past:
	// no time pins them, and Trip Mode can't set 'done' — that's Closeout's).
	const untimed = todayItems.filter((i) => !isMultiDay(i) && !i.start_time);

	// Forward timed items minus the Focus's ongoing item. `view.forwardItems` is
	// already the timed, not-yet-started, multi-day-excluded set, earliest first.
	const forwardTimed = view.forwardItems.filter((i) => !heroIds.has(i.id));

	// Weave forward-timed + untimed into one display order (the #120 shared core).
	const restItems = orderDayItems([...forwardTimed, ...untimed]);

	return { focus: view.focus, pastItems: past, restItems };
}
