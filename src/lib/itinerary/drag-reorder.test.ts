import { describe, it, expect } from 'vitest';
import { neighborsForMove, resolveDrop } from './drag-reorder';
import type { DropContext } from './drag-reorder';

const ordered = (...pairs: [string, number][]) =>
	pairs.map(([id, sort_order]) => ({ id, sort_order }));

describe('neighborsForMove', () => {
	it('returns surrounding sort_orders for a middle drop', () => {
		const list = ordered(['a', 100], ['x', 150], ['b', 200]);
		expect(neighborsForMove(list, 'x')).toEqual({ before: 100, after: 200 });
	});

	it('returns null before when dropped first', () => {
		const list = ordered(['x', 50], ['a', 100], ['b', 200]);
		expect(neighborsForMove(list, 'x')).toEqual({ before: null, after: 100 });
	});

	it('returns null after when dropped last', () => {
		const list = ordered(['a', 100], ['b', 200], ['x', 250]);
		expect(neighborsForMove(list, 'x')).toEqual({ before: 200, after: null });
	});

	it('returns both null for a single-item list', () => {
		expect(neighborsForMove(ordered(['x', 100]), 'x')).toEqual({ before: null, after: null });
	});

	it('returns null/null when id absent', () => {
		expect(neighborsForMove(ordered(['a', 100]), 'x')).toEqual({ before: null, after: null });
	});
});

// Helper: build a DropContext with sane defaults, override per case.
function ctx(over: Partial<DropContext>): DropContext {
	return {
		source: 'timeline',
		target: 'timeline',
		item: { phase: 'p1', start_time: '' },
		before: null,
		after: null,
		dayPhases: ['p1'],
		...over
	};
}

describe('resolveDrop', () => {
	describe('timeline → parking (eject)', () => {
		it('pushes an untimed item', () => {
			expect(resolveDrop(ctx({ source: 'timeline', target: 'parking' }))).toEqual({ kind: 'push' });
		});

		it('pushes a timed item (eject unschedules regardless of clock)', () => {
			const action = resolveDrop(
				ctx({ source: 'timeline', target: 'parking', item: { phase: 'p1', start_time: '2026-06-15 09:00:00' } })
			);
			expect(action).toEqual({ kind: 'push' });
		});
	});

	describe('parking → timeline (pull)', () => {
		it('pulls an idea whose phase is among the day phases', () => {
			const action = resolveDrop(
				ctx({ source: 'parking', target: 'timeline', item: { phase: 'p1', start_time: '' }, before: 100, after: 200, dayPhases: ['p1'] })
			);
			expect(action).toEqual({ kind: 'pull', before: 100, after: 200 });
		});

		it('pulls at the head (before null)', () => {
			const action = resolveDrop(
				ctx({ source: 'parking', target: 'timeline', before: null, after: 100, dayPhases: ['p1'] })
			);
			expect(action).toEqual({ kind: 'pull', before: null, after: 100 });
		});

		it('pulls into a boundary day when the phase matches one of the two phases', () => {
			const action = resolveDrop(
				ctx({ source: 'parking', target: 'timeline', item: { phase: 'p2', start_time: '' }, before: 100, after: null, dayPhases: ['p1', 'p2'] })
			);
			expect(action).toEqual({ kind: 'pull', before: 100, after: null });
		});

		it('rejects a cross-phase pull (phase is sticky)', () => {
			const action = resolveDrop(
				ctx({ source: 'parking', target: 'timeline', item: { phase: 'pX', start_time: '' }, before: 100, after: 200, dayPhases: ['p1', 'p2'] })
			);
			expect(action).toEqual({ kind: 'reject' });
		});
	});

	describe('timeline → timeline (reorder / snapback)', () => {
		it('reorders an untimed item', () => {
			const action = resolveDrop(
				ctx({ source: 'timeline', target: 'timeline', item: { phase: 'p1', start_time: '' }, before: 100, after: 200 })
			);
			expect(action).toEqual({ kind: 'reorder', before: 100, after: 200 });
		});

		it('reorders an untimed item dropped first', () => {
			const action = resolveDrop(
				ctx({ source: 'timeline', target: 'timeline', before: null, after: 100 })
			);
			expect(action).toEqual({ kind: 'reorder', before: null, after: 100 });
		});

		it('snaps back a timed item dropped in place (clock pins it)', () => {
			const action = resolveDrop(
				ctx({ source: 'timeline', target: 'timeline', item: { phase: 'p1', start_time: '2026-06-15 09:00:00' }, before: 100, after: 200 })
			);
			expect(action).toEqual({ kind: 'snapback' });
		});
	});

	describe('parking → parking (reorder ideas)', () => {
		it('reorders within parking', () => {
			const action = resolveDrop(
				ctx({ source: 'parking', target: 'parking', before: 100, after: 200 })
			);
			expect(action).toEqual({ kind: 'reorder', before: 100, after: 200 });
		});
	});
});
