import { describe, it, expect } from 'vitest';
import { computeMovePatch } from './move-item';
import type { ItemStatus } from './types';

describe('computeMovePatch — day set', () => {
	it('unplanned → planned when given a day', () => {
		const patch = computeMovePatch({ currentStatus: 'unplanned', newDay: 'day1', newPhase: 'ph1' });
		expect(patch).toEqual({ day: 'day1', phase: 'ph1', status: 'planned' });
	});

	it('planned stays planned on a (re)assigned day', () => {
		const patch = computeMovePatch({ currentStatus: 'planned', newDay: 'day2', newPhase: 'ph1' });
		expect(patch).toEqual({ day: 'day2', phase: 'ph1', status: 'planned' });
	});

	it('done is preserved (closeout-terminal) even when moved to a day', () => {
		const patch = computeMovePatch({ currentStatus: 'done', newDay: 'day1', newPhase: 'ph1' });
		expect(patch.status).toBe('done');
		expect(patch.day).toBe('day1');
	});

	it('considered is preserved (closeout-terminal) when moved to a day', () => {
		const patch = computeMovePatch({ currentStatus: 'considered', newDay: 'day1', newPhase: 'ph1' });
		expect(patch.status).toBe('considered');
		expect(patch.day).toBe('day1');
	});

	it('does not strip times or reset sort_order when a day is set', () => {
		const patch = computeMovePatch({ currentStatus: 'unplanned', newDay: 'day1', newPhase: 'ph1' });
		expect(patch).not.toHaveProperty('start_time');
		expect(patch).not.toHaveProperty('end_time');
		expect(patch).not.toHaveProperty('sort_order');
	});
});

describe('computeMovePatch — day cleared', () => {
	it('planned → unplanned when the day is cleared', () => {
		const patch = computeMovePatch({ currentStatus: 'planned', newDay: '', newPhase: 'ph1' });
		expect(patch.status).toBe('unplanned');
		expect(patch.day).toBe('');
		expect(patch.phase).toBe('ph1');
	});

	it('unplanned stays unplanned with no day', () => {
		const patch = computeMovePatch({ currentStatus: 'unplanned', newDay: '', newPhase: 'ph1' });
		expect(patch.status).toBe('unplanned');
	});

	it('strips the time anchor and resets sort_order when unscheduling', () => {
		const patch = computeMovePatch({ currentStatus: 'planned', newDay: '', newPhase: 'ph1' });
		expect(patch.start_time).toBe('');
		expect(patch.end_time).toBe('');
		expect(patch.sort_order).toBe(0);
	});

	it('done is preserved when the day is cleared (terminal, not auto-flipped)', () => {
		const patch = computeMovePatch({ currentStatus: 'done', newDay: '', newPhase: 'ph1' });
		expect(patch.status).toBe('done');
	});

	it('considered is preserved when the day is cleared', () => {
		const patch = computeMovePatch({ currentStatus: 'considered', newDay: '', newPhase: '' });
		expect(patch.status).toBe('considered');
		expect(patch.phase).toBe('');
	});
});

describe('computeMovePatch — invariant: status and day never contradict', () => {
	const statuses: ItemStatus[] = ['unplanned', 'planned', 'done', 'considered'];

	for (const status of statuses) {
		it(`day set + ${status}: result is never the contradictory unplanned-with-day`, () => {
			const patch = computeMovePatch({ currentStatus: status, newDay: 'day1', newPhase: 'ph1' });
			// A day-anchored item must not be 'unplanned'.
			expect(patch.day).toBe('day1');
			expect(patch.status).not.toBe('unplanned');
		});

		it(`day cleared + ${status}: result is never the contradictory planned-without-day`, () => {
			const patch = computeMovePatch({ currentStatus: status, newDay: '', newPhase: 'ph1' });
			// A day-less item must not be 'planned'.
			expect(patch.day).toBe('');
			expect(patch.status).not.toBe('planned');
		});
	}

	it('normalizes falsy day/phase to empty strings', () => {
		const patch = computeMovePatch({
			currentStatus: 'planned',
			newDay: undefined as unknown as string,
			newPhase: undefined as unknown as string
		});
		expect(patch.day).toBe('');
		expect(patch.phase).toBe('');
		expect(patch.status).toBe('unplanned');
	});
});
