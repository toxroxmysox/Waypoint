import { describe, it, expect } from 'vitest';
import { findNextItem, isToday, groupItemsByDay } from './trip-mode';
import type { Item, Day } from '$lib/types';

function makeItem(overrides: Partial<Item> = {}): Item {
	return {
		id: 'item1',
		trip: 'trip1',
		phase: '',
		day: 'day1',
		slot: 'morning',
		type: 'activity',
		subtype: '',
		title: 'Test Item',
		description: '',
		location_name: '',
		location_address: '',
		location_coords: null,
		google_place_id: '',
		start_time: '',
		end_time: '',
		start_tz: '',
		end_tz: '',
		status: 'planned',
		booked: false,
		booked_by: '',
		paid_by: '',
		confirmation_codes: [],
		reservation_url: '',
		free_cancellation: false,
		cost_estimate_usd: 0,
		cost_actual_usd: 0,
		assigned_to: [],
		rank: 0,
		parking_lot_scope: 'none',
		parent_item: '',
		created_by: '',
		collectionId: '',
		collectionName: '',
		created: '',
		updated: '',
		...overrides
	} as Item;
}

function makeDay(overrides: Partial<Day> = {}): Day {
	return {
		id: 'day1',
		trip: 'trip1',
		phases: [],
		date: '2026-10-15 00:00:00.000Z',
		notes: '',
		collectionId: '',
		collectionName: '',
		created: '',
		updated: '',
		...overrides
	} as Day;
}

describe('isToday', () => {
	it('returns true for matching date', () => {
		expect(isToday('2026-10-15 00:00:00.000Z', new Date('2026-10-15T14:00:00Z'))).toBe(true);
	});

	it('returns false for different date', () => {
		expect(isToday('2026-10-16 00:00:00.000Z', new Date('2026-10-15T14:00:00Z'))).toBe(false);
	});
});

describe('findNextItem', () => {
	it('returns the next upcoming item', () => {
		const items = [
			makeItem({ id: 'a', start_time: '2026-10-15 09:00:00.000Z' }),
			makeItem({ id: 'b', start_time: '2026-10-15 14:00:00.000Z' }),
			makeItem({ id: 'c', start_time: '2026-10-15 19:00:00.000Z' })
		];
		const now = new Date('2026-10-15T12:00:00Z');
		const next = findNextItem(items, now);
		expect(next?.id).toBe('b');
	});

	it('returns null if all items are past', () => {
		const items = [
			makeItem({ id: 'a', start_time: '2026-10-15 09:00:00.000Z' }),
			makeItem({ id: 'b', start_time: '2026-10-15 11:00:00.000Z' })
		];
		const now = new Date('2026-10-15T22:00:00Z');
		expect(findNextItem(items, now)).toBeNull();
	});

	it('skips items without start_time', () => {
		const items = [
			makeItem({ id: 'a', start_time: '' }),
			makeItem({ id: 'b', start_time: '2026-10-15 14:00:00.000Z' })
		];
		const now = new Date('2026-10-15T12:00:00Z');
		expect(findNextItem(items, now)?.id).toBe('b');
	});

	it('returns null for empty list', () => {
		expect(findNextItem([], new Date())).toBeNull();
	});
});

describe('groupItemsByDay', () => {
	it('groups items by their day id', () => {
		const items = [
			makeItem({ id: 'a', day: 'day1' }),
			makeItem({ id: 'b', day: 'day2' }),
			makeItem({ id: 'c', day: 'day1' })
		];
		const days = [
			makeDay({ id: 'day1', date: '2026-10-15 00:00:00.000Z' }),
			makeDay({ id: 'day2', date: '2026-10-16 00:00:00.000Z' })
		];
		const grouped = groupItemsByDay(items, days);
		expect(grouped).toHaveLength(2);
		expect(grouped[0].day.id).toBe('day1');
		expect(grouped[0].items).toHaveLength(2);
		expect(grouped[1].day.id).toBe('day2');
		expect(grouped[1].items).toHaveLength(1);
	});

	it('returns empty array for no items', () => {
		expect(groupItemsByDay([], [])).toEqual([]);
	});
});
