import type { Item } from '$lib/types';
import type { NowViewState, NowFeed } from './types';
import { orderDayItems, timeShape, itemAnchorTime, isAnchored } from '$lib/itinerary/timeline';

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

const ms = (dt: string) => parseDateTime(dt).getTime();

/**
 * The Now buckets (#431, #392; spec §Now feed). Every non-multi-day item lands in
 * exactly ONE of three, decided by its time shape against trip-local `now`:
 *   - untimed    -> coming (no time pins it; never past)
 *   - range      -> coming before start, ongoing in [start, end), earlier from end
 *   - end-only   -> coming until its deadline passes, then earlier (no overdue state)
 *   - start-only -> coming before start; ongoing from start until the NEXT TIMED
 *                   ITEM starts (another non-multi-day item with a later start_time,
 *                   already begun), then earlier. A deadline has no start, so it
 *                   never ends one. With no later timed item it stays ongoing.
 * Multi-day items are in none: they are banners/Spans, never Heroes or rows.
 *
 * `ongoing` is ordered for Heroes: items the viewer is going to (their
 * trip_members id in `assigned_to`) first; each group by start, then end.
 */
function bucketNowItems(
	items: Item[],
	now: Date,
	viewerMemberId = ''
): { earlier: Item[]; ongoing: Item[]; coming: Item[] } {
	const t = now.getTime();
	const day = items.filter((i) => !isMultiDay(i));
	// Latest start among items that have already begun, per start-only check below.
	const begunStarts = day.filter((i) => !!i.start_time && ms(i.start_time) <= t);
	const earlier: Item[] = [];
	const ongoing: Item[] = [];
	const coming: Item[] = [];
	for (const i of day) {
		const shape = timeShape(i);
		if (shape === 'untimed') coming.push(i);
		else if (shape === 'end-only') (ms(i.end_time) > t ? coming : earlier).push(i);
		else if (ms(i.start_time) > t) coming.push(i);
		else if (shape === 'range') (t < ms(i.end_time) ? ongoing : earlier).push(i);
		else {
			const superseded = begunStarts.some((o) => ms(o.start_time) > ms(i.start_time));
			(superseded ? earlier : ongoing).push(i);
		}
	}
	const isMine = (i: Item) => !!viewerMemberId && (i.assigned_to ?? []).includes(viewerMemberId);
	ongoing.sort(
		(a, b) =>
			Number(isMine(b)) - Number(isMine(a)) ||
			ms(a.start_time) - ms(b.start_time) ||
			(a.end_time ? ms(a.end_time) : Infinity) - (b.end_time ? ms(b.end_time) : Infinity)
	);
	earlier.sort((a, b) => ms(itemAnchorTime(a)) - ms(itemAnchorTime(b)));
	return { earlier, ongoing, coming };
}

/** Coming-up items with a time (a start or a deadline), soonest first: the countdown targets. */
function forwardAnchored(coming: Item[]): Item[] {
	return coming
		.filter((i) => isAnchored(i))
		.sort((a, b) => ms(itemAnchorTime(a)) - ms(itemAnchorTime(b)));
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

	const { ongoing: heroes, coming } = bucketNowItems(todayItems, now, viewerMemberId);
	const forwardItems = forwardAnchored(coming);

	if (heroes.length > 0) {
		const currentItem = heroes[0];
		// A start-only Hero has no end to count down to.
		const minutesRemaining = currentItem.end_time
			? minutesBetween(now, parseDateTime(currentItem.end_time))
			: null;
		return { focus: { kind: 'mid-event', heroes, currentItem, minutesRemaining }, forwardItems };
	}

	// The countdown targets the next timed start OR deadline (#392).
	if (forwardItems.length > 0) {
		const nextItem = forwardItems[0];
		const minutesUntilNext = minutesBetween(now, parseDateTime(itemAnchorTime(nextItem)));
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

	// One pass, three disjoint buckets: Earlier today / ongoing (the Heroes in
	// `focus`) / Coming up. Coming up = forward timed + deadlines woven with ALL
	// untimed by sort_order (the #120 shared core).
	const { earlier, coming } = bucketNowItems(todayItems, now, viewerMemberId);
	return { focus: view.focus, pastItems: earlier, restItems: orderDayItems(coming) };
}
