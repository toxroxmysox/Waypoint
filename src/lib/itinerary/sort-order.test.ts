import { describe, it, expect } from 'vitest';
import { nextSortOrder, insertBetween, rebalance, reorderUpdates, GAP } from './sort-order';

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
