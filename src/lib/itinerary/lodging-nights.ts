import type { Day, Item } from '$lib/types';
import { itemDateRange, toDateOnly } from './multi-day';

// #537 — the one definition of "which lodging covers the night of date d".
// The AI audit (no_lodging), get_trip, trip_brief and Phase Detail's Staying
// row all read it, so they can't disagree. A stay covers [check-in, check-out);
// a lodging with no end date is a one-night stay on its day; a `considered`
// item is an abandoned option and covers nothing.

export function coversNight(item: Item, days: Day[], date: string): boolean {
	if (item.type !== 'lodging' || item.status === 'considered' || !item.day) return false;
	const r = itemDateRange(item, days);
	if (r) return r.start <= date && date < r.end;
	if (toDateOnly(item.end_date ?? '')) return false; // end on/before start: malformed, not a stay
	const day = days.find((d) => d.id === item.day);
	return !!day && toDateOnly(day.date) === date;
}

/** Lodging the group sleeps in on night `date`. */
export function lodgingForNight(items: Item[], days: Day[], date: string): Item[] {
	return items.filter((l) => coversNight(l, days, date));
}

/** Every trip day but the last is a night. */
export const nightsOf = (days: Day[]) => days.slice(0, -1).map((d) => toDateOnly(d.date));
