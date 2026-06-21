import { describe, it, expect } from 'vitest';
import { transferSplitParticipation, splitNeedsTransfer } from './transfer-split';
import type { SplitData } from './types';

// #259 — move-to-target with MERGE semantics. Bob departs, reassigned to Alice.
const BOB = 'mBob';
const ALICE = 'mAlice';
const CAROL = 'mCarol';

describe('transferSplitParticipation (#259, move-to-target merge)', () => {
	describe('equal split { members: [...] }', () => {
		it('replaces the departed member with the target', () => {
			const split: SplitData = { members: [BOB, CAROL] };
			expect(transferSplitParticipation(split, BOB, ALICE)).toEqual({
				members: [ALICE, CAROL]
			});
		});

		it('dedupes when the target is ALREADY present (target before departed)', () => {
			const split: SplitData = { members: [ALICE, BOB, CAROL] };
			// Alice must appear exactly once after the merge.
			expect(transferSplitParticipation(split, BOB, ALICE)).toEqual({
				members: [ALICE, CAROL]
			});
		});

		it('dedupes when the target is ALREADY present (departed before target)', () => {
			const split: SplitData = { members: [CAROL, BOB, ALICE] };
			expect(transferSplitParticipation(split, BOB, ALICE)).toEqual({
				members: [CAROL, ALICE]
			});
		});

		it('preserves order of untouched members', () => {
			const split: SplitData = { members: [CAROL, BOB] };
			expect(transferSplitParticipation(split, BOB, ALICE)).toEqual({
				members: [CAROL, ALICE]
			});
		});

		it('returns the split UNCHANGED when the departed member is absent', () => {
			const split: SplitData = { members: [ALICE, CAROL] };
			const out = transferSplitParticipation(split, BOB, ALICE);
			expect(out).toBe(split); // same reference — caller skips the save
		});
	});

	describe('by_amount split { amounts: { id: n } }', () => {
		it("moves the departed member's amount to the target (target absent)", () => {
			const split: SplitData = { amounts: { [BOB]: 30, [CAROL]: 20 } };
			expect(transferSplitParticipation(split, BOB, ALICE)).toEqual({
				amounts: { [CAROL]: 20, [ALICE]: 30 }
			});
		});

		it('SUMS when the target already has an amount', () => {
			const split: SplitData = { amounts: { [BOB]: 30, [ALICE]: 10, [CAROL]: 20 } };
			// Alice's 10 + Bob's 30 = 40; Bob key dropped.
			const out = transferSplitParticipation(split, BOB, ALICE) as { amounts: Record<string, number> };
			expect(out.amounts[ALICE]).toBe(40);
			expect(out.amounts[CAROL]).toBe(20);
			expect(out.amounts).not.toHaveProperty(BOB);
		});

		it('moves a zero share (participant who owes 0) to the target', () => {
			const split: SplitData = { amounts: { [BOB]: 0, [CAROL]: 50 } };
			expect(transferSplitParticipation(split, BOB, ALICE)).toEqual({
				amounts: { [CAROL]: 50, [ALICE]: 0 }
			});
		});

		it('sums a zero target with the moved amount', () => {
			const split: SplitData = { amounts: { [BOB]: 25, [ALICE]: 0 } };
			const out = transferSplitParticipation(split, BOB, ALICE) as { amounts: Record<string, number> };
			expect(out.amounts[ALICE]).toBe(25);
			expect(out.amounts).not.toHaveProperty(BOB);
		});

		it('returns the split UNCHANGED when the departed member is absent', () => {
			const split: SplitData = { amounts: { [ALICE]: 10, [CAROL]: 20 } };
			const out = transferSplitParticipation(split, BOB, ALICE);
			expect(out).toBe(split);
		});
	});

	describe('guards / malformed input', () => {
		it('is a no-op when fromId === toId', () => {
			const split: SplitData = { members: [BOB, CAROL] };
			expect(transferSplitParticipation(split, BOB, BOB)).toBe(split);
		});

		it('is a no-op on empty fromId or toId', () => {
			const split: SplitData = { members: [BOB] };
			expect(transferSplitParticipation(split, '', ALICE)).toBe(split);
			expect(transferSplitParticipation(split, BOB, '')).toBe(split);
		});

		it('returns null/undefined untouched', () => {
			expect(transferSplitParticipation(null, BOB, ALICE)).toBeNull();
			expect(transferSplitParticipation(undefined, BOB, ALICE)).toBeUndefined();
		});

		it('leaves an object with neither shape untouched', () => {
			const split = {} as unknown as SplitData;
			expect(transferSplitParticipation(split, BOB, ALICE)).toBe(split);
		});
	});

	describe('mixed-shape batch (both shapes in one trip)', () => {
		it('rewrites each expense by its own shape, untouched ones unchanged', () => {
			const equalHit: SplitData = { members: [BOB, CAROL] };
			const byAmountHit: SplitData = { amounts: { [BOB]: 15, [ALICE]: 5 } };
			const equalMiss: SplitData = { members: [ALICE, CAROL] };
			const byAmountMiss: SplitData = { amounts: { [CAROL]: 99 } };

			expect(transferSplitParticipation(equalHit, BOB, ALICE)).toEqual({ members: [ALICE, CAROL] });
			const merged = transferSplitParticipation(byAmountHit, BOB, ALICE) as {
				amounts: Record<string, number>;
			};
			expect(merged.amounts[ALICE]).toBe(20);
			expect(transferSplitParticipation(equalMiss, BOB, ALICE)).toBe(equalMiss);
			expect(transferSplitParticipation(byAmountMiss, BOB, ALICE)).toBe(byAmountMiss);
		});
	});
});

describe('splitNeedsTransfer (#259)', () => {
	it('true when departed participates in an equal split', () => {
		expect(splitNeedsTransfer({ members: [BOB, CAROL] }, BOB)).toBe(true);
	});
	it('false when departed absent from an equal split', () => {
		expect(splitNeedsTransfer({ members: [ALICE] }, BOB)).toBe(false);
	});
	it('true when departed is a key in a by_amount split (even 0)', () => {
		expect(splitNeedsTransfer({ amounts: { [BOB]: 0 } }, BOB)).toBe(true);
	});
	it('false for malformed / empty input', () => {
		expect(splitNeedsTransfer(null, BOB)).toBe(false);
		expect(splitNeedsTransfer({} as unknown as SplitData, BOB)).toBe(false);
		expect(splitNeedsTransfer({ members: [BOB] }, '')).toBe(false);
	});
});
