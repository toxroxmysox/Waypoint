import { describe, it, expect } from 'vitest';
import { canSelfAssign, toggleAssignee } from './assignment';

describe('canSelfAssign', () => {
	it('allows traveler, co_owner, owner', () => {
		expect(canSelfAssign('traveler')).toBe(true);
		expect(canSelfAssign('co_owner')).toBe(true);
		expect(canSelfAssign('owner')).toBe(true);
	});

	it('denies viewer', () => {
		expect(canSelfAssign('viewer')).toBe(false);
	});

	it('denies an unknown / blank / missing role (non-member)', () => {
		expect(canSelfAssign('')).toBe(false);
		expect(canSelfAssign(undefined)).toBe(false);
		expect(canSelfAssign(null)).toBe(false);
		expect(canSelfAssign('stranger')).toBe(false);
	});
});

describe('toggleAssignee', () => {
	it('adds the member when absent (appends to the end)', () => {
		expect(toggleAssignee([], 'm1')).toEqual(['m1']);
		expect(toggleAssignee(['m1', 'm2'], 'm3')).toEqual(['m1', 'm2', 'm3']);
	});

	it('removes the member when present', () => {
		expect(toggleAssignee(['m1'], 'm1')).toEqual([]);
		expect(toggleAssignee(['m1', 'm2', 'm3'], 'm2')).toEqual(['m1', 'm3']);
	});

	it('round-trips the membership when toggled twice (add→remove restores exactly)', () => {
		const start = ['m1', 'm2'];
		const once = toggleAssignee(start, 'm3');
		const twice = toggleAssignee(once, 'm3');
		expect(twice).toEqual(start);
	});

	it('toggling an existing id off then on re-adds it (order-stable: appended)', () => {
		const start = ['m1', 'm2'];
		const off = toggleAssignee(start, 'm1'); // ['m2']
		const onAgain = toggleAssignee(off, 'm1'); // ['m2','m1'] — append, not original order
		expect(onAgain).toEqual(['m2', 'm1']);
		expect(new Set(onAgain)).toEqual(new Set(start)); // same membership
	});

	it('is order-stable: the rest keep their order when one is removed', () => {
		expect(toggleAssignee(['a', 'b', 'c', 'd'], 'c')).toEqual(['a', 'b', 'd']);
	});

	it('never produces duplicates (adding an existing id removes it instead)', () => {
		const out = toggleAssignee(['m1', 'm2'], 'm1');
		expect(out).toEqual(['m2']);
		expect(new Set(out).size).toBe(out.length);
	});

	it('does not mutate the input array', () => {
		const start = ['m1', 'm2'];
		const copy = [...start];
		toggleAssignee(start, 'm3');
		toggleAssignee(start, 'm1');
		expect(start).toEqual(copy);
	});
});
