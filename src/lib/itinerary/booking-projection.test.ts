import { describe, it, expect } from 'vitest';
import {
	needsBooking,
	bookingProjection,
	defaultRequiresBooking,
	BOOKABLE_TYPES
} from './booking-projection';
import type { Item, ItemType } from '$lib/types';

function item(overrides: Partial<Item>): Item {
	return {
		status: 'planned',
		requires_booking: true,
		booked: false,
		...overrides
	} as Item;
}

describe('needsBooking predicate', () => {
	it('includes a planned, requires_booking, unbooked item', () => {
		expect(needsBooking(item({}))).toBe(true);
	});

	it('excludes a booked item', () => {
		expect(needsBooking(item({ booked: true }))).toBe(false);
	});

	it('excludes an item that does not require booking', () => {
		expect(needsBooking(item({ requires_booking: false }))).toBe(false);
	});

	it('treats absent requires_booking as false', () => {
		expect(needsBooking(item({ requires_booking: undefined as unknown as boolean }))).toBe(false);
	});

	it('excludes non-planned statuses (considered / unplanned / done)', () => {
		for (const status of ['considered', 'unplanned', 'done'] as const) {
			expect(needsBooking(item({ status }))).toBe(false);
		}
	});
});

describe('bookingProjection', () => {
	it('keeps only the matching items', () => {
		const items = [
			item({ id: 'a' } as Partial<Item>), // matches
			item({ id: 'b', booked: true } as Partial<Item>), // booked
			item({ id: 'c', requires_booking: false } as Partial<Item>), // no booking
			item({ id: 'd', status: 'considered' } as Partial<Item>), // not planned
			item({ id: 'e' } as Partial<Item>) // matches
		];
		expect(bookingProjection(items).map((i) => i.id)).toEqual(['a', 'e']);
	});

	it('returns empty for an empty input', () => {
		expect(bookingProjection([])).toEqual([]);
	});
});

describe('defaultRequiresBooking', () => {
	it('is true for lodging, flight, transportation', () => {
		for (const t of BOOKABLE_TYPES) expect(defaultRequiresBooking(t)).toBe(true);
	});

	it('is false for other types', () => {
		for (const t of ['activity', 'meal', 'note'] as ItemType[]) {
			expect(defaultRequiresBooking(t)).toBe(false);
		}
	});
});
