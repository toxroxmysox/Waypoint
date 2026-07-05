/**
 * Scenario planning core (#337, Candidate Scenarios). Two pure concerns, both
 * Vitest-covered (framework-free — no PB, no Svelte; precedent: phase-tiling.ts):
 *
 *   1. Sketch ↔ window normalization. A phase sketch is an ordered list of named
 *      legs with whole-day durations (`[{name, days}]`) — durations, NOT real
 *      phase records (a forming trip has no days yet). When a scenario carries a
 *      date window, the segment days must SUM TO THE WINDOW; the last segment
 *      auto-stretches (or shrinks) to absorb the remainder (spec §Surface).
 *
 *   2. The promotion cascade PLANNER. Given a won scenario + its trip, compute the
 *      pure plan the server cascade executes: the dates to set, the phase layout to
 *      hand the tiling engine (phase STARTS laid out from trip start), the keystone
 *      item ids, and the budget. No I/O — the server wrapper applies it.
 *
 * DAY MODEL — sketch days are NIGHTS (day-transitions), matching the board mockup
 * ("Nov 6–17 · 11 days", Bangkok 3 / Chiang Mai 4 / Ko Lanta 4 = 11). So the window
 * length a sketch sums to is dayDiff(start, end) — the number of nights between the
 * two dates, which is ALSO the number of internal + trailing legs' cumulative
 * offset. Laying phase starts at cumulative night offsets from the trip start feeds
 * retilePhases exactly (each start is the previous leg's shared travel/boundary
 * day); the tiling engine then derives inclusive end_date + order. See ADR-0021.
 */

import type { PhaseSketchSegment, Scenario } from './types';

/** Normalise a PB date or datetime to a bare 'YYYY-MM-DD' day (mirrors phase-tiling.toDay). */
export function toDay(d: string): string {
	return d.slice(0, 10);
}

/** Whole days (nights) between two 'YYYY-MM-DD' days — b minus a. UTC-anchored so
 *  DST never shifts a boundary. dayDiff('2027-11-06','2027-11-17') === 11. */
export function nightsBetween(start: string, end: string): number {
	const a = new Date(toDay(start) + 'T00:00:00.000Z').getTime();
	const b = new Date(toDay(end) + 'T00:00:00.000Z').getTime();
	return Math.round((b - a) / 86_400_000);
}

/** Add n days to a 'YYYY-MM-DD' day, returning 'YYYY-MM-DD' (UTC-anchored). */
export function addDays(day: string, n: number): string {
	const dt = new Date(toDay(day) + 'T00:00:00.000Z');
	dt.setUTCDate(dt.getUTCDate() + n);
	return dt.toISOString().slice(0, 10);
}

/** Total nights across a sketch's segments (a segment with a non-positive count
 *  contributes 0 — a sketch never has negative length). */
export function sketchTotalDays(sketch: PhaseSketchSegment[]): number {
	return sketch.reduce((sum, s) => sum + Math.max(0, Math.round(s.days || 0)), 0);
}

/**
 * Normalise a sketch's segment days to sum to a date window (spec §Surface:
 * "keeps segment-days summing to the window when dates exist; auto-stretch last
 * segment"). The window is `nightsBetween(start, end)` nights.
 *
 * - Every non-last segment keeps its authored days, floored to ≥1 (a leg is at
 *   least one night once a real window exists — a 0-night leg can't tile).
 * - The LAST segment absorbs the remainder: window − sum(others). If that would be
 *   < 1 (the earlier legs already overflow the window), the last segment is pinned
 *   to 1 and the OVERFLOWING earlier legs are trimmed from the tail inward until
 *   the total fits — the sketch never claims more nights than the window holds.
 * - An empty sketch stays empty (nothing to stretch). A single-segment sketch
 *   becomes exactly the window.
 *
 * Returns a NEW array; the input is not mutated. Segment names are preserved.
 */
export function normalizeSketchToWindow(
	sketch: PhaseSketchSegment[],
	start: string,
	end: string
): PhaseSketchSegment[] {
	if (sketch.length === 0) return [];
	const window = Math.max(1, nightsBetween(start, end));

	// Single leg → it IS the window.
	if (sketch.length === 1) {
		return [{ name: sketch[0].name, days: window }];
	}

	// Floor every non-last leg to ≥1, keeping authored durations.
	const out = sketch.map((s, i) =>
		i < sketch.length - 1
			? { name: s.name, days: Math.max(1, Math.round(s.days || 0)) }
			: { name: s.name, days: 0 }
	);

	let headSum = out.slice(0, -1).reduce((sum, s) => sum + s.days, 0);

	// The earlier legs already fill or overflow the window — trim from the tail
	// inward so the last leg can still hold its minimum 1 night.
	while (headSum > window - 1 && out.length > 1) {
		// index of the last NON-last segment
		const trimIdx = out.length - 2;
		if (out[trimIdx].days > 1) {
			out[trimIdx].days -= 1;
			headSum -= 1;
		} else {
			// This leg is already at its 1-night floor — drop it entirely.
			out.splice(trimIdx, 1);
			headSum -= 1;
		}
	}

	out[out.length - 1] = {
		name: out[out.length - 1].name,
		days: window - headSum
	};
	return out;
}

/**
 * Lay a sketch out into phase STARTS from a trip start day. Phase[i] starts at the
 * cumulative night offset of the preceding legs; the returned starts feed
 * retilePhases (which derives inclusive end_date + order). The trip end is
 * `addDays(start, totalNights)` — the caller sets the trip dates to exactly this
 * window (see planPromotion). Segments are assumed already normalized to the
 * window; a caller with dates should normalizeSketchToWindow first.
 *
 * Returns `{ name, start }[]` in sketch order.
 */
export function sketchToPhaseLayout(
	sketch: PhaseSketchSegment[],
	tripStart: string
): { name: string; start: string }[] {
	const start = toDay(tripStart);
	const layout: { name: string; start: string }[] = [];
	let offset = 0;
	for (const seg of sketch) {
		layout.push({ name: seg.name, start: addDays(start, offset) });
		offset += Math.max(1, Math.round(seg.days || 0));
	}
	return layout;
}

/** The pure plan the promotion cascade executes (spec §Promotion). No I/O. */
export interface PromotionPlan {
	/** Trip dates to set — 'YYYY-MM-DD'. Setting them fires forming→dated promotion. */
	dateStart: string;
	dateEnd: string;
	/** Phase layout for the tiling engine: named starts in order (empty when the
	 *  scenario has no sketch — the promotion hook's seeded "Phase 1" then stands). */
	phases: { name: string; start: string }[];
	/** Keystone item ids to flag as chosen anchors (they stay in the idea pool). */
	keystoneItemIds: string[];
	/** Per-person budget to seed the trip budget — 0 means "no budget" (never set). */
	budgetPerPerson: number;
}

export class PromotionError extends Error {}

/**
 * Plan the promotion cascade for a won scenario (spec §Promotion). PURE — the
 * server wrapper (scenario-promotion.server.ts) executes the returned plan.
 *
 * GATE: the scenario MUST carry both dates (spec: "the chosen scenario must have
 * both dates"). Throws PromotionError otherwise — the caller surfaces it.
 *
 * The phase layout is derived by normalizing the sketch to the scenario's window
 * (auto-stretch) then laying starts from the trip start. A scenario with no sketch
 * yields an empty phase list — the promotion hook's seeded whole-trip "Phase 1"
 * then stands unchanged (a valid one-phase trip, ADR-0021).
 */
export function planPromotion(scenario: Scenario): PromotionPlan {
	const dateStart = toDay(scenario.date_start || '');
	const dateEnd = toDay(scenario.date_end || '');
	if (!dateStart || !dateEnd) {
		throw new PromotionError('This scenario needs both dates before it can be chosen.');
	}
	if (dateEnd < dateStart) {
		throw new PromotionError('The scenario’s end date is before its start date.');
	}

	const sketch = Array.isArray(scenario.phase_sketch) ? scenario.phase_sketch : [];
	const normalized = sketch.length > 0 ? normalizeSketchToWindow(sketch, dateStart, dateEnd) : [];
	const phases = normalized.length > 0 ? sketchToPhaseLayout(normalized, dateStart) : [];

	return {
		dateStart,
		dateEnd,
		phases,
		keystoneItemIds: Array.isArray(scenario.keystones) ? [...scenario.keystones] : [],
		// 0/falsy budget = "no budget" (the #332/#335 scar); never seed a $0 budget.
		budgetPerPerson: scenario.budget_per_person > 0 ? scenario.budget_per_person : 0
	};
}

/** The four comparable dimensions a scenario card converges on (spec §Comparability). */
export interface ConvergeDimensions {
	dates: boolean;
	budget: boolean;
	sketch: boolean;
	keystones: boolean;
}

/** Whether a single scenario has filled each dimension. A dimension is "filled"
 *  when the scenario carries real content for it — never rendered as $0/empty. */
export function scenarioDimensions(s: Scenario): ConvergeDimensions {
	return {
		dates: !!(s.date_start && s.date_end),
		budget: s.budget_per_person > 0,
		sketch: Array.isArray(s.phase_sketch) && s.phase_sketch.length > 0,
		keystones: Array.isArray(s.keystones) && s.keystones.length > 0
	};
}

/**
 * Converge-over-time (spec §Comparability): once ANY scenario on the board fills a
 * dimension, EVERY sibling shows that dimension's section — filled with content or
 * a quiet empty slot ("no dates yet"). This returns which dimensions are "live" on
 * the board (≥1 scenario has filled them), so a card renders an empty slot for a
 * live dimension it hasn't filled itself. No dimension is live until someone fills
 * it — an all-empty board shows no dimension sections at all (never a form).
 *
 * Pure; input not mutated.
 */
export function boardLiveDimensions(scenarios: Scenario[]): ConvergeDimensions {
	const live: ConvergeDimensions = { dates: false, budget: false, sketch: false, keystones: false };
	for (const s of scenarios) {
		const d = scenarioDimensions(s);
		live.dates = live.dates || d.dates;
		live.budget = live.budget || d.budget;
		live.sketch = live.sketch || d.sketch;
		live.keystones = live.keystones || d.keystones;
	}
	return live;
}

/**
 * The empty slots a given scenario should render: a dimension that is LIVE on the
 * board (some sibling filled it) but which THIS scenario has not filled. Drives the
 * "no dates yet" / "no sketch yet" quiet placeholders — social pressure to flesh
 * out a pitch, never a form to complete.
 */
export function emptySlotsFor(scenario: Scenario, board: Scenario[]): ConvergeDimensions {
	const live = boardLiveDimensions(board);
	const mine = scenarioDimensions(scenario);
	return {
		dates: live.dates && !mine.dates,
		budget: live.budget && !mine.budget,
		sketch: live.sketch && !mine.sketch,
		keystones: live.keystones && !mine.keystones
	};
}
