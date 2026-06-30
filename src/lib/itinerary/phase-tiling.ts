/**
 * Phase tiling core (ADR-0021, #323). Boundary model: a phase is defined by its
 * start day; its end is derived as the NEXT phase's start (the shared travel/
 * boundary day), or the trip end for the last phase. Pure — Vitest-covered.
 * The thin server wrapper (phase-tiling.server.ts) persists the computed layout.
 */

/** Normalise a PB date or datetime to a bare 'YYYY-MM-DD' day. */
export function toDay(d: string): string {
	return d.slice(0, 10);
}

export interface PhaseStart {
	id: string;
	start_date: string; // PB datetime or 'YYYY-MM-DD'
}

export interface TiledPhase {
	id: string;
	start: string; // 'YYYY-MM-DD'
	end: string; // 'YYYY-MM-DD'
	order: number;
}

/**
 * The tiled layout for a trip's phases: sort by start; each phase's end is the
 * NEXT phase's start (the shared travel/boundary day); the last phase's end is
 * the trip end; order = position. Single source of truth for a trip's phase
 * ranges — phases store only their start meaningfully; end + order are derived
 * from this and persisted by applyRetile (see phase-tiling.server).
 */
export function retilePhases(phases: PhaseStart[], tripEnd: string): TiledPhase[] {
	const sorted = phases
		.map((p) => ({ id: p.id, start: toDay(p.start_date) }))
		.sort((a, b) => a.start.localeCompare(b.start));
	const end = toDay(tripEnd);
	return sorted.map((p, i) => ({
		id: p.id,
		start: p.start,
		end: i < sorted.length - 1 ? sorted[i + 1].start : end,
		order: i
	}));
}

/**
 * Validate a proposed start day for a NEW phase. It must fall strictly inside
 * the trip (so it splits an existing segment, leaving ≥1 day on each side) and
 * not coincide with an existing phase boundary. Returns an error message or null.
 */
export function validateNewPhaseStart(
	start: string,
	tripStart: string,
	tripEnd: string,
	existingStarts: string[]
): string | null {
	const s = toDay(start);
	if (s <= toDay(tripStart)) return 'A new phase must start after the trip begins.';
	if (s >= toDay(tripEnd)) return 'A new phase must start before the trip ends.';
	if (existingStarts.map(toDay).includes(s)) return 'A phase already starts on that day.';
	return null;
}

/**
 * Validate moving an EXISTING phase's start. The first phase (lowest start) is
 * pinned to the trip start and cannot move. Any other phase's new start must lie
 * strictly between the previous phase's start and the next boundary (next phase's
 * start, or the trip end for the last phase). Returns an error message or null.
 */
export function validateMovePhaseStart(
	phaseId: string,
	newStart: string,
	tiled: TiledPhase[],
	tripStart: string,
	tripEnd: string
): string | null {
	const s = toDay(newStart);
	const ordered = [...tiled].sort((a, b) => a.start.localeCompare(b.start));
	const idx = ordered.findIndex((p) => p.id === phaseId);
	if (idx === -1) return 'Phase not found.';
	if (idx === 0) {
		return s === toDay(tripStart) ? null : 'The first phase must start when the trip begins.';
	}
	const lower = ordered[idx - 1].start;
	const upper = idx < ordered.length - 1 ? ordered[idx + 1].start : toDay(tripEnd);
	if (s <= lower || s >= upper) {
		return `This phase must start between ${lower} and ${upper}.`;
	}
	return null;
}
