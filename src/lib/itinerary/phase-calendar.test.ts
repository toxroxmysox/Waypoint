import { describe, it, expect } from 'vitest';
import { retilePhases } from './phase-tiling';
import {
	buildCalendar,
	paletteFor,
	addDays,
	dayDiff,
	mondayIndex,
	type CalendarCell
} from './phase-calendar';

const flat = (weeks: (CalendarCell | null)[][]): CalendarCell[] =>
	weeks.flat().filter((c): c is CalendarCell => c !== null);

describe('date helpers', () => {
	it('addDays crosses month boundaries', () => {
		expect(addDays('2026-02-25', 4)).toBe('2026-03-01');
		expect(addDays('2026-02-06', 0)).toBe('2026-02-06');
	});
	it('dayDiff counts whole days', () => {
		expect(dayDiff('2026-02-06', '2026-02-10')).toBe(4);
	});
	it('mondayIndex is 0=Mon..6=Sun', () => {
		// 2026-02-09 is a Monday.
		expect(mondayIndex('2026-02-09')).toBe(0);
		expect(mondayIndex('2026-02-15')).toBe(6); // Sunday
	});
});

describe('paletteFor cycles moss/sky/gold/clay', () => {
	it('wraps by phase order', () => {
		expect(paletteFor(0)).toBe('moss');
		expect(paletteFor(1)).toBe('sky');
		expect(paletteFor(2)).toBe('gold');
		expect(paletteFor(3)).toBe('clay');
		expect(paletteFor(4)).toBe('moss');
	});
});

describe('buildCalendar — 3 phases over a 12-day single-month trip', () => {
	// Feb 6–17 2026; phases start on day 1 (Feb 6), day 5 (Feb 10), day 9 (Feb 14).
	const tiled = retilePhases(
		[
			{ id: 'a', start_date: '2026-02-06' },
			{ id: 'b', start_date: '2026-02-10' },
			{ id: 'c', start_date: '2026-02-14' }
		],
		'2026-02-17'
	);
	const model = buildCalendar('2026-02-06', 12, tiled);
	const cells = flat(model.weeks);

	it('emits exactly totalDays real cells, numbered 1..12', () => {
		expect(cells).toHaveLength(12);
		expect(cells.map((c) => c.tripDay)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
	});

	it('every week row is 7 wide and leading pad = weekday of day 1', () => {
		for (const wk of model.weeks) expect(wk).toHaveLength(7);
		const lead = model.weeks[0].findIndex((c) => c !== null);
		expect(lead).toBe(mondayIndex('2026-02-06'));
	});

	it('boundary days are travel days with the correct split neighbours', () => {
		const byDay = (d: number) => cells.find((c) => c.tripDay === d)!;
		// day 1 (first phase start) is NOT a travel day
		expect(byDay(1).isTravelDay).toBe(false);
		expect(byDay(1).phaseIndex).toBe(0);
		// day 5 = phase b start = shared boundary of a|b
		expect(byDay(5).isTravelDay).toBe(true);
		expect(byDay(5).phaseIndex).toBe(1);
		expect(byDay(5).prevPhaseIndex).toBe(0);
		// day 9 = phase c start = shared boundary of b|c
		expect(byDay(9).isTravelDay).toBe(true);
		expect(byDay(9).phaseIndex).toBe(2);
		expect(byDay(9).prevPhaseIndex).toBe(1);
	});

	it('normal days belong to the phase whose span contains them', () => {
		const byDay = (d: number) => cells.find((c) => c.tripDay === d)!;
		expect(byDay(4).phaseIndex).toBe(0); // last full day of phase a
		expect(byDay(6).phaseIndex).toBe(1);
		expect(byDay(12).phaseIndex).toBe(2); // trip end, in phase c
		expect(byDay(6).isTravelDay).toBe(false);
	});

	it('labels the single month + the date range', () => {
		expect(model.monthTitle).toBe('February 2026');
		expect(model.rangeLabel).toBe('Feb 6 – Feb 17');
	});
});

describe('buildCalendar — cross-month trip tags the 1st', () => {
	const tiled = retilePhases([{ id: 'a', start_date: '2026-02-25' }], '2026-03-04');
	const model = buildCalendar('2026-02-25', 8, tiled); // Feb 25 – Mar 4
	const cells = flat(model.weeks);

	it('titles the span across months', () => {
		expect(model.monthTitle).toBe('Feb – Mar 2026');
	});
	it('tags Mar 1 (day 5) with its month', () => {
		const mar1 = cells.find((c) => c.date === '2026-03-01')!;
		expect(mar1.tripDay).toBe(5);
		expect(mar1.monthTag).toBe('MAR');
		expect(cells.find((c) => c.date === '2026-02-25')!.monthTag).toBe(null);
	});
});
