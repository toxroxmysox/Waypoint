import { describe, it, expect } from 'vitest';
import { nextSortOrder, insertBetween, rebalance, GAP } from './sort-order';

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
