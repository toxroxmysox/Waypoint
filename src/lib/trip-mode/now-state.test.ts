import { describe, it, expect } from 'vitest';
import { getNowViewState } from './now-state';
import type { Item } from '$lib/types';

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

describe('getNowViewState', () => {
	describe('no-day', () => {
		it('returns no-day when todayItems is empty and hasToday is false', () => {
			const result = getNowViewState([], new Date('2026-10-15T14:00:00Z'), false);
			expect(result.kind).toBe('no-day');
		});
	});

	describe('mid-event', () => {
		it('returns mid-event when now falls within an item start_time..end_time', () => {
			const items = [
				makeItem({
					id: 'lunch',
					start_time: '2026-10-15 12:00:00.000Z',
					end_time: '2026-10-15 14:30:00.000Z',
					title: 'Lunch'
				})
			];
			const result = getNowViewState(items, new Date('2026-10-15T13:00:00Z'), true);
			expect(result.kind).toBe('mid-event');
			if (result.kind === 'mid-event') {
				expect(result.currentItem.id).toBe('lunch');
				expect(result.minutesRemaining).toBe(90);
			}
		});

		it('picks the item with the latest end_time when multiple overlap', () => {
			const items = [
				makeItem({
					id: 'a',
					start_time: '2026-10-15 12:00:00.000Z',
					end_time: '2026-10-15 14:00:00.000Z'
				}),
				makeItem({
					id: 'b',
					start_time: '2026-10-15 13:00:00.000Z',
					end_time: '2026-10-15 15:00:00.000Z'
				})
			];
			const result = getNowViewState(items, new Date('2026-10-15T13:30:00Z'), true);
			expect(result.kind).toBe('mid-event');
			if (result.kind === 'mid-event') {
				expect(result.currentItem.id).toBe('b');
			}
		});

		it('includes nextItem when a future timed item exists', () => {
			const items = [
				makeItem({
					id: 'now',
					start_time: '2026-10-15 12:00:00.000Z',
					end_time: '2026-10-15 14:00:00.000Z'
				}),
				makeItem({
					id: 'later',
					start_time: '2026-10-15 16:00:00.000Z',
					end_time: '2026-10-15 18:00:00.000Z'
				})
			];
			const result = getNowViewState(items, new Date('2026-10-15T13:00:00Z'), true);
			expect(result.kind).toBe('mid-event');
			if (result.kind === 'mid-event') {
				expect(result.nextItem?.id).toBe('later');
			}
		});

		it('returns null nextItem when no future items exist', () => {
			const items = [
				makeItem({
					id: 'now',
					start_time: '2026-10-15 12:00:00.000Z',
					end_time: '2026-10-15 14:00:00.000Z'
				})
			];
			const result = getNowViewState(items, new Date('2026-10-15T13:00:00Z'), true);
			if (result.kind === 'mid-event') {
				expect(result.nextItem).toBeNull();
			}
		});
	});

	describe('between-things', () => {
		it('returns between-things when no item is ongoing but future items exist', () => {
			const items = [
				makeItem({
					id: 'past',
					start_time: '2026-10-15 09:00:00.000Z',
					end_time: '2026-10-15 10:00:00.000Z'
				}),
				makeItem({
					id: 'future',
					start_time: '2026-10-15 16:00:00.000Z',
					end_time: '2026-10-15 18:00:00.000Z',
					title: 'Dinner'
				})
			];
			const result = getNowViewState(items, new Date('2026-10-15T12:00:00Z'), true);
			expect(result.kind).toBe('between-things');
			if (result.kind === 'between-things') {
				expect(result.nextItem.id).toBe('future');
				expect(result.minutesUntilNext).toBe(240);
			}
		});

		it('picks the earliest future item as nextItem', () => {
			const items = [
				makeItem({
					id: 'soon',
					start_time: '2026-10-15 15:00:00.000Z',
					end_time: '2026-10-15 16:00:00.000Z'
				}),
				makeItem({
					id: 'later',
					start_time: '2026-10-15 18:00:00.000Z',
					end_time: '2026-10-15 19:00:00.000Z'
				})
			];
			const result = getNowViewState(items, new Date('2026-10-15T14:00:00Z'), true);
			if (result.kind === 'between-things') {
				expect(result.nextItem.id).toBe('soon');
				expect(result.minutesUntilNext).toBe(60);
			}
		});
	});

	describe('day-wrapped', () => {
		it('returns day-wrapped when all timed items are in the past', () => {
			const items = [
				makeItem({
					id: 'a',
					start_time: '2026-10-15 09:00:00.000Z',
					end_time: '2026-10-15 10:00:00.000Z',
					status: 'done'
				}),
				makeItem({
					id: 'b',
					start_time: '2026-10-15 12:00:00.000Z',
					end_time: '2026-10-15 13:00:00.000Z',
					status: 'done'
				})
			];
			const result = getNowViewState(items, new Date('2026-10-15T20:00:00Z'), true);
			expect(result.kind).toBe('day-wrapped');
			if (result.kind === 'day-wrapped') {
				expect(result.completedCount).toBe(2);
				expect(result.totalCount).toBe(2);
			}
		});

		it('returns day-wrapped when past 10pm regardless of item state', () => {
			const items = [
				makeItem({
					id: 'a',
					start_time: '2026-10-15 23:00:00.000Z',
					end_time: '2026-10-15 23:30:00.000Z',
					status: 'planned'
				})
			];
			const result = getNowViewState(items, new Date('2026-10-15T22:01:00Z'), true);
			expect(result.kind).toBe('day-wrapped');
		});

		it('returns day-wrapped when today exists but has zero items', () => {
			const result = getNowViewState([], new Date('2026-10-15T14:00:00Z'), true);
			expect(result.kind).toBe('day-wrapped');
			if (result.kind === 'day-wrapped') {
				expect(result.completedCount).toBe(0);
				expect(result.totalCount).toBe(0);
			}
		});

		it('counts only done items as completedCount', () => {
			const items = [
				makeItem({ id: 'a', status: 'done' }),
				makeItem({ id: 'b', status: 'planned' }),
				makeItem({ id: 'c', status: 'done' })
			];
			const result = getNowViewState(items, new Date('2026-10-15T22:30:00Z'), true);
			if (result.kind === 'day-wrapped') {
				expect(result.completedCount).toBe(2);
				expect(result.totalCount).toBe(3);
			}
		});
	});

	describe('untimed items', () => {
		it('untimed items do not trigger mid-event', () => {
			const items = [
				makeItem({ id: 'untimed', start_time: '', end_time: '' })
			];
			const result = getNowViewState(items, new Date('2026-10-15T14:00:00Z'), true);
			expect(result.kind).not.toBe('mid-event');
		});

		it('untimed-only day before 10pm returns day-wrapped (no timed items to be between)', () => {
			const items = [
				makeItem({ id: 'a', start_time: '', end_time: '' }),
				makeItem({ id: 'b', start_time: '', end_time: '' })
			];
			const result = getNowViewState(items, new Date('2026-10-15T14:00:00Z'), true);
			expect(result.kind).toBe('day-wrapped');
		});
	});
});
