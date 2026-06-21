import { describe, it, expect } from 'vitest';
import { presetMembers, activePreset } from './split-presets';

const ALL = ['m1', 'm2', 'm3'];
const ME = 'm2';

describe('presetMembers', () => {
	it('whole_group selects every active member', () => {
		expect(presetMembers('whole_group', ALL, ME)).toEqual(new Set(['m1', 'm2', 'm3']));
	});

	it('just_me selects only the current member', () => {
		expect(presetMembers('just_me', ALL, ME)).toEqual(new Set(['m2']));
	});

	it('just_me works even if current member is not in the list (defensive)', () => {
		expect(presetMembers('just_me', ['m1', 'm3'], ME)).toEqual(new Set(['m2']));
	});

	it('whole_group on a solo trip equals just_me', () => {
		expect(presetMembers('whole_group', ['m2'], ME)).toEqual(new Set(['m2']));
	});
});

describe('activePreset', () => {
	it('matches whole_group when all members are selected', () => {
		expect(activePreset('equal', new Set(ALL), ALL, ME)).toBe('whole_group');
	});

	it('matches just_me when only the current member is selected', () => {
		expect(activePreset('equal', new Set([ME]), ALL, ME)).toBe('just_me');
	});

	it('returns null for a partial subset (preset must not lie after a toggle)', () => {
		expect(activePreset('equal', new Set(['m1', 'm2']), ALL, ME)).toBeNull();
	});

	it('returns null when split mode is by_amount', () => {
		expect(activePreset('by_amount', new Set(ALL), ALL, ME)).toBeNull();
	});

	it('returns null for the empty set', () => {
		expect(activePreset('equal', new Set(), ALL, ME)).toBeNull();
	});

	it('is order-independent', () => {
		expect(activePreset('equal', new Set(['m3', 'm1', 'm2']), ['m1', 'm2', 'm3'], ME)).toBe(
			'whole_group'
		);
	});

	it('prefers just_me on a solo trip (single member == both whole_group and just_me)', () => {
		// When the trip has one member and that member is you, the selected set
		// {me} matches both definitions; the matcher checks just_me first.
		expect(activePreset('equal', new Set([ME]), [ME], ME)).toBe('just_me');
	});
});
