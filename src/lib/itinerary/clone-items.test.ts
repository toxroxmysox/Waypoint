import { describe, it, expect } from 'vitest';
import {
	CLONEABLE_ITEM_TYPES,
	cloneItemStatus,
	cloneItemPlacement
} from './clone-items';

describe('CLONEABLE_ITEM_TYPES (#173 — flights were dropped)', () => {
	it('includes flight (the type silently dropped from the copy set)', () => {
		expect(CLONEABLE_ITEM_TYPES).toContain('flight');
	});

	it('offers the plain item types', () => {
		expect(CLONEABLE_ITEM_TYPES).toEqual([
			'lodging',
			'transportation',
			'flight',
			'activity',
			'meal',
			'note'
		]);
	});

	it('excludes checklist (cloned via the dedicated checklist path, not as an item)', () => {
		expect(CLONEABLE_ITEM_TYPES).not.toContain('checklist');
	});
});

describe('cloneItemStatus (#173 — statuses were flattened)', () => {
	it('keeps unplanned ideas unplanned', () => {
		expect(cloneItemStatus('unplanned')).toBe('unplanned');
	});

	it('maps planned → planned', () => {
		expect(cloneItemStatus('planned')).toBe('planned');
	});

	it('resets done → planned (clone target is a fresh, future-dated plan)', () => {
		expect(cloneItemStatus('done')).toBe('planned');
	});

	it('resets considered → planned', () => {
		expect(cloneItemStatus('considered')).toBe('planned');
	});
});

describe('cloneItemPlacement (#196 — never day-less-but-planned)', () => {
	it('forces an unplanned idea day-less (parking lot), dropping any mapped day/phase', () => {
		const placement = cloneItemPlacement({
			sourceStatus: 'unplanned',
			mappedDay: 'day_target',
			mappedPhase: 'phase_target'
		});
		expect(placement).toEqual({ status: 'unplanned', day: '', phase: '' });
	});

	it('keeps a planned clone on its mapped day + phase', () => {
		const placement = cloneItemPlacement({
			sourceStatus: 'planned',
			mappedDay: 'day_target',
			mappedPhase: 'phase_target'
		});
		expect(placement).toEqual({ status: 'planned', day: 'day_target', phase: 'phase_target' });
	});

	it('a done item becomes planned AND keeps its day (so it is never day-less-but-planned)', () => {
		const placement = cloneItemPlacement({
			sourceStatus: 'done',
			mappedDay: 'day_target',
			mappedPhase: ''
		});
		expect(placement.status).toBe('planned');
		expect(placement.day).toBe('day_target');
	});

	it('a planned item whose day did not map (phases off) is downgraded to unplanned parking, NOT day-less-but-planned', () => {
		// Phases off ⇒ no days cloned ⇒ a would-be-planned item has no day to land
		// on. It must become an unplanned parking-lot idea, never planned+empty-day.
		const placement = cloneItemPlacement({
			sourceStatus: 'planned',
			mappedDay: '',
			mappedPhase: 'phase_target'
		});
		expect(placement).toEqual({ status: 'unplanned', day: '', phase: '' });
	});

	it('a done item whose day did not map also falls back to parking, never day-less-but-planned', () => {
		const placement = cloneItemPlacement({
			sourceStatus: 'done',
			mappedDay: '',
			mappedPhase: ''
		});
		expect(placement).toEqual({ status: 'unplanned', day: '', phase: '' });
	});
});
