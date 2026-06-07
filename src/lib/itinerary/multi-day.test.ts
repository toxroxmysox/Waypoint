import { describe, it, expect } from 'vitest';
import { toDateOnly, isMultiDay, itemDateRange, spanningItemsForDate, nightInfo } from './multi-day';
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
