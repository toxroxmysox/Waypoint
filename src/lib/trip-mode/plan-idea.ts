import type { Item } from '$lib/types';
import { orderDayItems } from '$lib/itinerary/timeline';
import { rebalanceDayOrder } from '$lib/itinerary/sort-order';
import { isSpanning } from './spanning';

// #245 Door 1 — plan a parked idea onto TODAY, placed AFTER the current
// moment. NO new `replan` module (PRD §7): this composes the existing shared
// core — `orderDayItems` (the ONE day-display-order definition) and
// `rebalanceDayOrder` (the same whole-day renumber `pullToPlan`/the timeline
// reorder use). The server action assigns `day` + `status: planned` via
// `computeMovePatch`, then applies the `sort_order` updates this returns.
//
// Why a whole-day rebalance and not a single midpoint write: a planned idea is
// UNTIMED, and `orderDayItems` weaves untimed items against timed anchors by
// `sort_order` — but a timed item's `sort_order` bears no relation to its clock
// position, so a midpoint of two timed neighbours' `sort_order` re-weaves
// elsewhere (the "snaps back to the top" scar, #237). Renumbering the whole day
// in the desired display order makes the idea's `sort_order` fall between its
// on-screen neighbours so `orderDayItems` round-trips the placement. Pure — no IO.

function parseDateTime(dt: string): Date {
	if (!dt) return new Date(0);
	return new Date(dt.replace(' ', 'T'));
}

const isMultiDay = isSpanning; // #498 — flights with an end_date stay discrete

/**
 * Display order for today with `planned` slotted in right AFTER the current
 * moment. "After the current moment" = after every item whose `start_time` is
 * at/before `now` (the items already begun/done), and before the still-upcoming
 * ones — so the idea lands at the front of "what's left", not buried at day's end
 * nor jumped above things already happening. Timed items keep their clock order
 * (`orderDayItems` always re-sorts them by `start_time`); the planned untimed
 * idea is positioned relative to them by this display order.
 */
export function plannedDisplayOrder(dayItems: Item[], planned: Item, now: Date): Item[] {
	const t = now.getTime();
	// The day's existing items in canonical display order, excluding multi-day
	// banners (they never carry day `sort_order`) and the planned idea itself
	// (it may already be in the array if the caller attached it first).
	const ordered = orderDayItems(dayItems.filter((i) => !isMultiDay(i) && i.id !== planned.id));

	// Insert after the last item that has already started (at/before now). Untimed
	// items (no start_time) count as "not yet anchored" → they sit after the
	// insertion point, so the freshly planned idea leads the open part of the day.
	let insertIdx = 0;
	ordered.forEach((item, i) => {
		if (item.start_time && parseDateTime(item.start_time).getTime() <= t) {
			insertIdx = i + 1;
		}
	});

	const result = ordered.slice();
	result.splice(insertIdx, 0, planned);
	return result;
}

/**
 * The `sort_order` updates that place `planned` after the current moment among
 * `dayItems`. Returns one update per day item (a whole-day rebalance) — apply
 * each via `items.update(id, { sort_order })`. The caller assigns the idea's
 * `day`/`status` separately (via `computeMovePatch`). Pure.
 */
export function planPlacement(
	dayItems: Item[],
	planned: Item,
	now: Date
): { id: string; sort_order: number }[] {
	const order = plannedDisplayOrder(dayItems, planned, now);
	return rebalanceDayOrder(order);
}
