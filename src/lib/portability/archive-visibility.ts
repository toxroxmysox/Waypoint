import { tripToday, tripTz } from '$lib/shell/trip-time';

// Archive visibility (#241/#195 — Slice 3). Pure, I/O-free: `(trip, now)` in,
// visibility/status out — the load-bearing core the public `/archive/[token]` route
// and the owner's Share affordance both read.
//
// The publish gate is the EXPLICIT `archive_publish_at` date, NOT the legacy
// `end_date + archive_publish_after_days` math (that derivation leaked — it published
// a trip the owner never consented to close; WP-B-019). The owner sets
// `archive_publish_at` at closeout (binary Keep-private / Publish + an inline date
// defaulting to today) or via the standalone Publish control. Clearing it (reopen, or
// "disable sharing") returns the trip to unpublished.
//
// All date comparisons use the trip-LOCAL calendar date (mirroring getTripLifecycle /
// the #167 fix) — never a raw UTC compare — so a publish date of "today" goes live at
// the trip-local day boundary, not at a UTC offset.

/** The minimal trip shape this module reads. */
export interface ArchiveVisibilityTrip {
	archive_enabled?: boolean;
	archive_publish_at?: string;
	timezone?: string;
}

export type PublishStatus =
	| { status: 'live' }
	| { status: 'scheduled'; date: string }
	| { status: 'unpublished' };

/**
 * Resolve the day to store in `archive_publish_at` from a (possibly blank) form
 * value. An explicit `rawDate` is used as-is; a blank value defaults to the trip's
 * LOCAL "today" — never the UTC date. This MUST mirror the visibility gate below
 * (which compares against `tripToday(tripTz(trip))`): defaulting to the UTC date
 * here while the gate reads trip-local meant that, in the window after UTC midnight
 * but before the trip-local day rolled (evening in a behind-UTC zone), "publish
 * today" stored tomorrow's UTC date → the record read `scheduled` ("Publishes on
 * <tomorrow>") instead of going live now (#301). Returns a "YYYY-MM-DD" day.
 */
export function resolvePublishDay(
	rawDate: string,
	trip: ArchiveVisibilityTrip,
	now: Date = new Date()
): string {
	const explicit = (rawDate ?? '').split(/[T ]/)[0];
	return explicit || tripToday(tripTz(trip), now);
}

/** The publish-date day portion ("YYYY-MM-DD"), or "" when unset/blank. */
function publishDay(trip: ArchiveVisibilityTrip): string {
	const raw = (trip.archive_publish_at ?? '').trim();
	if (!raw) return '';
	return raw.split(/[T ]/)[0];
}

/**
 * Is the public record live RIGHT NOW? True only when sharing is enabled AND an
 * `archive_publish_at` is set AND the trip-local "today" has reached it. No date
 * (unpublished / reopen-paused) → false; a future date (scheduled) → false; sharing
 * disabled → false.
 */
export function isArchiveVisible(trip: ArchiveVisibilityTrip, now: Date = new Date()): boolean {
	if (trip.archive_enabled === false) return false;
	const day = publishDay(trip);
	if (!day) return false;
	const today = tripToday(tripTz(trip), now);
	return today >= day;
}

/**
 * Plain-language publish status for the owner's Share affordance:
 *  - `unpublished` — no `archive_publish_at` (Keep-private, or reopen-paused, or
 *    sharing disabled). The default, private-by-default terminal state.
 *  - `scheduled` (+date) — a future `archive_publish_at`; the record goes live then.
 *  - `live` — `archive_publish_at` has been reached; visible now.
 */
export function publishStatus(trip: ArchiveVisibilityTrip, now: Date = new Date()): PublishStatus {
	// Sharing disabled or never published → unpublished, whatever the date says.
	if (trip.archive_enabled === false) return { status: 'unpublished' };
	const day = publishDay(trip);
	if (!day) return { status: 'unpublished' };
	const today = tripToday(tripTz(trip), now);
	if (today >= day) return { status: 'live' };
	return { status: 'scheduled', date: day };
}
