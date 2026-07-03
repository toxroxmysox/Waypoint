/**
 * Phase calendar model (#330, V2 of ADR-0021). Pure — Vitest-covered. Turns a
 * trip's start date + length + tiled phases into a week-aligned calendar grid for
 * the phase editor. All date math lives here so the Svelte component stays a view.
 *
 * Model (unchanged from the tiling engine): a phase is a START day; phase i spans
 * [start_i … next start] inclusive, so adjacent phases SHARE their boundary day —
 * that shared day is a TRAVEL day. `tiled` is `retilePhases()` output (sorted by
 * start, ends derived). Phase colours are DERIVED by order (ADR removed stored
 * colours): the palette cycles moss → sky → gold → clay.
 */

import { toDay, type TiledPhase } from './phase-tiling';

export const PHASE_PALETTE = ['moss', 'sky', 'gold', 'clay'] as const;
export type PhasePalette = (typeof PHASE_PALETTE)[number];

/** The palette a phase uses, cycled by its order. */
export function paletteFor(phaseIndex: number): PhasePalette {
	return PHASE_PALETTE[((phaseIndex % PHASE_PALETTE.length) + PHASE_PALETTE.length) % PHASE_PALETTE.length];
}

function parseUTC(d: string): Date {
	return new Date(toDay(d) + 'T00:00:00.000Z');
}
function fmt(dt: Date): string {
	return dt.toISOString().slice(0, 10);
}

/** Add `n` days to a 'YYYY-MM-DD' (or PB datetime) and return a bare day string. */
export function addDays(d: string, n: number): string {
	const dt = parseUTC(d);
	dt.setUTCDate(dt.getUTCDate() + n);
	return fmt(dt);
}

/** Whole-day difference `b - a` (both day strings). */
export function dayDiff(a: string, b: string): number {
	return Math.round((parseUTC(b).getTime() - parseUTC(a).getTime()) / 86_400_000);
}

/** Weekday index, Monday-first: 0 = Mon … 6 = Sun. */
export function mondayIndex(d: string): number {
	return (parseUTC(d).getUTCDay() + 6) % 7;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
	'January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December'
];

export interface CalendarCell {
	/** 1-based day number within the trip. */
	tripDay: number;
	date: string; // 'YYYY-MM-DD'
	/** The phase that OWNS this day (for a travel day, the phase that STARTS here). */
	phaseIndex: number;
	/** On a travel day, the previous phase (the left half of the split); else null. */
	prevPhaseIndex: number | null;
	/** True when this day is a shared boundary between two phases. */
	isTravelDay: boolean;
	/** e.g. 'MAR' on the 1st of a month, for the corner tag; else null. */
	monthTag: string | null;
}

export interface CalendarModel {
	/** 7-column rows (Monday-first). `null` = a leading/trailing padding cell. */
	weeks: (CalendarCell | null)[][];
	monthTitle: string; // 'February 2026' or 'Feb – Mar 2026'
	rangeLabel: string; // 'Feb 6 – Feb 17'
}

/**
 * Build the calendar render model. `tiled` must be the sorted `retilePhases()`
 * output for the trip (start days ascending). Days are numbered 1..totalDays.
 */
export function buildCalendar(startDate: string, totalDays: number, tiled: TiledPhase[]): CalendarModel {
	const start = toDay(startDate);
	const starts = tiled.map((p) => p.start); // ascending
	// The owning phase for a day = the latest phase whose start is on/before it.
	const phaseIndexFor = (date: string): number => {
		let idx = 0;
		for (let i = 0; i < starts.length; i++) {
			if (starts[i] <= date) idx = i;
			else break;
		}
		return idx;
	};

	const cells: CalendarCell[] = [];
	for (let d = 1; d <= totalDays; d++) {
		const date = addDays(start, d - 1);
		const phaseIndex = phaseIndexFor(date);
		// Travel day: this day is the START of a phase other than the first.
		const isTravelDay = phaseIndex >= 1 && starts[phaseIndex] === date;
		const isFirstOfMonth = date.slice(8, 10) === '01';
		cells.push({
			tripDay: d,
			date,
			phaseIndex,
			prevPhaseIndex: isTravelDay ? phaseIndex - 1 : null,
			isTravelDay,
			monthTag: isFirstOfMonth ? MONTHS_SHORT[parseUTC(date).getUTCMonth()].toUpperCase() : null
		});
	}

	// Week-align: pad the first week so day 1 lands on its real weekday; pad the
	// tail so the last row is full.
	const lead = mondayIndex(start);
	const padded: (CalendarCell | null)[] = [...Array(lead).fill(null), ...cells];
	while (padded.length % 7 !== 0) padded.push(null);
	const weeks: (CalendarCell | null)[][] = [];
	for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));

	const endDate = addDays(start, totalDays - 1);
	const sM = parseUTC(start).getUTCMonth();
	const eM = parseUTC(endDate).getUTCMonth();
	const sY = parseUTC(start).getUTCFullYear();
	const eY = parseUTC(endDate).getUTCFullYear();
	const monthTitle =
		sM === eM && sY === eY
			? `${MONTHS_LONG[sM]} ${sY}`
			: sY === eY
				? `${MONTHS_SHORT[sM]} – ${MONTHS_SHORT[eM]} ${eY}`
				: `${MONTHS_SHORT[sM]} ${sY} – ${MONTHS_SHORT[eM]} ${eY}`;
	const rangeLabel = `${MONTHS_SHORT[sM]} ${parseUTC(start).getUTCDate()} – ${MONTHS_SHORT[eM]} ${parseUTC(endDate).getUTCDate()}`;

	return { weeks, monthTitle, rangeLabel };
}
