import { describe, it, expect } from 'vitest';
import type { Expense } from './types';
import { expensesForItem, countExpensesForItem, paidSummaryForItem } from './linked-expenses';

function expense(id: string, linkedItem: string | null, amount = 10): Expense {
	return {
		id,
		trip: 'trip1',
		paid_by: 'm1',
		amount_usd: amount,
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

describe('paidSummaryForItem', () => {
	it('is NOT paid when no expense links the item (0 linked → "Log payment")', () => {
		const list = [expense('e1', null, 50), expense('e2', 'other', 30)];
		expect(paidSummaryForItem(list, 'itemA')).toEqual({ count: 0, total: 0, isPaid: false });
	});

	it('is paid with one linked expense, total = that amount', () => {
		const list = [expense('e1', 'itemA', 2400), expense('e2', null, 10)];
		expect(paidSummaryForItem(list, 'itemA')).toEqual({ count: 1, total: 2400, isPaid: true });
	});

	it('sums a deposit + balance across multiple linked expenses (ADR-0014 multi-payment)', () => {
		const list = [
			expense('e1', 'itemA', 500), // deposit
			expense('e2', 'itemA', 1900), // balance
			expense('e3', 'itemB', 999)
		];
		expect(paidSummaryForItem(list, 'itemA')).toEqual({ count: 2, total: 2400, isPaid: true });
	});

	it('returns the unpaid zero-summary for an empty id', () => {
		expect(paidSummaryForItem([expense('e1', 'itemA', 5)], '')).toEqual({
			count: 0,
			total: 0,
			isPaid: false
		});
	});
});
