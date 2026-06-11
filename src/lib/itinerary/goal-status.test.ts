import { describe, it, expect } from 'vitest';
import { STATUS_MATURITY, deriveGoalStatus } from './goal-status';
import type { GoalStatus, ItemStatus } from './types';

describe('STATUS_MATURITY', () => {
	it('ranks the total order done > planned > unplanned > considered', () => {
		expect(STATUS_MATURITY.done).toBeGreaterThan(STATUS_MATURITY.planned);
		expect(STATUS_MATURITY.planned).toBeGreaterThan(STATUS_MATURITY.unplanned);
		expect(STATUS_MATURITY.unplanned).toBeGreaterThan(STATUS_MATURITY.considered);
	});
});

describe('deriveGoalStatus — zero linked items (manual fallback)', () => {
	it('falls back to manual_status when there are no links', () => {
		expect(deriveGoalStatus([], 'unplanned')).toBe('unplanned');
		expect(deriveGoalStatus([], 'planned')).toBe('planned');
		expect(deriveGoalStatus([], 'done')).toBe('done');
		expect(deriveGoalStatus([], 'considered')).toBe('considered');
	});
});

describe('deriveGoalStatus — has links (most-mature wins, manual ignored)', () => {
	it('picks the highest-maturity status across mixed statuses', () => {
		expect(deriveGoalStatus(['considered', 'planned', 'unplanned'], 'unplanned')).toBe('planned');
		expect(deriveGoalStatus(['unplanned', 'done', 'planned'], 'unplanned')).toBe('done');
		expect(deriveGoalStatus(['considered', 'unplanned'], 'done')).toBe('unplanned');
	});

	it('honors the total order regardless of input ordering', () => {
		// done beats everything
		expect(deriveGoalStatus(['considered', 'unplanned', 'planned', 'done'], 'considered')).toBe('done');
		// planned beats unplanned + considered
		expect(deriveGoalStatus(['unplanned', 'considered', 'planned'], 'considered')).toBe('planned');
		// unplanned beats considered
		expect(deriveGoalStatus(['considered', 'unplanned'], 'considered')).toBe('unplanned');
	});

	it('is considered ONLY when every linked item is considered', () => {
		expect(deriveGoalStatus(['considered'], 'planned')).toBe('considered');
		expect(deriveGoalStatus(['considered', 'considered', 'considered'], 'done')).toBe('considered');
		// one non-considered link breaks it
		expect(deriveGoalStatus(['considered', 'unplanned'], 'done')).not.toBe('considered');
	});

	it('ignores manual_status entirely while links exist', () => {
		const links: ItemStatus[] = ['planned'];
		expect(deriveGoalStatus(links, 'done')).toBe('planned');
		expect(deriveGoalStatus(links, 'considered')).toBe('planned');
		expect(deriveGoalStatus(links, 'unplanned')).toBe('planned');
	});

	it('flips a manual goal to derived the moment a link is added', () => {
		// Unlinked: reads its manual status.
		expect(deriveGoalStatus([], 'considered')).toBe('considered');
		// Link a single planned item → derived overrides the manual value.
		expect(deriveGoalStatus(['planned'], 'considered')).toBe('planned');
	});

	it('does not mutate the input array', () => {
		const links: ItemStatus[] = ['considered', 'planned'];
		const copy = [...links];
		deriveGoalStatus(links, 'unplanned');
		expect(links).toEqual(copy);
	});
});

describe('deriveGoalStatus — off-enum / empty status clamps to considered (#149)', () => {
	// Malformed PB data (status '' or outside the enum) must never escape as a
	// STATUS_META key. Unknown maturity clamps to the lowest rung so garbage can
	// never outrank a genuine status.
	it('clamps an empty-string linked status', () => {
		expect(deriveGoalStatus([''] as unknown as ItemStatus[], 'planned')).toBe('considered');
	});

	it('clamps an unknown linked status', () => {
		expect(deriveGoalStatus(['booked'] as unknown as ItemStatus[], 'done')).toBe('considered');
	});

	it('never lets a malformed status outrank valid linked statuses', () => {
		expect(deriveGoalStatus(['', 'planned'] as unknown as ItemStatus[], 'considered')).toBe(
			'planned'
		);
		expect(deriveGoalStatus(['unplanned', ''] as unknown as ItemStatus[], 'done')).toBe(
			'unplanned'
		);
	});

	it('clamps an off-enum manual_status on the zero-link fallback path', () => {
		expect(deriveGoalStatus([], '' as unknown as GoalStatus)).toBe('considered');
		expect(deriveGoalStatus([], 'wish' as unknown as GoalStatus)).toBe('considered');
	});
});
