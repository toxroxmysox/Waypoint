import { describe, it, expect } from 'vitest';
import type { Expense, Settlement } from '$lib/types';
import { simplifyDebts } from './debt-simplify';
import {
	buildMemberUnitMap,
	aggregateBalancesByUnit,
	simplifyDebtsByUnit,
	defaultUnitBudget,
	effectiveUnitBudget,
	unitSpent,
	unitForMember,
	unitDebts,
	type MoneyUnit
} from './money-units';
import { computeBalances } from './debt-simplify';

function makeExpense(
	overrides: Partial<Expense> & Pick<Expense, 'paid_by' | 'amount_usd' | 'split_mode' | 'split_data'>
): Expense {
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
		...overrides
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
		updated: ''
	};
}

describe('buildMemberUnitMap', () => {
	it('maps unit members to the unit id and solo members to their own id', () => {
		const units: MoneyUnit[] = [{ id: 'u1', members: ['scott', 'abby'] }];
		const map = buildMemberUnitMap(units, ['scott', 'abby', 'mary']);
		expect(map.get('scott')).toBe('u1');
		expect(map.get('abby')).toBe('u1');
		// mary is in no unit → her own unit of one
		expect(map.get('mary')).toBe('mary');
	});

	it('first unit wins if a member appears in two (deterministic)', () => {
		const units: MoneyUnit[] = [
			{ id: 'u1', members: ['scott'] },
			{ id: 'u2', members: ['scott', 'abby'] }
		];
		const map = buildMemberUnitMap(units, ['scott', 'abby']);
		expect(map.get('scott')).toBe('u1');
		expect(map.get('abby')).toBe('u2');
	});

	it('covers every active member even with no units', () => {
		const map = buildMemberUnitMap([], ['a', 'b']);
		expect(map.get('a')).toBe('a');
		expect(map.get('b')).toBe('b');
	});
});

describe('aggregateBalancesByUnit', () => {
	it('sums member balances into their unit nodes — intra-unit washes', () => {
		// Scott +200, Abby -100 in the same unit → unit nets +100.
		const memberBalances = new Map([
			['scott', 200],
			['abby', -100],
			['mary', -100]
		]);
		const map = buildMemberUnitMap([{ id: 'u1', members: ['scott', 'abby'] }], [
			'scott',
			'abby',
			'mary'
		]);
		const unitBalances = aggregateBalancesByUnit(memberBalances, map);
		expect(unitBalances.get('u1')).toBeCloseTo(100);
		expect(unitBalances.get('mary')).toBeCloseTo(-100);
	});

	it('an intra-unit-only debt washes to zero at the node', () => {
		// Scott +50, Abby -50, same unit → node balance 0.
		const memberBalances = new Map([
			['scott', 50],
			['abby', -50]
		]);
		const map = buildMemberUnitMap([{ id: 'u1', members: ['scott', 'abby'] }], ['scott', 'abby']);
		const unitBalances = aggregateBalancesByUnit(memberBalances, map);
		expect(unitBalances.get('u1')).toBeCloseTo(0);
	});
});

describe('simplifyDebtsByUnit', () => {
	it('ADR-0015 worked example: intra-unit washes, inter-unit nets to ONE settlement', () => {
		// Scott pays a $400 dinner split 4 ways → each owes $100.
		// Balances: scott +300, abby -100, alex -100, justin -100.
		// Units: {scott,abby}=u1, {alex,justin}=u2.
		//   u1 = +300 + (-100) = +200 ; u2 = -100 + -100 = -200.
		// Settle: u2 -> u1 for $200, a SINGLE payment. No intra-unit Scott↔Abby.
		const expenses = [
			makeExpense({
				paid_by: 'scott',
				amount_usd: 400,
				split_mode: 'equal',
				split_data: { members: ['scott', 'abby', 'alex', 'justin'] }
			})
		];
		const units: MoneyUnit[] = [
			{ id: 'u1', members: ['scott', 'abby'] },
			{ id: 'u2', members: ['alex', 'justin'] }
		];
		const edges = simplifyDebtsByUnit(expenses, [], units, ['scott', 'abby', 'alex', 'justin']);

		expect(edges).toHaveLength(1);
		expect(edges[0]).toEqual({ from: 'u2', to: 'u1', amount: 200 });

		// Contrast: the per-person settle-up needs THREE payments.
		expect(simplifyDebts(expenses, [])).toHaveLength(3);
	});

	it('a purely intra-unit debt produces ZERO settlements (Scott↔Abby washes)', () => {
		// Scott pays a $100 expense split between scott + abby only.
		// Balances: scott +50, abby -50 → same unit → nets to 0 → nothing to settle.
		const expenses = [
			makeExpense({
				paid_by: 'scott',
				amount_usd: 100,
				split_mode: 'equal',
				split_data: { members: ['scott', 'abby'] }
			})
		];
		const units: MoneyUnit[] = [{ id: 'u1', members: ['scott', 'abby'] }];
		const edges = simplifyDebtsByUnit(expenses, [], units, ['scott', 'abby']);
		expect(edges).toEqual([]);
		// Per-person, abby owes scott $50.
		expect(simplifyDebts(expenses, [])).toHaveLength(1);
	});

	it('with NO units declared, reduces EXACTLY to per-person simplifyDebts', () => {
		const expenses = [
			makeExpense({
				paid_by: 'alice',
				amount_usd: 90,
				split_mode: 'equal',
				split_data: { members: ['alice', 'bob', 'charlie'] }
			})
		];
		const members = ['alice', 'bob', 'charlie'];
		const byUnit = simplifyDebtsByUnit(expenses, [], [], members);
		const perPerson = simplifyDebts(expenses, []);
		expect(byUnit).toEqual(perPerson);
	});

	it('one member settling the unit net clears every co-member share (settlement applied at member level)', () => {
		// Same $400 dinner. Justin (in u2) pays the full $200 inter-unit net to u1 — recorded
		// as a member-level settlement justin -> scott. After it, all unit nodes net to 0.
		const expenses = [
			makeExpense({
				paid_by: 'scott',
				amount_usd: 400,
				split_mode: 'equal',
				split_data: { members: ['scott', 'abby', 'alex', 'justin'] }
			})
		];
		const settlements = [makeSettlement('justin', 'scott', 200)];
		const units: MoneyUnit[] = [
			{ id: 'u1', members: ['scott', 'abby'] },
			{ id: 'u2', members: ['alex', 'justin'] }
		];
		const edges = simplifyDebtsByUnit(expenses, settlements, units, [
			'scott',
			'abby',
			'alex',
			'justin'
		]);
		expect(edges).toEqual([]); // unit nets all zero → settled
	});

	it('inter-unit net is correct when a solo member sits alongside units', () => {
		// scott pays $300 split 3 ways (scott, abby, mary). scott+abby = u1, mary solo.
		// Balances: scott +200, abby -100, mary -100. u1 = +100, mary = -100.
		// Settle: mary -> u1 $100.
		const expenses = [
			makeExpense({
				paid_by: 'scott',
				amount_usd: 300,
				split_mode: 'equal',
				split_data: { members: ['scott', 'abby', 'mary'] }
			})
		];
		const units: MoneyUnit[] = [{ id: 'u1', members: ['scott', 'abby'] }];
		const edges = simplifyDebtsByUnit(expenses, [], units, ['scott', 'abby', 'mary']);
		expect(edges).toHaveLength(1);
		expect(edges[0]).toEqual({ from: 'mary', to: 'u1', amount: 100 });
	});

	it('the aggregation never alters per-person split attribution (split is untouched)', () => {
		// Sanity: per-member balances are identical whether or not units exist — units only
		// affect the SETTLE-UP node grouping, never computeBalances.
		const expenses = [
			makeExpense({
				paid_by: 'scott',
				amount_usd: 400,
				split_mode: 'equal',
				split_data: { members: ['scott', 'abby', 'alex', 'justin'] }
			})
		];
		const balances = computeBalances(expenses, []);
		expect(balances.get('scott')).toBeCloseTo(300);
		expect(balances.get('abby')).toBeCloseTo(-100);
		expect(balances.get('alex')).toBeCloseTo(-100);
		expect(balances.get('justin')).toBeCloseTo(-100);
	});
});

describe('defaultUnitBudget', () => {
	it('even share scaled by unit size: (group ÷ heads) × unitSize', () => {
		// $1000 group, 4 heads, a 2-person unit → (1000/4)*2 = 500.
		expect(defaultUnitBudget(1000, 4, 2)).toBeCloseTo(500);
	});

	it('a solo unit gets the single per-head share', () => {
		expect(defaultUnitBudget(1000, 4, 1)).toBeCloseTo(250);
	});

	it('null group budget → null', () => {
		expect(defaultUnitBudget(null, 4, 2)).toBeNull();
	});

	it('guards against zero heads', () => {
		expect(defaultUnitBudget(1000, 0, 1)).toBeCloseTo(1000);
	});
});

describe('effectiveUnitBudget', () => {
	it('uses the absolute override when set (does NOT redistribute, ignores group total)', () => {
		const unit = { members: ['scott', 'abby'], budget_usd: 1200 };
		expect(effectiveUnitBudget(unit, 1000, 4)).toBe(1200);
	});

	it('override is symmetric BELOW the even share (a tighter target, not a floor)', () => {
		const unit = { members: ['scott', 'abby'], budget_usd: 300 };
		// even share would be (1000/4)*2 = 500; the override of 300 stands.
		expect(effectiveUnitBudget(unit, 1000, 4)).toBe(300);
	});

	it('falls back to the even-share default when no override', () => {
		const unit = { members: ['scott', 'abby'], budget_usd: null };
		expect(effectiveUnitBudget(unit, 1000, 4)).toBeCloseTo(500);
	});

	it('null when neither override nor group budget exists', () => {
		expect(effectiveUnitBudget({ members: ['scott'], budget_usd: null }, null, 4)).toBeNull();
	});

	it('a zero override is honored (0 is a valid absolute target, not "unset")', () => {
		expect(effectiveUnitBudget({ members: ['scott'], budget_usd: 0 }, 1000, 4)).toBe(0);
	});
});

describe('unitSpent', () => {
	it('sums the unit members shares', () => {
		const shares = new Map([
			['scott', 120],
			['abby', 80],
			['mary', 200]
		]);
		expect(unitSpent(shares, ['scott', 'abby'])).toBeCloseTo(200);
	});

	it('members with no share contribute 0', () => {
		const shares = new Map([['scott', 50]]);
		expect(unitSpent(shares, ['scott', 'abby'])).toBeCloseTo(50);
	});

	it('sum of unit budgets need NOT equal the group total (decoupled) — but spent attribution is exhaustive', () => {
		// Every member's share is attributed to exactly one unit, so Σ unit spent = Σ shares.
		const shares = new Map([
			['scott', 100],
			['abby', 100],
			['mary', 100]
		]);
		const u1 = unitSpent(shares, ['scott', 'abby']);
		const solo = unitSpent(shares, ['mary']);
		expect(u1 + solo).toBeCloseTo(300);
	});
});

describe('unitForMember', () => {
	it('returns the declared unit containing the member', () => {
		const units: MoneyUnit[] = [{ id: 'u1', members: ['scott', 'abby'] }];
		expect(unitForMember(units, 'abby').id).toBe('u1');
	});

	it('returns a synthetic unit-of-one for a solo member', () => {
		const unit = unitForMember([{ id: 'u1', members: ['scott'] }], 'mary');
		expect(unit).toEqual({ id: 'mary', members: ['mary'], budget_usd: null });
	});
});

describe('unitDebts (recordable at member level)', () => {
	it('maps unit nodes to representative members while keeping unit keys for labels', () => {
		// The ADR $400 dinner: u2 -> u1 for $200. Representative of u1 = scott (first member),
		// of u2 = alex. So the settlement records alex -> scott $200 — settling the unit net.
		const expenses = [
			makeExpense({
				paid_by: 'scott',
				amount_usd: 400,
				split_mode: 'equal',
				split_data: { members: ['scott', 'abby', 'alex', 'justin'] }
			})
		];
		const units: MoneyUnit[] = [
			{ id: 'u1', members: ['scott', 'abby'] },
			{ id: 'u2', members: ['alex', 'justin'] }
		];
		const edges = unitDebts(expenses, [], units, ['scott', 'abby', 'alex', 'justin']);
		expect(edges).toHaveLength(1);
		expect(edges[0]).toEqual({
			fromMember: 'alex',
			toMember: 'scott',
			fromUnit: 'u2',
			toUnit: 'u1',
			amount: 200
		});
	});

	it('recording that representative member settlement nets every co-member to zero', () => {
		// Apply the alex -> scott $200 settlement from the previous case; re-run → settled.
		const expenses = [
			makeExpense({
				paid_by: 'scott',
				amount_usd: 400,
				split_mode: 'equal',
				split_data: { members: ['scott', 'abby', 'alex', 'justin'] }
			})
		];
		const units: MoneyUnit[] = [
			{ id: 'u1', members: ['scott', 'abby'] },
			{ id: 'u2', members: ['alex', 'justin'] }
		];
		const settlements = [makeSettlement('alex', 'scott', 200)];
		expect(unitDebts(expenses, settlements, units, ['scott', 'abby', 'alex', 'justin'])).toEqual(
			[]
		);
	});

	it('a solo node keeps the member as its own representative', () => {
		const expenses = [
			makeExpense({
				paid_by: 'scott',
				amount_usd: 300,
				split_mode: 'equal',
				split_data: { members: ['scott', 'abby', 'mary'] }
			})
		];
		const units: MoneyUnit[] = [{ id: 'u1', members: ['scott', 'abby'] }];
		const edges = unitDebts(expenses, [], units, ['scott', 'abby', 'mary']);
		expect(edges).toHaveLength(1);
		expect(edges[0].fromMember).toBe('mary');
		expect(edges[0].fromUnit).toBe('mary');
		expect(edges[0].toUnit).toBe('u1');
		expect(edges[0].toMember).toBe('scott');
		expect(edges[0].amount).toBe(100);
	});
});
