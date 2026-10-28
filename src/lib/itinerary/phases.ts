import type { Day, Phase } from '$lib/types';

/**
 * The phases a day belongs to, ordered by phase `order` (lowest first).
 * Phases tile the trip (ADR-0021): a day belongs to exactly one phase, or two on
 * a Travel Day, where adjacent phases share their boundary day.
 */
export function phasesForDay(day: Day, allPhases: Phase[]): Phase[] {
	const ids = new Set(day.phases ?? []);
	return allPhases.filter((p) => ids.has(p.id));
}

/**
 * The "primary" phase for a day — the lowest-`order` phase the day belongs to.
 * Used when UI can only show one phase (e.g. back-link to parent).
 * Assumes `allPhases` is already sorted by order ascending.
 */
export function primaryPhaseForDay(day: Day, allPhases: Phase[]): Phase | null {
	const matches = phasesForDay(day, allPhases);
	return matches.length > 0 ? matches[0] : null;
}
