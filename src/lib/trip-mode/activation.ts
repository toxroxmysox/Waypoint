export type TripViewMode = 'planning' | 'trip';

export interface TripDateInfo {
	start_date: string;
	end_date: string;
	archived: boolean;
	/** IANA timezone; "today" is computed in this zone, falling back to UTC. */
	timezone?: string;
}

// `isTripActive` now collapses to `getTripLifecycle(...) === 'active'` — the live-trip
// branch of the 4-state lifecycle (#195). Re-exported here so its existing callers
// (`today/upcoming/`, `now/`, AppShell, the Overview, documents) keep their import path
// and keep meaning active-ONLY, never active-or-wrap-up. The trip-local date comparison
// (the #167 fix) lives in `getTripLifecycle`.
export { isTripActive } from './trip-lifecycle';
