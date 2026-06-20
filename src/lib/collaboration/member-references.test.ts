import { describe, it, expect } from 'vitest';
import { splitDataReferencesMember, anyExpenseSplitReferencesMember } from './member-references';
import type { SplitData } from '$lib/money/types';

describe('splitDataReferencesMember (#238 / ADR-0013)', () => {
	describe('equal split (members: [...])', () => {
		it('references a member listed in the equal split', () => {
			const split: SplitData = { members: ['mA', 'mB', 'mC'] };
			expect(splitDataReferencesMember(split, 'mB')).toBe(true);
		});

		it('does NOT reference a member absent from the equal split', () => {
			const split: SplitData = { members: ['mA', 'mC'] };
			expect(splitDataReferencesMember(split, 'mB')).toBe(false);
		});

		it('handles an empty members array', () => {
			const split = { members: [] } as unknown as SplitData;
			expect(splitDataReferencesMember(split, 'mB')).toBe(false);
		});
	});

	describe('by-amount split (amounts: { id: n })', () => {
		it('references a member who is a key in amounts (even a zero share)', () => {
			const split: SplitData = { amounts: { mA: 30, mB: 0 } };
			// mB owes 0 but is still a participant — referenced, must not purge.
			expect(splitDataReferencesMember(split, 'mB')).toBe(true);
		});

		it('does NOT reference a member missing from amounts', () => {
			const split: SplitData = { amounts: { mA: 50 } };
			expect(splitDataReferencesMember(split, 'mB')).toBe(false);
		});

		it('matches on the KEY, not a value coincidence', () => {
			const split: SplitData = { amounts: { mA: 10 } };
			// '10' is a value, not a key — must not match a member literally named "10".
			expect(splitDataReferencesMember(split, '10')).toBe(false);
		});
	});

	describe('defensive against malformed / partial data', () => {
		it('returns false for null/undefined split', () => {
			expect(splitDataReferencesMember(null, 'mA')).toBe(false);
			expect(splitDataReferencesMember(undefined, 'mA')).toBe(false);
		});

		it('returns false for an empty member id', () => {
			expect(splitDataReferencesMember({ members: ['mA'] }, '')).toBe(false);
		});

		it('returns false for an object with neither members nor amounts', () => {
			expect(splitDataReferencesMember({} as SplitData, 'mA')).toBe(false);
		});

		it('does not match inherited Object.prototype keys', () => {
			// "toString" is on Object.prototype but not an OWN key of amounts.
			const split: SplitData = { amounts: { mA: 5 } };
			expect(splitDataReferencesMember(split, 'toString')).toBe(false);
		});
	});
});

describe('anyExpenseSplitReferencesMember (#238)', () => {
	it('is true when the member is in ANY one expense split', () => {
		const expenses = [
			{ split_data: { members: ['mA', 'mC'] } as SplitData },
			{ split_data: { amounts: { mA: 20, mB: 30 } } as SplitData }
		];
		// mB is only in the second expense's amounts — still referenced.
		expect(anyExpenseSplitReferencesMember(expenses, 'mB')).toBe(true);
	});

	it('is false when no expense split references the member', () => {
		const expenses = [
			{ split_data: { members: ['mA', 'mC'] } as SplitData },
			{ split_data: { amounts: { mA: 20 } } as SplitData }
		];
		expect(anyExpenseSplitReferencesMember(expenses, 'mB')).toBe(false);
	});

	it('is false for an empty expense list (a vote-only / no-data member)', () => {
		expect(anyExpenseSplitReferencesMember([], 'mB')).toBe(false);
	});

	it('skips malformed split_data without throwing', () => {
		const expenses = [{ split_data: null }, { split_data: { members: ['mB'] } as SplitData }];
		expect(anyExpenseSplitReferencesMember(expenses, 'mB')).toBe(true);
	});
});
