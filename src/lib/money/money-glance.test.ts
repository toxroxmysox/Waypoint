import { describe, it, expect } from 'vitest';
import {
	moneyGlance,
	groupBudgetTotal,
	myShareOfExpenses,
	remainingPlannedTotal,
	remainingDays,
	type GlanceItem
} from './money-glance';
import type { Expense, TripBudget, BudgetCategory } from './types';

// --- builders -------------------------------------------------------------

function makeExpense(
	overrides: Partial<Expense> & Pick<Expense, 'paid_by' | 'amount_usd' | 'split_mode' | 'split_data'>
): Expense {
	return {
		id: 'exp-' + Math.random().toString(36).slice(2, 8),
		trip: 'trip1',
		description: 'Test',
		date: '2026-06-18',
		category: 'food',
		linked_item: null,
		created_by: overrides.paid_by,
		created: '',
		updated: '',
		...overrides
	};
}

function cat(over: Partial<BudgetCategory> & Pick<BudgetCategory, 'category'>): BudgetCategory {
	return { mode: 'total', daily_amount: null, total: 0, ...over };
}

function makeBudget(categories: BudgetCategory[]): TripBudget {
	return { id: 'b1', trip: 'trip1', categories, created: '', updated: '' };
}

function makeItem(id: string, over: Partial<GlanceItem>): GlanceItem & { id: string } {
	return { id, booked: false, cost_estimate_usd: 0, ...over };
}

// --- groupBudgetTotal -----------------------------------------------------

describe('groupBudgetTotal', () => {
	it('returns null when there is no budget (so the page omits "left")', () => {
		expect(groupBudgetTotal(null, 5)).toBeNull();
	});

	it('sums total-mode categories directly', () => {
		const b = makeBudget([
			cat({ category: 'lodging', mode: 'total', total: 1000 }),
			cat({ category: 'activity', mode: 'total', total: 500 })
		]);
		expect(groupBudgetTotal(b, 5)).toBe(1500);
	});

	it('derives a per_day category as daily_amount x tripDays (PRD §82 formula)', () => {
		const b = makeBudget([cat({ category: 'food', mode: 'per_day', daily_amount: 60, total: 0 })]);
		// 60/day x 5 days = 300, even though total wasn't synced.
		expect(groupBudgetTotal(b, 5)).toBe(300);
	});

	it('mixes per_day and total categories', () => {
		const b = makeBudget([
			cat({ category: 'food', mode: 'per_day', daily_amount: 60, total: 300 }),
			cat({ category: 'lodging', mode: 'total', total: 1000 })
		]);
		// food: 60 x 5 = 300; lodging: 1000 -> 1300
		expect(groupBudgetTotal(b, 5)).toBe(1300);
	});

	it('falls back to total when a per_day category has a null daily_amount', () => {
		const b = makeBudget([cat({ category: 'food', mode: 'per_day', daily_amount: null, total: 250 })]);
		expect(groupBudgetTotal(b, 5)).toBe(250);
	});

	it('is zero (not null) for a budget whose categories are all zero', () => {
		const b = makeBudget([cat({ category: 'food', mode: 'total', total: 0 })]);
		expect(groupBudgetTotal(b, 5)).toBe(0);
	});
});

// --- myShareOfExpenses (reconciliation-aware) -----------------------------

describe('myShareOfExpenses', () => {
	it('is 0 with no expenses', () => {
		expect(myShareOfExpenses([], 'me')).toBe(0);
	});

	it('counts an equal split as amount / members — even when someone ELSE paid', () => {
		// Alice paid $90 split 3 ways; my (bob) share is $30 though I paid nothing.
		const e = makeExpense({
			paid_by: 'alice',
			amount_usd: 90,
			split_mode: 'equal',
			split_data: { members: ['alice', 'bob', 'charlie'] }
		});
		expect(myShareOfExpenses([e], 'bob')).toBeCloseTo(30);
	});

	it('counts my share when I AM the payer (out-of-pocket != share)', () => {
		// I (alice) paid $90 for 3 — I'm out $90 but my SHARE (consumption) is $30.
		const e = makeExpense({
			paid_by: 'alice',
			amount_usd: 90,
			split_mode: 'equal',
			split_data: { members: ['alice', 'bob', 'charlie'] }
		});
		expect(myShareOfExpenses([e], 'alice')).toBeCloseTo(30);
	});

	it('excludes me when I am not in the split', () => {
		const e = makeExpense({
			paid_by: 'alice',
			amount_usd: 90,
			split_mode: 'equal',
			split_data: { members: ['alice', 'charlie'] }
		});
		expect(myShareOfExpenses([e], 'bob')).toBe(0);
	});

	it('reads my exact amount from a by_amount split', () => {
		const e = makeExpense({
			paid_by: 'alice',
			amount_usd: 100,
			split_mode: 'by_amount',
			split_data: { amounts: { alice: 40, bob: 35, charlie: 25 } }
		});
		expect(myShareOfExpenses([e], 'bob')).toBeCloseTo(35);
		expect(myShareOfExpenses([e], 'me-not-here')).toBe(0);
	});

	it('sums my share across multiple expenses (the debt I owe counts)', () => {
		// $300 dinner Alice paid, split 2 ways -> I owe $150. Plus a $40 cab I paid,
		// split 2 ways -> my share $20. My total share = $170 (reconciliation-aware).
		const dinner = makeExpense({
			paid_by: 'alice',
			amount_usd: 300,
			split_mode: 'equal',
			split_data: { members: ['alice', 'bob'] }
		});
		const cab = makeExpense({
			paid_by: 'bob',
			amount_usd: 40,
			split_mode: 'equal',
			split_data: { members: ['alice', 'bob'] }
		});
		expect(myShareOfExpenses([dinner, cab], 'bob')).toBeCloseTo(170);
	});
});

// --- remainingPlannedTotal ------------------------------------------------

describe('remainingPlannedTotal', () => {
	it('sums estimates over unbooked, unlinked items', () => {
		const items = [
			makeItem('i1', { booked: false, cost_estimate_usd: 200 }),
			makeItem('i2', { booked: false, cost_estimate_usd: 100 })
		];
		expect(remainingPlannedTotal(items, new Set())).toBe(300);
	});

	it('excludes booked items (their money is spent / about to be)', () => {
		const items = [
			makeItem('i1', { booked: true, cost_estimate_usd: 200 }),
			makeItem('i2', { booked: false, cost_estimate_usd: 100 })
		];
		expect(remainingPlannedTotal(items, new Set())).toBe(100);
	});

	it('excludes items that already have a linked expense', () => {
		const items = [
			makeItem('i1', { booked: false, cost_estimate_usd: 200 }),
			makeItem('i2', { booked: false, cost_estimate_usd: 100 })
		];
		// i1 already captured as an expense -> drops out of the forecast.
		expect(remainingPlannedTotal(items, new Set(['i1']))).toBe(100);
	});

	it('ignores items with no / zero estimate', () => {
		const items = [
			makeItem('i1', { booked: false, cost_estimate_usd: 0 }),
			makeItem('i2', { booked: false })
		];
		expect(remainingPlannedTotal(items, new Set())).toBe(0);
	});
});

// --- remainingDays --------------------------------------------------------

describe('remainingDays', () => {
	it('counts inclusive of today (4 more days incl today)', () => {
		expect(remainingDays('2026-06-18', '2026-06-21')).toBe(4);
	});

	it('is 1 on the last day ("today is your last day")', () => {
		expect(remainingDays('2026-06-21', '2026-06-21')).toBe(1);
	});

	it('is 0 once the trip is over', () => {
		expect(remainingDays('2026-06-22', '2026-06-21')).toBe(0);
	});

	it('reads only the date part of a stored datetime', () => {
		expect(remainingDays('2026-06-18 09:00:00.000Z', '2026-06-21 00:00:00.000Z')).toBe(4);
	});
});

// --- moneyGlance (the whole per-person figure) ----------------------------

describe('moneyGlance', () => {
	const baseInput = {
		meId: 'bob',
		memberCount: 2,
		tripEnd: '2026-06-21',
		today: '2026-06-18', // 4 days left inclusive
		tripDays: 5
	};

	it('computes my budget = group total / members', () => {
		const budget = makeBudget([cat({ category: 'lodging', mode: 'total', total: 1000 })]);
		const g = moneyGlance([], budget, [], baseInput);
		expect(g.groupBudgetTotal).toBe(1000);
		expect(g.myBudget).toBe(500); // 1000 / 2
	});

	it('N1 = my budget - my reconciliation-aware share', () => {
		const budget = makeBudget([cat({ category: 'food', mode: 'total', total: 1000 })]);
		// $300 dinner Alice paid, split 2 ways -> my share $150.
		const dinner = makeExpense({
			paid_by: 'alice',
			amount_usd: 300,
			split_mode: 'equal',
			split_data: { members: ['alice', 'bob'] }
		});
		const g = moneyGlance([dinner], budget, [], baseInput);
		expect(g.myBudget).toBe(500); // 1000 / 2
		expect(g.myShare).toBeCloseTo(150);
		expect(g.n1LeftToSpend).toBeCloseTo(350); // 500 - 150
	});

	it('N2 = N1 - my share of remaining planned estimates', () => {
		const budget = makeBudget([cat({ category: 'food', mode: 'total', total: 1000 })]);
		const dinner = makeExpense({
			paid_by: 'alice',
			amount_usd: 300,
			split_mode: 'equal',
			split_data: { members: ['alice', 'bob'] }
		});
		// $400 of remaining planned (unbooked, unlinked) -> my share $200.
		const items = [makeItem('i1', { booked: false, cost_estimate_usd: 400 })];
		const g = moneyGlance([dinner], budget, items, baseInput);
		expect(g.remainingPlannedTotal).toBe(400);
		expect(g.myRemainingPlanned).toBe(200); // 400 / 2
		expect(g.n1LeftToSpend).toBeCloseTo(350); // 500 - 150
		expect(g.n2LeftForUnplanned).toBeCloseTo(150); // 350 - 200
	});

	it('exposes per-day rates for BOTH N1 and N2 (the hero framing)', () => {
		const budget = makeBudget([cat({ category: 'food', mode: 'total', total: 1000 })]);
		const dinner = makeExpense({
			paid_by: 'alice',
			amount_usd: 300,
			split_mode: 'equal',
			split_data: { members: ['alice', 'bob'] }
		});
		const items = [makeItem('i1', { booked: false, cost_estimate_usd: 400 })];
		const g = moneyGlance([dinner], budget, items, baseInput);
		expect(g.remainingDays).toBe(4);
		expect(g.n1PerDay).toBeCloseTo(87.5); // 350 / 4
		expect(g.n2PerDay).toBeCloseTo(37.5); // 150 / 4
	});

	it('derives my budget from a per_day category (60/day x 5d / 2 members)', () => {
		const budget = makeBudget([cat({ category: 'food', mode: 'per_day', daily_amount: 60, total: 0 })]);
		const g = moneyGlance([], budget, [], baseInput);
		expect(g.groupBudgetTotal).toBe(300); // 60 x 5
		expect(g.myBudget).toBe(150); // 300 / 2
	});

	// --- EDGE CASES (all binding acceptance criteria) ---

	it('EMPTY: no expenses, no items, no spend -> N1 = my budget, share 0', () => {
		const budget = makeBudget([cat({ category: 'lodging', mode: 'total', total: 1000 })]);
		const g = moneyGlance([], budget, [], baseInput);
		expect(g.myShare).toBe(0);
		expect(g.remainingPlannedTotal).toBe(0);
		expect(g.n1LeftToSpend).toBe(500);
		expect(g.n2LeftForUnplanned).toBe(500); // nothing planned -> N2 == N1
		expect(g.overBudget).toBe(false);
	});

	it('NO BUDGET: budget null -> myBudget / N1 / N2 / per-days all null, share still computed', () => {
		const dinner = makeExpense({
			paid_by: 'alice',
			amount_usd: 300,
			split_mode: 'equal',
			split_data: { members: ['alice', 'bob'] }
		});
		const g = moneyGlance([dinner], null, [], baseInput);
		expect(g.groupBudgetTotal).toBeNull();
		expect(g.myBudget).toBeNull();
		expect(g.myShare).toBeCloseTo(150); // still shows what I've consumed
		expect(g.n1LeftToSpend).toBeNull();
		expect(g.n1PerDay).toBeNull();
		expect(g.n2LeftForUnplanned).toBeNull();
		expect(g.n2PerDay).toBeNull();
		expect(g.overBudget).toBe(false);
	});

	it('OVER BUDGET: share exceeds my budget -> N1 negative, overBudget true', () => {
		const budget = makeBudget([cat({ category: 'food', mode: 'total', total: 200 })]);
		// $500 dinner split 2 ways -> my share $250 > my budget $100.
		const dinner = makeExpense({
			paid_by: 'alice',
			amount_usd: 500,
			split_mode: 'equal',
			split_data: { members: ['alice', 'bob'] }
		});
		const g = moneyGlance([dinner], budget, [], baseInput);
		expect(g.myBudget).toBe(100); // 200 / 2
		expect(g.myShare).toBeCloseTo(250);
		expect(g.n1LeftToSpend).toBeCloseTo(-150); // negative, not vanished
		expect(g.overBudget).toBe(true);
		expect(g.n1PerDay).toBeCloseTo(-37.5); // -150 / 4 — still a real rate
	});

	it('ZERO REMAINING DAYS: trip over -> per-day rates null, totals still computed', () => {
		const budget = makeBudget([cat({ category: 'food', mode: 'total', total: 1000 })]);
		const g = moneyGlance([], budget, [], { ...baseInput, today: '2026-06-22' });
		expect(g.remainingDays).toBe(0);
		expect(g.n1LeftToSpend).toBe(500); // total still meaningful
		expect(g.n1PerDay).toBeNull(); // no /0
		expect(g.n2PerDay).toBeNull();
	});

	it('guards memberCount of 0 (treats as 1, no divide-by-zero)', () => {
		const budget = makeBudget([cat({ category: 'food', mode: 'total', total: 500 })]);
		const g = moneyGlance([], budget, [], { ...baseInput, memberCount: 0 });
		expect(g.myBudget).toBe(500); // 500 / 1
	});

	it('solo trip (1 member): my budget == group total, my share == full consumption', () => {
		const budget = makeBudget([cat({ category: 'food', mode: 'total', total: 800 })]);
		const lunch = makeExpense({
			paid_by: 'bob',
			amount_usd: 50,
			split_mode: 'equal',
			split_data: { members: ['bob'] }
		});
		const g = moneyGlance([lunch], budget, [], { ...baseInput, memberCount: 1 });
		expect(g.myBudget).toBe(800);
		expect(g.myShare).toBeCloseTo(50);
		expect(g.n1LeftToSpend).toBeCloseTo(750);
	});

	it('a booked-and-logged item drops out of N2 (linked expense + booked both exclude)', () => {
		const budget = makeBudget([cat({ category: 'food', mode: 'total', total: 1000 })]);
		// i1 booked AND has a linked expense; i2 still remaining.
		const logged = makeExpense({
			paid_by: 'bob',
			amount_usd: 200,
			split_mode: 'equal',
			split_data: { members: ['alice', 'bob'] },
			linked_item: 'i1'
		});
		const items = [
			makeItem('i1', { booked: true, cost_estimate_usd: 200 }),
			makeItem('i2', { booked: false, cost_estimate_usd: 100 })
		];
		const g = moneyGlance([logged], budget, items, baseInput);
		expect(g.remainingPlannedTotal).toBe(100); // only i2
		expect(g.myShare).toBeCloseTo(100); // my half of the $200 logged
	});
});
