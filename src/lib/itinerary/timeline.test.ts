import { describe, it, expect } from 'vitest';
import { buildTimeline } from './timeline';
import type { TimelineEntry } from './timeline';
import type { Item } from '$lib/types';
import type { RecordModel } from 'pocketbase';

const base: Omit<Item, 'id' | 'sort_order' | 'start_time' | 'end_time' | 'title' | 'type' | 'status'> & Partial<RecordModel> = {
	trip: 't', phase: 'p', day: 'd', subtype: '', description: '',
	location_name: '', location_address: '', location_coords: null,
	google_place_id: '', start_tz: '', end_tz: '', booked: false,
	booked_by: '', paid_by: '', confirmation_codes: [], reservation_url: '',
	free_cancellation: false, cost_estimate_usd: 0, cost_actual_usd: 0,
	assigned_to: [], parent_item: '', created_by: '',
	collectionId: '', collectionName: 'items', created: '', updated: '',
};

function makeItem(overrides: Partial<Item> & { id: string }): Item {
	return {
		...base,
		sort_order: 0, start_time: '', end_time: '', title: '', type: 'activity', status: 'planned',
		...overrides,
	} as Item;
}

describe('buildTimeline', () => {
	it('returns empty array for no items', () => {
		expect(buildTimeline([])).toEqual([]);
	});

	it('sorts anchored items by start_time', () => {
		const items = [
			makeItem({ id: 'b', title: 'Lunch', start_time: '2026-06-15 12:00:00.000Z', sort_order: 200 }),
			makeItem({ id: 'a', title: 'Breakfast', start_time: '2026-06-15 08:00:00.000Z', sort_order: 100 }),
		];
		const timeline = buildTimeline(items);
		const itemEntries = timeline.filter((e): e is TimelineEntry & { kind: 'item' } => e.kind === 'item');
		expect(itemEntries.map((e) => e.item.id)).toEqual(['a', 'b']);
	});

	it('places untimed items between anchored items by sort_order', () => {
		const items = [
			makeItem({ id: 'anchor1', start_time: '2026-06-15 09:00:00.000Z', sort_order: 100 }),
			makeItem({ id: 'untimed1', sort_order: 150 }),
			makeItem({ id: 'untimed2', sort_order: 200 }),
			makeItem({ id: 'anchor2', start_time: '2026-06-15 14:00:00.000Z', sort_order: 300 }),
		];
		const timeline = buildTimeline(items);
		const itemIds = timeline.filter((e) => e.kind === 'item').map((e) => (e as any).item.id);
		expect(itemIds).toEqual(['anchor1', 'untimed1', 'untimed2', 'anchor2']);
	});

	it('puts all untimed items at end when no anchored items exist', () => {
		const items = [
			makeItem({ id: 'c', sort_order: 300 }),
			makeItem({ id: 'a', sort_order: 100 }),
			makeItem({ id: 'b', sort_order: 200 }),
		];
		const timeline = buildTimeline(items);
		const itemIds = timeline.filter((e) => e.kind === 'item').map((e) => (e as any).item.id);
		expect(itemIds).toEqual(['a', 'b', 'c']);
	});

	it('handles single anchored item with no untimed', () => {
		const items = [makeItem({ id: 'a', start_time: '2026-06-15 10:00:00.000Z', sort_order: 100 })];
		const timeline = buildTimeline(items);
		expect(timeline.filter((e) => e.kind === 'item')).toHaveLength(1);
	});

	it('handles single untimed item', () => {
		const items = [makeItem({ id: 'a', sort_order: 100 })];
		const timeline = buildTimeline(items);
		expect(timeline.filter((e) => e.kind === 'item')).toHaveLength(1);
	});

	it('places untimed items before first anchor if sort_order is lower', () => {
		const items = [
			makeItem({ id: 'untimed', sort_order: 50 }),
			makeItem({ id: 'anchor', start_time: '2026-06-15 10:00:00.000Z', sort_order: 100 }),
		];
		const timeline = buildTimeline(items);
		const itemIds = timeline.filter((e) => e.kind === 'item').map((e) => (e as any).item.id);
		expect(itemIds).toEqual(['untimed', 'anchor']);
	});

	it('places untimed items after last anchor if sort_order is higher', () => {
		const items = [
			makeItem({ id: 'anchor', start_time: '2026-06-15 10:00:00.000Z', sort_order: 100 }),
			makeItem({ id: 'untimed', sort_order: 200 }),
		];
		const timeline = buildTimeline(items);
		const itemIds = timeline.filter((e) => e.kind === 'item').map((e) => (e as any).item.id);
		expect(itemIds).toEqual(['anchor', 'untimed']);
	});

	it('inserts time-slot dividers between morning/afternoon/evening', () => {
		const items = [
			makeItem({ id: 'morning', start_time: '2026-06-15 09:00:00.000Z', sort_order: 100 }),
			makeItem({ id: 'evening', start_time: '2026-06-15 19:00:00.000Z', sort_order: 200 }),
		];
		const timeline = buildTimeline(items);
		const dividers = timeline.filter((e) => e.kind === 'divider');
		expect(dividers.length).toBeGreaterThanOrEqual(1);
		expect(dividers.some((d) => (d as any).label === 'Evening')).toBe(true);
	});

	it('does not insert divider if all items in same slot', () => {
		const items = [
			makeItem({ id: 'a', start_time: '2026-06-15 09:00:00.000Z', sort_order: 100 }),
			makeItem({ id: 'b', start_time: '2026-06-15 10:00:00.000Z', sort_order: 200 }),
		];
		const timeline = buildTimeline(items);
		const dividers = timeline.filter((e) => e.kind === 'divider');
		expect(dividers).toHaveLength(0);
	});
});

describe('detectOverlaps', () => {
	it('returns empty for non-overlapping items', async () => {
		const { detectOverlaps } = await import('./timeline');
		const items = [
			makeItem({ id: 'a', start_time: '2026-06-15 09:00:00.000Z', end_time: '2026-06-15 10:00:00.000Z' }),
			makeItem({ id: 'b', start_time: '2026-06-15 11:00:00.000Z', end_time: '2026-06-15 12:00:00.000Z' }),
		];
		expect(detectOverlaps(items)).toEqual(new Set());
	});

	it('detects overlapping anchored items', async () => {
		const { detectOverlaps } = await import('./timeline');
		const items = [
			makeItem({ id: 'a', start_time: '2026-06-15 09:00:00.000Z', end_time: '2026-06-15 11:00:00.000Z' }),
			makeItem({ id: 'b', start_time: '2026-06-15 10:00:00.000Z', end_time: '2026-06-15 12:00:00.000Z' }),
		];
		const overlaps = detectOverlaps(items);
		expect(overlaps.has('a')).toBe(true);
		expect(overlaps.has('b')).toBe(true);
	});

	it('ignores items without end_time', async () => {
		const { detectOverlaps } = await import('./timeline');
		const items = [
			makeItem({ id: 'a', start_time: '2026-06-15 09:00:00.000Z' }),
			makeItem({ id: 'b', start_time: '2026-06-15 09:30:00.000Z' }),
		];
		expect(detectOverlaps(items)).toEqual(new Set());
	});
});
