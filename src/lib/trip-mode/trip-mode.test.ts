import { describe, it, expect } from 'vitest';
import { getTripModeState } from './trip-mode';
import type { Item, Day } from '$lib/types';

function makeItem(overrides: Partial<Item> = {}): Item {
	return {
		id: 'item1',
		trip: 'trip1',
		phase: '',
		day: 'day1',
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
		sort_order: 0,
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

describe('getTripModeState', () => {
	const oct15 = new Date('2026-10-15T14:00:00Z');

	describe('now (NowState)', () => {
		it('identifies today from days list', () => {
			const days = [
				makeDay({ id: 'day1', date: '2026-10-15 00:00:00.000Z' }),
				makeDay({ id: 'day2', date: '2026-10-16 00:00:00.000Z' })
			];
			const state = getTripModeState([], days, oct15);
			expect(state.now.today?.id).toBe('day1');
		});

		it('returns null today when no day matches', () => {
			const days = [
				makeDay({ id: 'day1', date: '2026-10-20 00:00:00.000Z' })
			];
			const state = getTripModeState([], days, oct15);
			expect(state.now.today).toBeNull();
		});

		it('filters todayItems to only items for today', () => {
			const days = [
				makeDay({ id: 'day1', date: '2026-10-15 00:00:00.000Z' }),
				makeDay({ id: 'day2', date: '2026-10-16 00:00:00.000Z' })
			];
			const items = [
				makeItem({ id: 'a', day: 'day1' }),
				makeItem({ id: 'b', day: 'day2' }),
				makeItem({ id: 'c', day: 'day1' })
			];
			const state = getTripModeState(items, days, oct15);
			expect(state.now.todayItems).toHaveLength(2);
			expect(state.now.todayItems.map(i => i.id)).toEqual(['a', 'c']);
		});

		it('sorts todayItems by sort_order then start_time', () => {
			const state = getTripModeState(
				[
					makeItem({ id: 'a', day: 'day1', sort_order: 300 }),
					makeItem({ id: 'b', day: 'day1', sort_order: 100, start_time: '2026-10-15 09:00:00.000Z' }),
					makeItem({ id: 'c', day: 'day1', sort_order: 100, start_time: '2026-10-15 10:00:00.000Z' })
				],
				[makeDay({ id: 'day1', date: '2026-10-15 00:00:00.000Z' })],
				oct15
			);
			expect(state.now.todayItems.map((i) => i.id)).toEqual(['b', 'c', 'a']);
		});

		it('finds the next upcoming item by start_time', () => {
			const days = [makeDay({ id: 'day1', date: '2026-10-15 00:00:00.000Z' })];
			const items = [
				makeItem({ id: 'a', day: 'day1', start_time: '2026-10-15 09:00:00.000Z' }),
				makeItem({ id: 'b', day: 'day1', start_time: '2026-10-15 16:00:00.000Z' }),
				makeItem({ id: 'c', day: 'day1', start_time: '2026-10-15 19:00:00.000Z' })
			];
			const state = getTripModeState(items, days, oct15);
			expect(state.now.nextItem?.id).toBe('b');
		});

		it('returns null nextItem when all items are past', () => {
			const days = [makeDay({ id: 'day1', date: '2026-10-15 00:00:00.000Z' })];
			const items = [
				makeItem({ id: 'a', day: 'day1', start_time: '2026-10-15 09:00:00.000Z' }),
				makeItem({ id: 'b', day: 'day1', start_time: '2026-10-15 11:00:00.000Z' })
			];
			const state = getTripModeState(items, days, oct15);
			expect(state.now.nextItem).toBeNull();
		});

		it('isPast returns true for items with end_time before now', () => {
			const days = [makeDay({ id: 'day1', date: '2026-10-15 00:00:00.000Z' })];
			const items = [
				makeItem({ id: 'a', day: 'day1', end_time: '2026-10-15 10:00:00.000Z' })
			];
			const state = getTripModeState(items, days, oct15);
			expect(state.now.isPast(items[0])).toBe(true);
		});

		it('isPast returns false for items with no end_time', () => {
			const days = [makeDay({ id: 'day1', date: '2026-10-15 00:00:00.000Z' })];
			const item = makeItem({ id: 'a', day: 'day1', end_time: '' });
			const state = getTripModeState([], days, oct15);
			expect(state.now.isPast(item)).toBe(false);
		});

		it('isPast returns false for items with end_time after now', () => {
			const days = [makeDay({ id: 'day1', date: '2026-10-15 00:00:00.000Z' })];
			const item = makeItem({ id: 'a', day: 'day1', end_time: '2026-10-15 18:00:00.000Z' });
			const state = getTripModeState([], days, oct15);
			expect(state.now.isPast(item)).toBe(false);
		});

		it('returns empty todayItems when today exists but no items match', () => {
			const days = [makeDay({ id: 'day1', date: '2026-10-15 00:00:00.000Z' })];
			const state = getTripModeState([], days, oct15);
			expect(state.now.todayItems).toEqual([]);
		});
	});

	describe('upNext', () => {
		it('identifies tomorrow from days list', () => {
			const days = [
				makeDay({ id: 'day1', date: '2026-10-15 00:00:00.000Z' }),
				makeDay({ id: 'day2', date: '2026-10-16 00:00:00.000Z' })
			];
			const state = getTripModeState([], days, oct15);
			expect(state.upNext.tomorrowDay?.id).toBe('day2');
		});

		it('returns null tomorrowDay when no day matches', () => {
			const days = [
				makeDay({ id: 'day1', date: '2026-10-15 00:00:00.000Z' })
			];
			const state = getTripModeState([], days, oct15);
			expect(state.upNext.tomorrowDay).toBeNull();
		});

		it('filters tomorrowItems to items for tomorrow', () => {
			const days = [
				makeDay({ id: 'day1', date: '2026-10-15 00:00:00.000Z' }),
				makeDay({ id: 'day2', date: '2026-10-16 00:00:00.000Z' })
			];
			const items = [
				makeItem({ id: 'a', day: 'day1' }),
				makeItem({ id: 'b', day: 'day2', sort_order: 100 }),
				makeItem({ id: 'c', day: 'day2', sort_order: 200 })
			];
			const state = getTripModeState(items, days, oct15);
			expect(state.upNext.tomorrowItems).toHaveLength(2);
			expect(state.upNext.tomorrowItems.map(i => i.id)).toEqual(['b', 'c']);
		});

		it('sorts tomorrowItems by sort_order', () => {
			const days = [
				makeDay({ id: 'day2', date: '2026-10-16 00:00:00.000Z' })
			];
			const items = [
				makeItem({ id: 'a', day: 'day2', sort_order: 200 }),
				makeItem({ id: 'b', day: 'day2', sort_order: 100 })
			];
			const state = getTripModeState(items, days, oct15);
			expect(state.upNext.tomorrowItems.map(i => i.id)).toEqual(['b', 'a']);
		});
	});

	describe('timeline', () => {
		it('groups upcoming items by day for next 3 days', () => {
			const days = [
				makeDay({ id: 'day1', date: '2026-10-15 00:00:00.000Z' }),
				makeDay({ id: 'day2', date: '2026-10-16 00:00:00.000Z' }),
				makeDay({ id: 'day3', date: '2026-10-17 00:00:00.000Z' }),
				makeDay({ id: 'day4', date: '2026-10-18 00:00:00.000Z' }),
				makeDay({ id: 'day5', date: '2026-10-19 00:00:00.000Z' })
			];
			const items = [
				makeItem({ id: 'a', day: 'day2' }),
				makeItem({ id: 'b', day: 'day3' }),
				makeItem({ id: 'c', day: 'day4' }),
				makeItem({ id: 'd', day: 'day5' })
			];
			const state = getTripModeState(items, days, oct15);
			// Only days 2, 3, 4 (next 3 days from oct15)
			expect(state.timeline.upcomingDays).toHaveLength(3);
			expect(state.timeline.upcomingDays[0].day.id).toBe('day2');
			expect(state.timeline.upcomingDays[1].day.id).toBe('day3');
			expect(state.timeline.upcomingDays[2].day.id).toBe('day4');
		});

		it('excludes days with no items from timeline', () => {
			const days = [
				makeDay({ id: 'day2', date: '2026-10-16 00:00:00.000Z' }),
				makeDay({ id: 'day3', date: '2026-10-17 00:00:00.000Z' })
			];
			const items = [
				makeItem({ id: 'a', day: 'day3' })
			];
			const state = getTripModeState(items, days, oct15);
			expect(state.timeline.upcomingDays).toHaveLength(1);
			expect(state.timeline.upcomingDays[0].day.id).toBe('day3');
		});

		it('sorts items within each day group by sort_order then time', () => {
			const days = [
				makeDay({ id: 'day2', date: '2026-10-16 00:00:00.000Z' })
			];
			const items = [
				makeItem({ id: 'a', day: 'day2', sort_order: 300 }),
				makeItem({ id: 'b', day: 'day2', sort_order: 100, start_time: '2026-10-16 10:00:00.000Z' }),
				makeItem({ id: 'c', day: 'day2', sort_order: 100, start_time: '2026-10-16 08:00:00.000Z' })
			];
			const state = getTripModeState(items, days, oct15);
			expect(state.timeline.upcomingDays[0].items.map(i => i.id)).toEqual(['c', 'b', 'a']);
		});

		it('returns empty upcomingDays when no future days exist', () => {
			const days = [
				makeDay({ id: 'day1', date: '2026-10-15 00:00:00.000Z' })
			];
			const state = getTripModeState([], days, oct15);
			expect(state.timeline.upcomingDays).toEqual([]);
		});
	});

	describe('edge cases', () => {
		it('handles empty items and days', () => {
			const state = getTripModeState([], [], oct15);
			expect(state.now.today).toBeNull();
			expect(state.now.todayItems).toEqual([]);
			expect(state.now.nextItem).toBeNull();
			expect(state.upNext.tomorrowDay).toBeNull();
			expect(state.upNext.tomorrowItems).toEqual([]);
			expect(state.timeline.upcomingDays).toEqual([]);
		});

		it('items without a day assignment are excluded everywhere', () => {
			const days = [makeDay({ id: 'day1', date: '2026-10-15 00:00:00.000Z' })];
			const items = [
				makeItem({ id: 'a', day: '' }),
				makeItem({ id: 'b', day: 'day1' })
			];
			const state = getTripModeState(items, days, oct15);
			expect(state.now.todayItems).toHaveLength(1);
			expect(state.now.todayItems[0].id).toBe('b');
		});
	});
});
