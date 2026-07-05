import { describe, it, expect } from 'vitest';
import {
	toDay,
	nightsBetween,
	addDays,
	sketchTotalDays,
	normalizeSketchToWindow,
	sketchToPhaseLayout,
	planPromotion,
	PromotionError,
	scenarioDimensions,
	boardLiveDimensions,
	emptySlotsFor
} from './scenario-planning';
import type { Scenario, PhaseSketchSegment } from './types';

// A minimal Scenario factory — only the fields the pure logic reads.
function scenario(overrides: Partial<Scenario> = {}): Scenario {
	return {
		id: overrides.id ?? 's1',
		trip: 't1',
		title: overrides.title ?? 'Pitch',
		pitch: '',
		champion: 'm1',
		date_start: overrides.date_start ?? '',
		date_end: overrides.date_end ?? '',
		budget_per_person: overrides.budget_per_person ?? 0,
		phase_sketch: overrides.phase_sketch ?? [],
		keystones: overrides.keystones ?? [],
		fork_of: '',
		status: 'candidate',
		created: '2027-01-01 00:00:00.000Z',
		updated: '2027-01-01 00:00:00.000Z'
	};
}

describe('toDay', () => {
	it('strips a PB datetime to YYYY-MM-DD', () => {
		expect(toDay('2027-11-06 00:00:00.000Z')).toBe('2027-11-06');
		expect(toDay('2027-11-06')).toBe('2027-11-06');
	});
});

describe('nightsBetween', () => {
	it('counts day-transitions (the mockup: Nov 6–17 = 11 nights)', () => {
		expect(nightsBetween('2027-11-06', '2027-11-17')).toBe(11);
	});
	it('is 0 for the same day and ignores the time part', () => {
		expect(nightsBetween('2027-11-06 00:00:00.000Z', '2027-11-06')).toBe(0);
	});
	it('crosses a DST boundary without drift (UTC-anchored)', () => {
		// US DST ends 2027-11-07; a naive local calc would give 10.958… → wrong.
		expect(nightsBetween('2027-11-01', '2027-11-30')).toBe(29);
	});
});

describe('addDays', () => {
	it('advances a day, month-rolling correctly', () => {
		expect(addDays('2027-11-06', 11)).toBe('2027-11-17');
		expect(addDays('2027-11-28', 4)).toBe('2027-12-02');
	});
	it('handles 0 and negative offsets', () => {
		expect(addDays('2027-11-06', 0)).toBe('2027-11-06');
		expect(addDays('2027-11-06', -1)).toBe('2027-11-05');
	});
});

describe('sketchTotalDays', () => {
	it('sums segment days', () => {
		expect(sketchTotalDays([{ name: 'A', days: 3 }, { name: 'B', days: 4 }])).toBe(7);
	});
	it('treats non-positive / missing counts as 0', () => {
		expect(
			sketchTotalDays([{ name: 'A', days: 0 }, { name: 'B', days: -2 }, { name: 'C' } as PhaseSketchSegment])
		).toBe(0);
	});
});

describe('normalizeSketchToWindow', () => {
	it('leaves a sketch that already sums to the window untouched', () => {
		const sketch = [
			{ name: 'Bangkok', days: 3 },
			{ name: 'Chiang Mai', days: 4 },
			{ name: 'Ko Lanta', days: 4 }
		];
		expect(normalizeSketchToWindow(sketch, '2027-11-06', '2027-11-17')).toEqual(sketch);
	});

	it('auto-stretches the LAST segment to absorb a larger window', () => {
		const sketch = [
			{ name: 'Bangkok', days: 3 },
			{ name: 'Chiang Mai', days: 4 },
			{ name: 'Ko Lanta', days: 4 }
		];
		// Window widened to 14 nights → last leg gains 3.
		const out = normalizeSketchToWindow(sketch, '2027-11-06', '2027-11-20');
		expect(out).toEqual([
			{ name: 'Bangkok', days: 3 },
			{ name: 'Chiang Mai', days: 4 },
			{ name: 'Ko Lanta', days: 7 }
		]);
		expect(sketchTotalDays(out)).toBe(14);
	});

	it('shrinks the LAST segment to fit a smaller window', () => {
		const sketch = [
			{ name: 'A', days: 3 },
			{ name: 'B', days: 4 },
			{ name: 'C', days: 4 }
		];
		const out = normalizeSketchToWindow(sketch, '2027-11-06', '2027-11-14'); // 8 nights
		expect(out).toEqual([
			{ name: 'A', days: 3 },
			{ name: 'B', days: 4 },
			{ name: 'C', days: 1 }
		]);
		expect(sketchTotalDays(out)).toBe(8);
	});

	it('trims from the tail inward when earlier legs overflow the window', () => {
		// Earlier legs claim 3+4 = 7 nights but the window is only 5 → the last leg
		// needs ≥1, so trim B down until A(3)+B+C(1) ≤ 5 → B becomes 1.
		const sketch = [
			{ name: 'A', days: 3 },
			{ name: 'B', days: 4 },
			{ name: 'C', days: 4 }
		];
		const out = normalizeSketchToWindow(sketch, '2027-11-06', '2027-11-11'); // 5 nights
		expect(sketchTotalDays(out)).toBe(5);
		expect(out[out.length - 1].days).toBeGreaterThanOrEqual(1);
		// A stays at its authored 3; B trims to 1; C is the remainder 1.
		expect(out).toEqual([
			{ name: 'A', days: 3 },
			{ name: 'B', days: 1 },
			{ name: 'C', days: 1 }
		]);
	});

	it('drops overflowing legs entirely when even 1-night floors exceed the window', () => {
		const sketch = [
			{ name: 'A', days: 1 },
			{ name: 'B', days: 1 },
			{ name: 'C', days: 1 },
			{ name: 'D', days: 1 }
		];
		const out = normalizeSketchToWindow(sketch, '2027-11-06', '2027-11-08'); // 2 nights
		expect(sketchTotalDays(out)).toBe(2);
		// Only two legs can survive a 2-night window at 1 night each.
		expect(out.length).toBe(2);
	});

	it('a single-segment sketch becomes exactly the window', () => {
		expect(normalizeSketchToWindow([{ name: 'Solo', days: 2 }], '2027-11-06', '2027-11-17')).toEqual([
			{ name: 'Solo', days: 11 }
		]);
	});

	it('an empty sketch stays empty', () => {
		expect(normalizeSketchToWindow([], '2027-11-06', '2027-11-17')).toEqual([]);
	});

	it('does not mutate the input', () => {
		const sketch = [
			{ name: 'A', days: 3 },
			{ name: 'B', days: 4 }
		];
		const copy = JSON.parse(JSON.stringify(sketch));
		normalizeSketchToWindow(sketch, '2027-11-06', '2027-11-20');
		expect(sketch).toEqual(copy);
	});
});

describe('sketchToPhaseLayout', () => {
	it('lays phase starts at cumulative night offsets from the trip start', () => {
		const sketch = [
			{ name: 'Bangkok', days: 3 },
			{ name: 'Chiang Mai', days: 4 },
			{ name: 'Ko Lanta', days: 4 }
		];
		expect(sketchToPhaseLayout(sketch, '2027-11-06')).toEqual([
			{ name: 'Bangkok', start: '2027-11-06' },
			{ name: 'Chiang Mai', start: '2027-11-09' },
			{ name: 'Ko Lanta', start: '2027-11-13' }
		]);
	});

	it('a single leg starts at the trip start', () => {
		expect(sketchToPhaseLayout([{ name: 'Solo', days: 11 }], '2027-11-06')).toEqual([
			{ name: 'Solo', start: '2027-11-06' }
		]);
	});
});

describe('planPromotion', () => {
	it('gates on both dates — throws PromotionError when either is missing', () => {
		expect(() => planPromotion(scenario({ date_start: '2027-11-06' }))).toThrow(PromotionError);
		expect(() => planPromotion(scenario({ date_end: '2027-11-17' }))).toThrow(PromotionError);
		expect(() => planPromotion(scenario())).toThrow(/both dates/);
	});

	it('rejects an inverted window', () => {
		expect(() =>
			planPromotion(scenario({ date_start: '2027-11-17', date_end: '2027-11-06' }))
		).toThrow(/before its start/);
	});

	it('plans dates + a phase layout from the sketch (normalized to the window)', () => {
		const plan = planPromotion(
			scenario({
				date_start: '2027-11-06 00:00:00.000Z',
				date_end: '2027-11-17 00:00:00.000Z',
				phase_sketch: [
					{ name: 'Bangkok', days: 3 },
					{ name: 'Chiang Mai', days: 4 },
					{ name: 'Ko Lanta', days: 4 }
				],
				keystones: ['itemA', 'itemB'],
				budget_per_person: 1900
			})
		);
		expect(plan.dateStart).toBe('2027-11-06');
		expect(plan.dateEnd).toBe('2027-11-17');
		expect(plan.phases).toEqual([
			{ name: 'Bangkok', start: '2027-11-06' },
			{ name: 'Chiang Mai', start: '2027-11-09' },
			{ name: 'Ko Lanta', start: '2027-11-13' }
		]);
		expect(plan.keystoneItemIds).toEqual(['itemA', 'itemB']);
		expect(plan.budgetPerPerson).toBe(1900);
	});

	it('normalizes a sketch whose days do not sum to the window before laying it out', () => {
		// Sketch sums to 7 but the window is 11 → the last leg stretches to 8, so the
		// final phase start still lands inside the window.
		const plan = planPromotion(
			scenario({
				date_start: '2027-11-06',
				date_end: '2027-11-17',
				phase_sketch: [
					{ name: 'A', days: 3 },
					{ name: 'B', days: 4 }
				]
			})
		);
		expect(plan.phases).toEqual([
			{ name: 'A', start: '2027-11-06' },
			{ name: 'B', start: '2027-11-09' }
		]);
	});

	it('yields an empty phase list when the scenario has no sketch (Phase 1 seed stands)', () => {
		const plan = planPromotion(scenario({ date_start: '2027-11-06', date_end: '2027-11-17' }));
		expect(plan.phases).toEqual([]);
	});

	it('treats a 0 budget as "no budget" (never seeds $0 — the #332/#335 scar)', () => {
		const plan = planPromotion(
			scenario({ date_start: '2027-11-06', date_end: '2027-11-17', budget_per_person: 0 })
		);
		expect(plan.budgetPerPerson).toBe(0);
	});

	it('does not alias the scenario keystones array', () => {
		const keystones = ['a', 'b'];
		const plan = planPromotion(
			scenario({ date_start: '2027-11-06', date_end: '2027-11-17', keystones })
		);
		plan.keystoneItemIds.push('c');
		expect(keystones).toEqual(['a', 'b']);
	});
});

describe('scenarioDimensions', () => {
	it('reports each filled dimension; 0 budget and empty arrays are unfilled', () => {
		expect(scenarioDimensions(scenario())).toEqual({
			dates: false,
			budget: false,
			sketch: false,
			keystones: false
		});
		expect(
			scenarioDimensions(
				scenario({
					date_start: '2027-11-06',
					date_end: '2027-11-17',
					budget_per_person: 1900,
					phase_sketch: [{ name: 'A', days: 3 }],
					keystones: ['x']
				})
			)
		).toEqual({ dates: true, budget: true, sketch: true, keystones: true });
	});

	it('a lone start date does NOT count as the dates dimension (needs both)', () => {
		expect(scenarioDimensions(scenario({ date_start: '2027-11-06' })).dates).toBe(false);
	});
});

describe('boardLiveDimensions + emptySlotsFor (converge-over-time)', () => {
	const withDates = scenario({ id: 'a', date_start: '2027-11-06', date_end: '2027-11-17' });
	const withBudget = scenario({ id: 'b', budget_per_person: 1900 });
	const bare = scenario({ id: 'c' });

	it('no dimension is live on an all-empty board', () => {
		expect(boardLiveDimensions([bare, scenario({ id: 'd' })])).toEqual({
			dates: false,
			budget: false,
			sketch: false,
			keystones: false
		});
	});

	it('a dimension goes live once ANY scenario fills it', () => {
		expect(boardLiveDimensions([withDates, withBudget, bare])).toEqual({
			dates: true,
			budget: true,
			sketch: false,
			keystones: false
		});
	});

	it('a scenario shows an empty slot only for a LIVE dimension it has not filled', () => {
		const board = [withDates, withBudget, bare];
		// `withDates` filled dates but not budget → empty budget slot only.
		expect(emptySlotsFor(withDates, board)).toEqual({
			dates: false,
			budget: true,
			sketch: false,
			keystones: false
		});
		// `bare` filled nothing → empty slots for both live dimensions.
		expect(emptySlotsFor(bare, board)).toEqual({
			dates: true,
			budget: true,
			sketch: false,
			keystones: false
		});
	});

	it('a scenario that filled a dimension itself never shows its own empty slot', () => {
		expect(emptySlotsFor(withBudget, [withDates, withBudget]).budget).toBe(false);
	});
});
