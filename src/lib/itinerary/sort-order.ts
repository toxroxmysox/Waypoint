export const GAP = 100;

export function nextSortOrder(existing: number[]): number {
	if (existing.length === 0) return GAP;
	return Math.max(...existing) + GAP;
}

export function insertBetween(before: number | null, after: number | null): number | null {
	if (before === null && after === null) return GAP;
	if (before === null) return Math.floor(after! / 2);
	if (after === null) return before + GAP;

	const mid = Math.floor((before + after) / 2);
	if (mid <= before) return null;
	return mid;
}

export function rebalance(ids: string[]): { id: string; sort_order: number }[] {
	return ids.map((id, i) => ({ id, sort_order: (i + 1) * GAP }));
}

/**
 * Rebalance an ENTIRE day so its stored `sort_order` matches the given display
 * order — gap-based, monotonic, collision-free. `displayOrder` is the day's
 * items (timed AND untimed) in the order they should appear, e.g. the flat list
 * svelte-dnd-action hands back after a drop (#237).
 *
 * Why a whole-day rebalance and not a single-item `sort_order` write: an untimed
 * item dropped between two TIMED items can't be positioned by writing one
 * midpoint `sort_order`. `orderDayItems` weaves untimed items by `sort_order`
 * against each timed anchor's `sort_order`, but a timed item's `sort_order` bears
 * no relation to its clock position — so a midpoint of two timed neighbors'
 * `sort_order` doesn't reproduce the drop (the item re-weaves elsewhere — the
 * "snaps back to the top" bug). Renumbering the whole day in display order makes
 * every untimed item's `sort_order` fall between its on-screen neighbors' —
 * including timed ones — so `orderDayItems` round-trips the exact dropped order.
 * Timed items keep their clock order regardless (`orderDayItems` always re-sorts
 * them by `start_time`); the day timeline binds `orderDayItems`/`buildTimelineFlat`
 * output, so `displayOrder` already has timed items clock-sorted and the
 * renumbering stays consistent with that.
 *
 * Pure — the server action applies the returned updates.
 */
export function rebalanceDayOrder(
	displayOrder: { id: string }[]
): { id: string; sort_order: number }[] {
	return rebalance(displayOrder.map((i) => i.id));
}

/**
 * Compute the `sort_order` updates that place `movedId` between the `before`/
 * `after` neighbor orders within `ordered` (the affected items in their current
 * stored order, by `sort_order`). Returns either a single-item update (a gap is
 * available) or a full rebalance of the list with the moved item spliced into
 * position (the gap collapsed). Pure — the server action applies the updates.
 *
 * Mirrors the day-timeline reorder fallback; lifted here so the phase parking-lot
 * reorder (#88) consumes the same logic instead of forking it.
 */
export function reorderUpdates(
	ordered: { id: string; sort_order: number }[],
	movedId: string,
	before: number | null,
	after: number | null
): { id: string; sort_order: number }[] {
	const newOrder = insertBetween(before, after);
	if (newOrder !== null) {
		return [{ id: movedId, sort_order: newOrder }];
	}

	// Gap collapsed — rebalance the whole list with `movedId` spliced into place.
	const orderedIds = ordered.filter((i) => i.id !== movedId).map((i) => i.id);
	let insertIdx = orderedIds.length;
	if (after !== null) {
		const afterIdx = orderedIds.findIndex(
			(id) => ordered.find((i) => i.id === id)?.sort_order === after
		);
		if (afterIdx >= 0) insertIdx = afterIdx;
	} else if (before !== null) {
		const beforeIdx = orderedIds.findIndex(
			(id) => ordered.find((i) => i.id === id)?.sort_order === before
		);
		if (beforeIdx >= 0) insertIdx = beforeIdx + 1;
	}
	orderedIds.splice(insertIdx, 0, movedId);
	return rebalance(orderedIds);
}
