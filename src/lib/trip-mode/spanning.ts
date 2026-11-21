import type { Item } from '$lib/types';

// #498 — what Now treats as a Span (banner) vs a discrete item (Hero, row, rail).
// Lodging and rental cars carry an `end_date` and run in the background. A flight
// also gets one when it lands on a later day (FlightLookup), but a red-eye is
// still one timed item: it stays discrete so it can be the Hero or a rail card.

/** Shows as a Span (banner, CONTEXT.md Card Shape): a background Multi-day Item. Never a Hero or a forward row. */
export function showsAsSpan(i: Pick<Item, 'end_date' | 'type'>): boolean {
	return i.type !== 'flight' && !!i.end_date && i.end_date.trim() !== '';
}

/** PB filter twins of `showsAsSpan`, for the Now loaders. */
export const DISCRETE_FILTER = '(end_date = "" || type = "flight")';
export const SPANNING_FILTER = 'end_date != "" && type != "flight"';
