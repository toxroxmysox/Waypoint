import { describe, it, expect } from 'vitest';
import { computeBalances, simplifyDebts, type DebtEdge } from './debt-simplify';
import type { Expense, Settlement } from '$lib/types';

function makeExpense(overrides: Partial<Expense> & Pick<Expense, 'paid_by' | 'amount_usd' | 'split_mode' | 'split_data'>): Expense {
	return {
		id: 'exp-' + Math.random().toString(36).slice(2, 8),
		trip: 'trip1',
		description: 'Test',
		date: '2026-01-01',
		category: 'food',
		linked_item: null,
		created_by: overrides.paid_by,
		created: '',
		updated: '',
		...overrides,
	};
}

function makeSettlement(from: string, to: string, amount: number): Settlement {
	return {
		id: 'stl-' + Math.random().toString(36).slice(2, 8),
		trip: 'trip1',
		from_member: from,
		to_member: to,
		amount_usd: amount,
		date: '2026-01-01',
		note: '',
		created_by: from,
		created: '',
		updated: '',
	};
}

describe('computeBalances', () => {
	it('returns empty map for no expenses', () => {
		const balances = computeBalances([], []);
		expect(balances.size).toBe(0);
	});

	it('computes equal split correctly', () => {
		const expense = makeExpense({
			paid_by: 'alice',
			amount_usd: 90,
			split_mode: 'equal',
			split_data: { members: ['alice', 'bob', 'charlie'] },
		});

		const balances = computeBalances([expense], []);
		expect(balances.get('alice')).toBeCloseTo(60);
		expect(balances.get('bob')).toBeCloseTo(-30);
		expect(balances.get('charlie')).toBeCloseTo(-30);
	});

	it('computes by_amount split correctly', () => {
		const expense = makeExpense({
			paid_by: 'alice',
			amount_usd: 100,
			split_mode: 'by_amount',
			split_data: { amounts: { alice: 40, bob: 35, charlie: 25 } },
		});

		const balances = computeBalances([expense], []);
		expect(balances.get('alice')).toBeCloseTo(60);
		expect(balances.get('bob')).toBeCloseTo(-35);
		expect(balances.get('charlie')).toBeCloseTo(-25);
	});

	it('accounts for settlements', () => {
		const expense = makeExpense({
			paid_by: 'alice',
			amount_usd: 60,
			split_mode: 'equal',
			split_data: { members: ['alice', 'bob'] },
		});
		const settlement = makeSettlement('bob', 'alice', 30);

		const balances = computeBalances([expense], [settlement]);
		expect(balances.get('alice')).toBeCloseTo(0);
		expect(balances.get('bob')).toBeCloseTo(0);
	});
});

describe('simplifyDebts', () => {
	it('returns empty for no expenses', () => {
		expect(simplifyDebts([], [])).toEqual([]);
	});

	it('returns empty when all settled', () => {
		const expense = makeExpense({
			paid_by: 'alice',
			amount_usd: 60,
			split_mode: 'equal',
			split_data: { members: ['alice', 'bob'] },
		});
		const settlement = makeSettlement('bob', 'alice', 30);

		expect(simplifyDebts([expense], [settlement])).toEqual([]);
	});

	it('produces single debt for two people', () => {
		const expense = makeExpense({
			paid_by: 'alice',
			amount_usd: 100,
			split_mode: 'equal',
			split_data: { members: ['alice', 'bob'] },
		});

		const debts = simplifyDebts([expense], []);
		expect(debts).toHaveLength(1);
		expect(debts[0].from).toBe('bob');
		expect(debts[0].to).toBe('alice');
		expect(debts[0].amount).toBe(50);
	});

	it('simplifies three-person circular debts', () => {
		const expenses = [
			makeExpense({
				paid_by: 'alice',
				amount_usd: 90,
				split_mode: 'equal',
				split_data: { members: ['alice', 'bob', 'charlie'] },
			}),
			makeExpense({
				paid_by: 'bob',
				amount_usd: 30,
				split_mode: 'equal',
				split_data: { members: ['alice', 'bob', 'charlie'] },
			}),
		];

		const debts = simplifyDebts(expenses, []);

		// Alice: 90-30-10=50, Bob: 30-30-10=-10, Charlie: -30-10=-40
		const totalTransferred = debts.reduce((sum, d) => sum + d.amount, 0);
		expect(totalTransferred).toBeCloseTo(50);

		for (const d of debts) {
			expect(d.from).not.toBe(d.to);
			expect(d.amount).toBeGreaterThan(0);
		}
	});

	it('handles partial settlement', () => {
		const expense = makeExpense({
			paid_by: 'alice',
			amount_usd: 100,
			split_mode: 'equal',
			split_data: { members: ['alice', 'bob'] },
		});
		const settlement = makeSettlement('bob', 'alice', 20);

		const debts = simplifyDebts([expense], [settlement]);
		expect(debts).toHaveLength(1);
		expect(debts[0].from).toBe('bob');
		expect(debts[0].to).toBe('alice');
		expect(debts[0].amount).toBe(30);
	});

	it('minimizes transaction count for 4 people', () => {
		const expenses = [
			makeExpense({
				paid_by: 'alice',
				amount_usd: 120,
				split_mode: 'equal',
				split_data: { members: ['alice', 'bob', 'charlie', 'dave'] },
			}),
			makeExpense({
				paid_by: 'bob',
				amount_usd: 40,
				split_mode: 'equal',
				split_data: { members: ['alice', 'bob', 'charlie', 'dave'] },
			}),
		];

		const debts = simplifyDebts(expenses, []);
		expect(debts.length).toBeLessThanOrEqual(3);

		const netCheck = new Map<string, number>();
		for (const d of debts) {
			netCheck.set(d.from, (netCheck.get(d.from) ?? 0) - d.amount);
			netCheck.set(d.to, (netCheck.get(d.to) ?? 0) + d.amount);
		}

		expect(netCheck.get('alice') ?? 0).toBeCloseTo(80);
		expect(netCheck.get('bob') ?? 0).toBeCloseTo(0);
		expect(netCheck.get('charlie') ?? 0).toBeCloseTo(-40);
		expect(netCheck.get('dave') ?? 0).toBeCloseTo(-40);
	});
});
