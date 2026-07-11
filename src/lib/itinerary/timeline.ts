import type { Item } from '$lib/types';

export interface TimelineItemEntry {
	kind: 'item';
	item: Item;
	anchored: boolean;
}

export interface TimelineDividerEntry {
	kind: 'divider';
	label: 'Morning' | 'Afternoon' | 'Evening';
}

export type TimelineEntry = TimelineItemEntry | TimelineDividerEntry;

function parseTime(dt: string): Date {
	if (!dt) return new Date(0);
	return new Date(dt.replace(' ', 'T'));
}

/**
 * An item's effective anchor time (#346): its start_time if timed, else its
 * end_time — an end-only item is a deadline ("back by 6"), anchored AT its end.
 * '' when neither is set (a flowing, sort_order-woven item).
 */
export function itemAnchorTime(item: { start_time?: string; end_time?: string }): string {
	return item.start_time || item.end_time || '';
}

/** Whether an item joins the timed spine — true when it has a start OR an end (#346). */
export function isAnchored(item: { start_time?: string; end_time?: string }): boolean {
	return !!(item.start_time || item.end_time);
}

function getTimeSlot(dt: string): 'morning' | 'afternoon' | 'evening' {
	const hour = parseTime(dt).getUTCHours();
	if (hour < 12) return 'morning';
	if (hour < 17) return 'afternoon';
	return 'evening';
}

const SLOT_LABELS: Record<string, 'Morning' | 'Afternoon' | 'Evening'> = {
	morning: 'Morning',
	afternoon: 'Afternoon',
	evening: 'Evening',
};

/** The minimum an item needs for single-day itinerary ordering. */
export interface DayOrderable {
	start_time: string;
	/** Optional end anchor (#346) — end-only items order by this. */
	end_time?: string;
	sort_order: number;
}

/**
 * Flat itinerary order for one day's items (no dividers): timed items by
 * start_time, untimed items woven in by sort_order — an untimed item lands
 * before the first anchor whose sort_order it precedes, otherwise trails. Pure
 * (no mutation). Shared by `buildTimeline` and the Swipe-Quiz deck's
 * planned-item ordering (#120) so both present a day the same way.
 */
export function orderDayItems<T extends DayOrderable>(items: T[]): T[] {
	const anchored = items
		.filter((i) => isAnchored(i))
		.sort((a, b) => parseTime(itemAnchorTime(a)).getTime() - parseTime(itemAnchorTime(b)).getTime());

	const untimed = items
		.filter((i) => !isAnchored(i))
		.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

	const result: T[] = [];
	let untimedIdx = 0;

	for (const anchor of anchored) {
		const anchorOrder = anchor.sort_order ?? 0;
		while (untimedIdx < untimed.length && (untimed[untimedIdx].sort_order ?? 0) < anchorOrder) {
			result.push(untimed[untimedIdx++]);
		}
		result.push(anchor);
	}

	while (untimedIdx < untimed.length) {
		result.push(untimed[untimedIdx++]);
	}

	return result;
}

export function buildTimeline(items: Item[]): TimelineEntry[] {
	if (items.length === 0) return [];

	const ordered = orderDayItems(items);
	const entries: TimelineEntry[] = ordered.map((item) => ({
		kind: 'item' as const,
		item,
		anchored: isAnchored(item)
	}));

	return insertDividers(entries);
}

function insertDividers(entries: TimelineEntry[]): TimelineEntry[] {
	if (entries.length === 0) return entries;

	const result: TimelineEntry[] = [];
	let lastSlot: string | null = null;

	for (const entry of entries) {
		if (entry.kind === 'item' && entry.anchored && itemAnchorTime(entry.item)) {
			const slot = getTimeSlot(itemAnchorTime(entry.item));
			if (lastSlot !== null && slot !== lastSlot) {
				result.push({ kind: 'divider', label: SLOT_LABELS[slot] });
			}
			lastSlot = slot;
		}
		result.push(entry);
	}

	return result;
}

export interface FlatTimelineEntry {
	item: Item;
	anchored: boolean;
	slotLabel: 'Morning' | 'Afternoon' | 'Evening' | null;
}

/**
 * The day's items as a flat 1:1 list for `svelte-dnd-action` (#60). Same display
 * order as `buildTimeline` (which reuses `orderDayItems`, the #120 shared core),
 * but with the Morning/Afternoon/Evening divider rows folded into a per-item
 * `slotLabel` on the first item of each slot — so DOM children map 1:1 to the
 * bound array. Untimed items carry no label and `anchored: false`.
 */
export function buildTimelineFlat(items: Item[]): FlatTimelineEntry[] {
	const entries = buildTimeline(items);
	const result: FlatTimelineEntry[] = [];
	let pendingLabel: 'Morning' | 'Afternoon' | 'Evening' | null = null;
	let labeledFirstSlot = false;

	for (const entry of entries) {
		if (entry.kind === 'divider') {
			pendingLabel = entry.label;
			continue;
		}
		let slotLabel: FlatTimelineEntry['slotLabel'] = null;
		if (entry.anchored && itemAnchorTime(entry.item)) {
			if (pendingLabel) {
				slotLabel = pendingLabel;
				pendingLabel = null;
			} else if (!labeledFirstSlot) {
				slotLabel = SLOT_LABELS[getTimeSlot(itemAnchorTime(entry.item))];
			}
			labeledFirstSlot = true;
		}
		result.push({ item: entry.item, anchored: entry.anchored, slotLabel });
	}

	return result;
}

export function detectOverlaps(items: Item[]): Set<string> {
	const timed = items
		.filter((i) => i.start_time && i.end_time)
		.sort((a, b) => parseTime(a.start_time).getTime() - parseTime(b.start_time).getTime());

	const overlapping = new Set<string>();

	for (let i = 0; i < timed.length; i++) {
		for (let j = i + 1; j < timed.length; j++) {
			const endI = parseTime(timed[i].end_time).getTime();
			const startJ = parseTime(timed[j].start_time).getTime();
			if (startJ < endI) {
				overlapping.add(timed[i].id);
				overlapping.add(timed[j].id);
			} else {
				break;
			}
		}
	}

	return overlapping;
}
