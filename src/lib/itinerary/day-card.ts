import type { Item, Day } from '$lib/types';
import { needsBooking } from './booking-projection';
import { toDateOnly, spanningItemsForDate } from './multi-day';
import { orderDayItems } from './timeline';

// Day-card content per CARD_CONTENT_SPEC §1. One flat item list in, per-day
// summaries out — the trip overview rides a single fetch (no N+1), and Phase
// Detail reuses the same logic over its already-loaded phase items.

export type StayKind = 'check-in' | 'staying' | 'check-out';

export interface StayChip {
	kind: StayKind;
	/** Lodging title. */
	name: string;
}

export interface DayCardSummary {
	/** Sole fullness signal: timed + untimed day items, excludes multi-day banners. */
	itemCount: number;
	/** Items already booked. */
	bookedCount: number;
	/** Items that can be booked (booked + still-needs-booking). */
	bookableCount: number;
	/** Σ cost_estimate_usd over the day's items. */
	budgetTotal: number;
	/** State-change chips for this date: check-in and check-out only (never 'staying'). Empty when no state changes. */
	stays: StayChip[];
	/**
	 * Title of the day's first item in itinerary order (#355) — what the card
	 * leads with when the day has no notes. '' when the day has no items, or
	 * (unreachable via PB, where items.title is required min:1) when every item
	 * is blank-titled.
	 */
	leadTitle: string;
}

/** Day-scoped, non-banner items for a day: `day === id && end_date === ''`. */
function dayItemsFor(items: Item[], dayId: string): Item[] {
	return items.filter((i) => i.day === dayId && toDateOnly(i.end_date ?? '') === '');
}

export function summarizeDay(items: Item[], days: Day[], day: Day): DayCardSummary {
	const own = dayItemsFor(items, day.id);

	const bookedCount = own.filter((i) => i.booked === true).length;
	const bookableCount = own.filter((i) => i.booked === true || needsBooking(i)).length;
	const budgetTotal = own.reduce((sum, i) => sum + (i.cost_estimate_usd || 0), 0);

	const date = toDateOnly(day.date);
	const lodging = spanningItemsForDate(
		items.filter((i) => i.type === 'lodging'),
		days,
		date
	);
	const stays: StayChip[] = [];
	for (const it of lodging) {
		const start = it.day ? toDateOnly(days.find((d) => d.id === it.day)?.date ?? '') : '';
		const end = toDateOnly(it.end_date ?? '');
		const kind: StayKind = date === start ? 'check-in' : date === end ? 'check-out' : 'staying';
		if (kind !== 'staying') {
			stays.push({ kind, name: it.title });
		}
	}

	// First *titled* item in itinerary order — an untitled item shouldn't make a
	// non-empty day read as empty.
	const leadTitle = orderDayItems(own).find((i) => i.title?.trim())?.title.trim() ?? '';

	return { itemCount: own.length, bookedCount, bookableCount, budgetTotal, stays, leadTitle };
}

/** Per-day summaries keyed by day id, for a whole trip's (or phase's) items. */
export function summarizeDays(items: Item[], days: Day[]): Record<string, DayCardSummary> {
	const out: Record<string, DayCardSummary> = {};
	for (const day of days) out[day.id] = summarizeDay(items, days, day);
	return out;
}
