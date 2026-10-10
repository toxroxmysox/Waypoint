import { describe, it, expect } from 'vitest';
import { toDateOnly, isMultiDay, itemDateRange, spanningItemsForDate, nightInfo, sortSpans } from './multi-day';
import type { Item, Day } from '$lib/types';

const days = [
	{ id: 'd8', date: '2026-06-18 00:00:00.000Z' },
	{ id: 'd9', date: '2026-06-19 00:00:00.000Z' },
	{ id: 'd12', date: '2026-06-22 00:00:00.000Z' }
] as Day[];

function hotel(over: Partial<Item> = {}): Item {
	return { id: 'h', day: 'd8', end_date: '2026-06-22 00:00:00.000Z', ...over } as Item;
}

describe('toDateOnly', () => {
	it('strips time from stored datetime', () => {
		expect(toDateOnly('2026-06-22 00:00:00.000Z')).toBe('2026-06-22');
		expect(toDateOnly('')).toBe('');
	});
});

describe('isMultiDay', () => {
	it('true when end_date is after the start day date', () => {
		expect(isMultiDay(hotel(), days)).toBe(true);
	});
	it('false when end_date equals the start day date (inert)', () => {
		expect(isMultiDay(hotel({ end_date: '2026-06-18 00:00:00.000Z' }), days)).toBe(false);
	});
	it('false when no end_date', () => {
		expect(isMultiDay(hotel({ end_date: '' }), days)).toBe(false);
	});
	it('false when no start day', () => {
		expect(isMultiDay(hotel({ day: '' }), days)).toBe(false);
	});
});

describe('itemDateRange', () => {
	it('returns inclusive start/end for multi-day', () => {
		expect(itemDateRange(hotel(), days)).toEqual({ start: '2026-06-18', end: '2026-06-22' });
	});
	it('returns null for non-multi-day', () => {
		expect(itemDateRange(hotel({ end_date: '' }), days)).toBeNull();
	});
});

describe('spanningItemsForDate', () => {
	it('includes the item on first, middle, and last day', () => {
		const items = [hotel()];
		expect(spanningItemsForDate(items, days, '2026-06-18')).toHaveLength(1);
		expect(spanningItemsForDate(items, days, '2026-06-20')).toHaveLength(1);
		expect(spanningItemsForDate(items, days, '2026-06-22')).toHaveLength(1);
	});
	it('excludes dates outside the range', () => {
		expect(spanningItemsForDate([hotel()], days, '2026-06-23')).toHaveLength(0);
		expect(spanningItemsForDate([hotel()], days, '2026-06-17')).toHaveLength(0);
	});
	it('ignores non-multi-day items', () => {
		expect(spanningItemsForDate([hotel({ end_date: '' })], days, '2026-06-18')).toHaveLength(0);
	});	it('orders bands chronologically, whatever order the query returned', () => {
		const later = hotel({ id: 'later', day: 'd9', title: 'B&B' });
		const earlier = hotel({ id: 'earlier', day: 'd8', title: 'Rental car' });
		const ids = (xs: Item[]) => xs.map((i) => i.id);
		expect(ids(spanningItemsForDate([later, earlier], days, '2026-06-20'))).toEqual(['earlier', 'later']);
	});
});

describe('sortSpans', () => {
	it('earliest start first, then start time, then title', () => {
		const a = hotel({ id: 'a', day: 'd9', title: 'A' });
		const b = hotel({ id: 'b', day: 'd8', title: 'Z', start_time: '2026-06-18 15:00:00.000Z' });
		const c = hotel({ id: 'c', day: 'd8', title: 'Y', start_time: '2026-06-18 10:00:00.000Z' });
		const d = hotel({ id: 'd', day: 'd8', title: 'X', start_time: '2026-06-18 10:00:00.000Z' });
		expect(sortSpans([a, b, c, d], days).map((i) => i.id)).toEqual(['d', 'c', 'b', 'a']);
	});
});

describe('nightInfo', () => {
	it('counts nights from the start', () => {
		expect(nightInfo(hotel(), days, '2026-06-18')).toEqual({ night: 1, total: 4 });
		expect(nightInfo(hotel(), days, '2026-06-21')).toEqual({ night: 4, total: 4 });
	});
	it('caps the night number at total on the checkout day', () => {
		expect(nightInfo(hotel(), days, '2026-06-22')).toEqual({ night: 4, total: 4 });
	});
});
