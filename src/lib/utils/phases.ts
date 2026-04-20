import type { Day, Phase } from '$lib/types';

/**
 * All phases a day belongs to, ordered by phase `order` (lowest first).
 * A day can belong to multiple phases when their date ranges overlap
 * (e.g. a travel-transition day between two cities).
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

/**
 * True if the day bridges two or more phases — i.e. a travel-transition day.
 */
export function isTravelTransition(day: Day): boolean {
	return (day.phases ?? []).length > 1;
}
