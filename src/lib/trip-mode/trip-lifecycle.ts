import { tripToday, tripTz } from '$lib/shell/trip-time';
import type { TripDateInfo } from './activation';

/**
 * The trip's derived lifecycle — there is NO stored `status` field; only `archived`
 * persists. Everything else is computed from the trip's dates against "now", in the
 * trip-local timezone (#167). The five states are mutually exclusive:
 *
 *  - `forming`  — start_date is empty (#270 / ADR-0022). A trip may exist without
 *    dates: collect ideas, invite people, set goals. Promotion to a dated trip is
 *    the first date-set (one-way — the hook rejects clearing dates). "Forming" is
 *    internal vocabulary, never a UI label.
 *  - `planning` — today < start_date.
 *  - `active`   — start_date ≤ today ≤ end_date (the `isTripActive` truth).
 *  - `wrap-up`  — today > end_date AND not archived (the day after the trip ends).
 *  - `closed`   — archived. Takes precedence over the date comparison: an archived
 *    trip is ALWAYS closed, whatever its dates say. Re-deriving — `archived:false`
 *    on a past-end trip drops back to `wrap-up` (or `active` if still in range);
 *    there is no special "reopened" state.
 */
export type TripLifecycle = 'forming' | 'planning' | 'active' | 'wrap-up' | 'closed';

/**
 * Derive a trip's lifecycle from its dates + `archived`, comparing in the trip-local
 * timezone. Pure: same `(trip, now)` → same output, no I/O.
 */
export function getTripLifecycle(trip: TripDateInfo, now: Date = new Date()): TripLifecycle {
	// Archived takes precedence over every date comparison — a closed trip is closed
	// even mid-range. Reopening (archived → false) re-runs the date logic below.
	if (trip.archived) return 'closed';

	// Forming ⇔ start_date empty (ADR-0022). PB stores an unset date as '', so
	// this is a plain truthiness check in TS (the hooks must use getString —
	// goja returns a truthy DateTime for an empty date field).
	if (!trip.start_date) return 'forming';

	// A start-only trip shouldn't exist (both-or-neither is enforced at the app
	// layer), but if one slips through, never let the empty end_date read as
	// "today > end" and flip the trip to wrap-up — collapse to the safe
	// planning default.
	if (!trip.end_date) return 'planning';

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
