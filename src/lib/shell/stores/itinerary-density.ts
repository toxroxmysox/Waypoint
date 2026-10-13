import { writable } from 'svelte/store';

// #401 — the trip Overview's itinerary density: Compact (one row per day,
// default) or Details (DayCards). A persisted per-viewer preference, like the
// day-card metric. Storage can be absent or throw (private mode): fall back to
// the default and never fail the page.

export type ItineraryDensity = 'compact' | 'details';

const STORAGE_KEY = 'wp.itineraryDensity';

function initial(): ItineraryDensity {
	if (typeof window === 'undefined') return 'compact';
	try {
		return window.localStorage.getItem(STORAGE_KEY) === 'details' ? 'details' : 'compact';
	} catch {
		return 'compact';
	}
}

export const itineraryDensity = writable<ItineraryDensity>(initial());

itineraryDensity.subscribe((value) => {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(STORAGE_KEY, value);
	} catch {
		// Storage blocked: the choice lasts this visit only.
	}
});
