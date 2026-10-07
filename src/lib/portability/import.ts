import type { TripExport } from '$lib/types';
import { toDay, validateNewPhaseStart } from '$lib/itinerary/phase-tiling';

export interface ImportValidationResult {
	valid: boolean;
	errors: string[];
	data: TripExport | null;
}

export function validateTripImport(raw: unknown): ImportValidationResult {
	const errors: string[] = [];

	if (!raw || typeof raw !== 'object') {
		return { valid: false, errors: ['Invalid JSON: not an object'], data: null };
	}

	const obj = raw as Record<string, unknown>;

	if (obj._waypoint_version !== 1) {
		errors.push(`Unsupported version: ${obj._waypoint_version}. Expected 1.`);
	}

	if (!obj.trip || typeof obj.trip !== 'object') {
		errors.push('Missing or invalid "trip" field.');
		return { valid: false, errors, data: null };
	}

	const trip = obj.trip as Record<string, unknown>;
	if (!trip.title || typeof trip.title !== 'string') errors.push('Trip title is required.');
	if (!trip.start_date || typeof trip.start_date !== 'string')
		errors.push('Trip start_date is required.');
	if (!trip.end_date || typeof trip.end_date !== 'string')
		errors.push('Trip end_date is required.');

	if (!Array.isArray(obj.phases)) errors.push('"phases" must be an array.');
	if (!Array.isArray(obj.days)) errors.push('"days" must be an array.');
	if (!Array.isArray(obj.items)) errors.push('"items" must be an array.');

	if (errors.length > 0) {
		return { valid: false, errors, data: null };
	}

	return { valid: true, errors: [], data: obj as unknown as TripExport };
}

export function generateImportSlug(title: string): string {
	const base = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 40);
	const suffix = Math.random().toString(36).slice(2, 6);
	return `${base}-imported-${suffix}`;
}

// ---------------------------------------------------------------------------
// Phase plan + status coercion for the import action (#450).
// The action used to re-implement the "does this start tile?" check inline; it
// now reuses validateNewPhaseStart (the same gate the phases page uses) and keeps
// the fold-into-covering-phase rule here, pure and Vitest-covered.
// ---------------------------------------------------------------------------

export interface ImportPhasePlan {
	phase: TripExport['phases'][number];
	/**
	 * first  = the first sorted phase; retargets the hook-seeded Phase 1 (pinned to the trip start)
	 * create = a new phase whose start tiles inside the trip
	 * fold   = start can't tile (outside the trip / on the trip end / duplicate start) — the
	 *          phase's items land in the phase covering that day (`intoStart`)
	 */
	action: 'first' | 'create' | 'fold';
	/** 'YYYY-MM-DD' this phase starts on (the trip start for `first`). */
	start: string;
	/** Only for `fold`: the start of the phase it folds into (a `first`/`create` start). */
	intoStart?: string;
}

/**
 * Plan how the imported phases map onto the hook-seeded trip. Sort by start
 * (ties by `order`); the first retargets the seeded phase, each later one either
 * creates a phase (when validateNewPhaseStart accepts its start) or folds into
 * the latest already-planned phase that starts on or before it.
 */
export function planImportPhases(
	phases: TripExport['phases'],
	tripStart: string,
	tripEnd: string
): ImportPhasePlan[] {
	const sorted = [...phases].sort(
		(a, b) =>
			toDay(a.start_date || '').localeCompare(toDay(b.start_date || '')) || a.order - b.order
	);
	const starts: string[] = [toDay(tripStart)]; // planned phase starts, ascending
	const plan: ImportPhasePlan[] = [];
	for (const [i, phase] of sorted.entries()) {
		if (i === 0) {
			plan.push({ phase, action: 'first', start: toDay(tripStart) });
			continue;
		}
		const start = toDay(phase.start_date || '');
		if (validateNewPhaseStart(start, tripStart, tripEnd, starts) === null) {
			plan.push({ phase, action: 'create', start });
			starts.push(start);
			starts.sort();
			continue;
		}
		const covering = [...starts].reverse().find((s) => s <= start);
		plan.push({ phase, action: 'fold', start, intoStart: covering ?? starts[0] });
	}
	return plan;
}

/**
 * An item with a dated status (planned / done / unset) needs a day; one whose day
 * didn't resolve parks as an unplanned idea. Anything else passes through.
 */
export function resolveImportItemStatus(
	status: string | null | undefined,
	hasDay: boolean
): string {
	const wantsDay = status === 'planned' || status === 'done' || !status;
	return wantsDay && !hasDay ? 'unplanned' : status || 'planned';
}
