import { describe, it, expect } from 'vitest';
import {
	nextSortOrder,
	insertBetween,
	rebalance,
	reorderUpdates,
	rebalanceDayOrder,
	GAP
} from './sort-order';
import { orderDayItems, type DayOrderable } from './timeline';

describe('nextSortOrder', () => {
	it('returns GAP for empty list', () => {
		expect(nextSortOrder([])).toBe(GAP);
	});

	it('returns max + GAP', () => {
		expect(nextSortOrder([100, 200, 300])).toBe(300 + GAP);
	});

	it('handles unsorted input', () => {
		expect(nextSortOrder([300, 100, 200])).toBe(300 + GAP);
	});
});

describe('insertBetween', () => {
	it('returns midpoint of two values', () => {
		expect(insertBetween(100, 200)).toBe(150);
	});

	it('floors to integer', () => {
		expect(insertBetween(100, 201)).toBe(150);
	});

	it('returns midpoint even with small gap', () => {
		expect(insertBetween(100, 102)).toBe(101);
	});

	it('returns null when gap is 1 (needs rebalance)', () => {
		expect(insertBetween(100, 101)).toBeNull();
	});

	it('returns null when values are equal', () => {
		expect(insertBetween(100, 100)).toBeNull();
	});

	it('handles zero as before', () => {
		expect(insertBetween(0, 100)).toBe(50);
	});

	it('inserts before first item (before = null)', () => {
		expect(insertBetween(null, 100)).toBe(50);
	});

	it('inserts after last item (after = null)', () => {
		expect(insertBetween(100, null)).toBe(100 + GAP);
	});
});

describe('rebalance', () => {
	it('assigns gap-based orders to items', () => {
		const ids = ['a', 'b', 'c'];
		const result = rebalance(ids);
		expect(result).toEqual([
			{ id: 'a', sort_order: GAP },
			{ id: 'b', sort_order: GAP * 2 },
			{ id: 'c', sort_order: GAP * 3 },
		]);
	});

	it('handles single item', () => {
		expect(rebalance(['a'])).toEqual([{ id: 'a', sort_order: GAP }]);
	});

	it('handles empty list', () => {
		expect(rebalance([])).toEqual([]);
	});
});

describe('reorderUpdates', () => {
	// Models reordering a phase's unplanned ideas (#88): the moved idea lands
	// between two neighbor sort_orders; only sort_order changes.
	const ideas = (...pairs: [string, number][]) =>
		pairs.map(([id, sort_order]) => ({ id, sort_order }));

	it('returns a single-item update when a gap is available (drop in middle)', () => {
		const list = ideas(['a', 100], ['b', 200], ['c', 300]);
		// 'c' dragged between 'a' and 'b' → midpoint of 100/200.
		expect(reorderUpdates(list, 'c', 100, 200)).toEqual([{ id: 'c', sort_order: 150 }]);
	});

	it('inserts at the head (before = null)', () => {
		const list = ideas(['a', 100], ['b', 200]);
		expect(reorderUpdates(list, 'b', null, 100)).toEqual([{ id: 'b', sort_order: 50 }]);
	});

	it('inserts at the tail (after = null)', () => {
		const list = ideas(['a', 100], ['b', 200]);
		expect(reorderUpdates(list, 'a', 200, null)).toEqual([{ id: 'a', sort_order: 300 }]);
	});

	it('rebalances the whole list when the gap collapses, moved item in the middle', () => {
		// No room between 100 and 101 → full rebalance with 'c' spliced before 'b'.
		const list = ideas(['a', 100], ['b', 101], ['c', 300]);
		expect(reorderUpdates(list, 'c', 100, 101)).toEqual([
			{ id: 'a', sort_order: GAP },
			{ id: 'c', sort_order: GAP * 2 },
			{ id: 'b', sort_order: GAP * 3 }
		]);
	});

	it('rebalances with the moved item at the tail when the gap collapses last', () => {
		// 'a' dragged between adjacent 'b'/'c' (200/201) → no room, full rebalance.
		const list = ideas(['a', 100], ['b', 200], ['c', 201]);
		expect(reorderUpdates(list, 'a', 200, 201)).toEqual([
			{ id: 'b', sort_order: GAP },
			{ id: 'a', sort_order: GAP * 2 },
			{ id: 'c', sort_order: GAP * 3 }
		]);
	});

	it('is a no-op-shaped single update for a single-item list', () => {
		expect(reorderUpdates(ideas(['a', 100]), 'a', null, null)).toEqual([
			{ id: 'a', sort_order: GAP }
		]);
	});
});

describe('rebalanceDayOrder (#237 — untimed items interleave freely)', () => {
	// A minimal DayOrderable for round-trip checks through orderDayItems.
	type TestItem = DayOrderable & { id: string };
	const timed = (id: string, start_time: string): TestItem => ({ id, start_time, sort_order: 0 });
	const untimed = (id: string): TestItem => ({ id, start_time: '', sort_order: 0 });

	// Apply the rebalance updates back onto the items, then re-derive the day's
	// display order — this is exactly what the server + a fresh page load do.
	const applyAndReorder = (items: TestItem[], displayOrder: TestItem[]): string[] => {
		const updates = rebalanceDayOrder(displayOrder);
		const byId = new Map(updates.map((u) => [u.id, u.sort_order]));
		const persisted = items.map((i) => ({ ...i, sort_order: byId.get(i.id) ?? i.sort_order }));
		return orderDayItems(persisted).map((i) => i.id);
	};

	it('(a) keeps an untimed item dropped BETWEEN two timed items in that position after rebalance', () => {
		const t1 = timed('t1', '2026-06-15 09:00:00.000Z');
		const t2 = timed('t2', '2026-06-15 14:00:00.000Z');
		const dinner = untimed('dinner'); // the "no time set dinner" from the issue
		// Dropped order: dinner sits between the two timed items.
		const dropped = [t1, dinner, t2];
		expect(applyAndReorder([t1, t2, dinner], dropped)).toEqual(['t1', 'dinner', 't2']);
	});

	it('(a) keeps an untimed item dropped BELOW all timed items at the tail after rebalance', () => {
		const t1 = timed('t1', '2026-06-15 09:00:00.000Z');
		const t2 = timed('t2', '2026-06-15 14:00:00.000Z');
		const dinner = untimed('dinner');
		const dropped = [t1, t2, dinner]; // dinner below both timed items
		expect(applyAndReorder([t1, t2, dinner], dropped)).toEqual(['t1', 't2', 'dinner']);
	});

	it('(b) timed items keep their start_time order regardless of the dropped order', () => {
		const t1 = timed('t1', '2026-06-15 09:00:00.000Z');
		const t2 = timed('t2', '2026-06-15 14:00:00.000Z');
		const u = untimed('u');
		// Even if a caller hands timed items out of clock order, orderDayItems pins
		// them by start_time — t1 (9am) always precedes t2 (2pm).
		const droppedWrongClockOrder = [t2, u, t1];
		const result = applyAndReorder([t1, t2, u], droppedWrongClockOrder);
		const tIdx = (id: string) => result.indexOf(id);
		expect(tIdx('t1')).toBeLessThan(tIdx('t2'));
	});

	it('(c) emits monotonic, collision-free sort_order values across the whole day', () => {
		const dropped = [
			timed('t1', '2026-06-15 09:00:00.000Z'),
			untimed('u1'),
			timed('t2', '2026-06-15 14:00:00.000Z'),
			untimed('u2'),
			untimed('u3')
		];
		const updates = rebalanceDayOrder(dropped);
		const orders = updates.map((u) => u.sort_order);
		// Strictly increasing (monotonic) → also guarantees no collisions.
		for (let i = 1; i < orders.length; i++) {
			expect(orders[i]).toBeGreaterThan(orders[i - 1]);
		}
		expect(new Set(orders).size).toBe(orders.length);
		// Preserves the dropped order 1:1.
		expect(updates.map((u) => u.id)).toEqual(['t1', 'u1', 't2', 'u2', 'u3']);
	});

	it('round-trips a mixed day with multiple untimed items woven between anchors', () => {
		const t1 = timed('t1', '2026-06-15 08:00:00.000Z');
		const t2 = timed('t2', '2026-06-15 12:00:00.000Z');
		const t3 = timed('t3', '2026-06-15 18:00:00.000Z');
		const a = untimed('a');
		const b = untimed('b');
		const c = untimed('c');
		const dropped = [t1, a, t2, b, c, t3]; // a after t1; b,c between t2 and t3
		expect(applyAndReorder([t1, t2, t3, a, b, c], dropped)).toEqual([
			't1',
			'a',
			't2',
			'b',
			'c',
			't3'
		]);
	});

	it('handles an empty day', () => {
		expect(rebalanceDayOrder([])).toEqual([]);
	});
});
