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
		.filter((i) => i.start_time)
		.sort((a, b) => parseTime(a.start_time).getTime() - parseTime(b.start_time).getTime());

	const untimed = items
		.filter((i) => !i.start_time)
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
		anchored: !!item.start_time
	}));

	return insertDividers(entries);
}

function insertDividers(entries: TimelineEntry[]): TimelineEntry[] {
	if (entries.length === 0) return entries;

	const result: TimelineEntry[] = [];
	let lastSlot: string | null = null;

	for (const entry of entries) {
		if (entry.kind === 'item' && entry.anchored && entry.item.start_time) {
			const slot = getTimeSlot(entry.item.start_time);
			if (lastSlot !== null && slot !== lastSlot) {
				result.push({ kind: 'divider', label: SLOT_LABELS[slot] });
			}
			lastSlot = slot;
		}
		result.push(entry);
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
