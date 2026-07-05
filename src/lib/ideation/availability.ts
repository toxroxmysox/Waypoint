/**
 * Availability core (#271, ADR-0023). Pure — Vitest-covered (framework-free: no PB,
 * no Svelte; precedent scenario-planning.ts + phase-calendar.ts). The FOURTH
 * group-input mechanism: each member paints, on a calendar for a FORMING trip, when
 * they are free. This module owns every date/aggregation decision so the paint grid
 * (M3) and the scenario group-row (M5) stay thin views.
 *
 * Locked decisions (ADR-0023 — not re-litigated here):
 *   - value ∈ {available, maybe} ONLY; blank = no response (no red, no "unavailable").
 *   - a day is GREEN only when EVERY active member marked `available`; any maybe or
 *     blank → YELLOW. No ranking — surface the marks, a human picks.
 *   - canvas extent is DERIVED: today → min/max of painted ranges ± 2 weeks (never a
 *     stored canvas record).
 *   - green legitimately un-greens as members join: the denominator is the LIVE
 *     active member set (removed_at = "") — the caller passes only active members.
 */

import { toDay, addDays, nightsBetween } from './scenario-planning';

export type AvailabilityValue = 'available' | 'maybe';

/** One painted cell: a member marked a day available|maybe (ADR-0023 Decision 3). */
export interface AvailabilityCell {
	member: string; // trip_members id (NEVER user.id or a cookie — build invariant 1)
	day: string; // 'YYYY-MM-DD' (PB datetime tolerated — normalised via toDay)
	value: AvailabilityValue;
}

/** The colour a day surfaces. `null` = no response on the day (blank — not tinted). */
export type DayStatus = 'green' | 'yellow' | null;

const TWO_WEEKS = 14;

/**
 * Derive the paintable canvas extent (ADR-0023 Decision 5): today through the
 * min/max of painted ranges ± 2 weeks. Never a stored record — recomputed from the
 * live cells + today each render.
 *
 * - start = the earliest of (today, earliest painted day − 2 weeks). Today is always
 *   inside the canvas (you can always paint from today forward), and painted history
 *   before today stays visible with a fortnight of lead-in.
 * - end   = the latest of (today + 2 weeks, latest painted day + 2 weeks). An empty
 *   poll still offers a fortnight ahead to start painting.
 *
 * `today` is a 'YYYY-MM-DD' day (caller passes the trip-local today). Returns bare
 * day strings. Robust to unsorted / datetime-shaped cell days.
 */
export function canvasExtent(
	cells: AvailabilityCell[],
	today: string
): { start: string; end: string } {
	const t = toDay(today);
	let start = t;
	let end = addDays(t, TWO_WEEKS);
	for (const c of cells) {
		const d = toDay(c.day);
		const lead = addDays(d, -TWO_WEEKS);
		const trail = addDays(d, TWO_WEEKS);
		if (lead < start) start = lead;
		if (trail > end) end = trail;
	}
	return { start, end };
}

/** Inclusive list of 'YYYY-MM-DD' days spanning [start, end] (start ≤ end). */
export function daysInExtent(start: string, end: string): string[] {
	const s = toDay(start);
	const e = toDay(end);
	const n = Math.max(0, nightsBetween(s, e));
	const out: string[] = [];
	for (let i = 0; i <= n; i++) out.push(addDays(s, i));
	return out;
}

/**
 * Aggregate every member's cells into a per-day colour (ADR-0023 Decision 4).
 * `activeMemberIds` is the LIVE active roster (removed_at = "" — build invariant 4);
 * green means "everyone CURRENTLY in the group is confirmed", so it un-greens as new
 * members join. A day with no cells at all is absent from the map (blank → no tint).
 *
 *   green  — every active member has an `available` cell on the day.
 *   yellow — the day has ≥1 response but not all-available (any maybe, or a member
 *            hasn't painted the day, or a non-active member's stray cell is present).
 *
 * Cells belonging to members NOT in activeMemberIds are ignored for colouring (a
 * tombstoned member's marks drop out automatically). Returns a Map keyed by day.
 */
export function aggregateDayStatuses(
	cells: AvailabilityCell[],
	activeMemberIds: string[]
): Map<string, DayStatus> {
	const active = new Set(activeMemberIds);
	// day -> Map<memberId, value>, only for active members.
	const byDay = new Map<string, Map<string, AvailabilityValue>>();
	for (const c of cells) {
		if (!active.has(c.member)) continue;
		const day = toDay(c.day);
		let m = byDay.get(day);
		if (!m) {
			m = new Map();
			byDay.set(day, m);
		}
		m.set(c.member, c.value);
	}

	const out = new Map<string, DayStatus>();
	const total = active.size;
	for (const [day, marks] of byDay) {
		if (marks.size === 0) continue;
		// Green requires EVERY active member marked `available`. With no active members
		// there is no group to be green for → yellow (a stray cell still shows a
		// response). Any maybe, or a missing member, → yellow.
		let allAvailable = total > 0;
		if (allAvailable) {
			for (const id of active) {
				const v = marks.get(id);
				if (v !== 'available') {
					allAvailable = false;
					break;
				}
			}
		}
		out.set(day, allAvailable ? 'green' : 'yellow');
	}
	return out;
}

/** A per-day rollup the paint grid renders: the group colour + who marked what. */
export interface DayRollup {
	day: string;
	status: DayStatus;
	/** Count of active members who marked `available` on the day. */
	availableCount: number;
	/** Count of active members who marked `maybe` on the day. */
	maybeCount: number;
	/** Active member ids who marked `available` (avatar dots on the group heatmap). */
	availableMembers: string[];
	/** Active member ids who marked `maybe`. */
	maybeMembers: string[];
}

/**
 * Full per-day rollup over the extent — the shape the Group-mode calendar consumes
 * (colour + counts + who). Days with no responses carry status null and zero counts.
 * Only ACTIVE members count (build invariant 4). Deterministic member ordering
 * follows activeMemberIds.
 */
export function rollupByDay(
	cells: AvailabilityCell[],
	activeMemberIds: string[],
	days: string[]
): Map<string, DayRollup> {
	const active = new Set(activeMemberIds);
	const statuses = aggregateDayStatuses(cells, activeMemberIds);

	// day -> member -> value (active only).
	const byDay = new Map<string, Map<string, AvailabilityValue>>();
	for (const c of cells) {
		if (!active.has(c.member)) continue;
		const day = toDay(c.day);
		let m = byDay.get(day);
		if (!m) {
			m = new Map();
			byDay.set(day, m);
		}
		m.set(c.member, c.value);
	}

	const out = new Map<string, DayRollup>();
	for (const day of days) {
		const marks = byDay.get(day);
		const availableMembers: string[] = [];
		const maybeMembers: string[] = [];
		if (marks) {
			// Iterate in activeMemberIds order for stable output.
			for (const id of activeMemberIds) {
				const v = marks.get(id);
				if (v === 'available') availableMembers.push(id);
				else if (v === 'maybe') maybeMembers.push(id);
			}
		}
		out.set(day, {
			day,
			status: statuses.get(day) ?? null,
			availableCount: availableMembers.length,
			maybeCount: maybeMembers.length,
			availableMembers,
			maybeMembers
		});
	}
	return out;
}

/**
 * The single colour for a scenario card's group-row (M5): the availability overlap
 * across the scenario's date WINDOW [start, end] inclusive (ADR-0023 Decision 8 —
 * availability colours each scenario's window but never sets the date). Rules mirror
 * the per-day colour, escalated to the window:
 *
 *   green  — every day in the window is green (everyone's free the whole window).
 *   yellow — the window has ≥1 responded day but is not all-green.
 *   null   — no responses on any day in the window (nothing to surface yet).
 *
 * A window with a missing/blank date pair returns null (no window to colour).
 */
export function windowStatus(
	cells: AvailabilityCell[],
	activeMemberIds: string[],
	start: string,
	end: string
): DayStatus {
	const s = toDay(start || '');
	const e = toDay(end || '');
	if (!s || !e || e < s) return null;
	const statuses = aggregateDayStatuses(cells, activeMemberIds);
	const days = daysInExtent(s, e);
	let anyResponded = false;
	let allGreen = true;
	for (const day of days) {
		const st = statuses.get(day) ?? null;
		if (st !== null) anyResponded = true;
		if (st !== 'green') allGreen = false;
	}
	if (!anyResponded) return null;
	return allGreen ? 'green' : 'yellow';
}

/**
 * Cycle a single member's own value on a day for My-mode tap (ADR-0023 §M3):
 * blank → available → maybe → blank. Pure — returns the next value (null = clear the
 * cell). `current` is the member's current value on the day (null = blank).
 */
export function cycleValue(current: AvailabilityValue | null): AvailabilityValue | null {
	if (current === null) return 'available';
	if (current === 'available') return 'maybe';
	return null; // 'maybe' → blank
}

/**
 * Build the member's own value map (day -> value) from their cells — the My-mode
 * paint grid's source of truth for what to tint per day. Only the caller-member's
 * cells are passed in; last write per day wins (there is at most one under the unique
 * (trip, member, day) index, but be defensive).
 */
export function myValueByDay(myCells: AvailabilityCell[]): Map<string, AvailabilityValue> {
	const out = new Map<string, AvailabilityValue>();
	for (const c of myCells) out.set(toDay(c.day), c.value);
	return out;
}
