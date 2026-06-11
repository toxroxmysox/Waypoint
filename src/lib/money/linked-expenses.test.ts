import { describe, it, expect } from 'vitest';
import type { Expense } from './types';
import { expensesForItem, countExpensesForItem } from './linked-expenses';

function expense(id: string, linkedItem: string | null): Expense {
	return {
		id,
		trip: 'trip1',
		paid_by: 'm1',
		amount_usd: 10,
		description: id,
		date: '2026-01-01',
		category: 'other',
		linked_item: linkedItem,
		split_mode: 'equal',
		split_data: { members: ['m1'] },
		created_by: 'm1',
		created: '',
		updated: ''
	};
}

describe('expensesForItem', () => {
	it('returns nothing when no expense links the item', () => {
		const list = [expense('e1', null), expense('e2', 'other')];
		expect(expensesForItem(list, 'itemA')).toEqual([]);
		expect(countExpensesForItem(list, 'itemA')).toBe(0);
	});

	it('returns the single linked expense', () => {
		const list = [expense('e1', 'itemA'), expense('e2', null)];
		const result = expensesForItem(list, 'itemA');
		expect(result.map((e) => e.id)).toEqual(['e1']);
		expect(countExpensesForItem(list, 'itemA')).toBe(1);
	});

	it('is multiplicity-safe — returns ALL expenses for the item (N > 1)', () => {
		const list = [
			expense('e1', 'itemA'),
			expense('e2', 'itemB'),
			expense('e3', 'itemA'),
			expense('e4', null),
			expense('e5', 'itemA')
		];
		const result = expensesForItem(list, 'itemA');
		expect(result.map((e) => e.id)).toEqual(['e1', 'e3', 'e5']);
		expect(countExpensesForItem(list, 'itemA')).toBe(3);
	});

	it('returns empty for an empty id', () => {
		expect(expensesForItem([expense('e1', 'itemA')], '')).toEqual([]);
	});
});
