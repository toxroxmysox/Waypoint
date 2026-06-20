import { tripToday, tripTz } from '$lib/shell/trip-time';
import type { TripDateInfo } from './activation';

/**
 * The trip's derived lifecycle — there is NO stored `status` field; only `archived`
 * persists. Everything else is computed from the trip's dates against "now", in the
 * trip-local timezone (#167). The four states are mutually exclusive:
 *
 *  - `planning` — today < start_date. A DATE-LESS trip is ALWAYS planning (explicit
 *    guard) — an empty end_date must never read as past-end and flip to wrap-up.
 *  - `active`   — start_date ≤ today ≤ end_date (the `isTripActive` truth).
 *  - `wrap-up`  — today > end_date AND not archived (the day after the trip ends).
 *  - `closed`   — archived. Takes precedence over the date comparison: an archived
 *    trip is ALWAYS closed, whatever its dates say. Re-deriving — `archived:false`
 *    on a past-end trip drops back to `wrap-up` (or `active` if still in range);
 *    there is no special "reopened" state.
 */
export type TripLifecycle = 'planning' | 'active' | 'wrap-up' | 'closed';

/**
 * Derive a trip's lifecycle from its dates + `archived`, comparing in the trip-local
 * timezone. Pure: same `(trip, now)` → same output, no I/O.
 */
export function getTripLifecycle(trip: TripDateInfo, now: Date = new Date()): TripLifecycle {
	// Archived takes precedence over every date comparison — a closed trip is closed
	// even mid-range. Reopening (archived → false) re-runs the date logic below.
	if (trip.archived) return 'closed';

	// A date-less trip is always planning — never let an empty end_date read as
	// "today > end" and flip the trip to wrap-up. (An empty start_date can't be
	// "active" either; both gaps collapse to the safe planning default.)
	if (!trip.start_date || !trip.end_date) return 'planning';

	// Compare against the trip-local calendar date, not UTC — otherwise an ahead-of-
	// UTC trip flips mid-evening on its last day, and a behind-UTC trip flips to
	// wrap-up while it's still the final evening locally (#167).
	const today = tripToday(tripTz(trip), now);
	const start = trip.start_date.split(/[T ]/)[0];
	const end = trip.end_date.split(/[T ]/)[0];

	if (today < start) return 'planning';
	if (today <= end) return 'active';
	return 'wrap-up';
}

/**
 * The live trip — start_date ≤ today ≤ end_date and not archived. Now an alias over
 * `getTripLifecycle`; callers that mean "active-only" (`today/`, `now/`) keep using
 * this and never accidentally match wrap-up/closed.
 */
export function isTripActive(trip: TripDateInfo, now: Date = new Date()): boolean {
	return getTripLifecycle(trip, now) === 'active';
}
