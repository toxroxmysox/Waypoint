import { writable } from 'svelte/store';

// The day card's second metric is a persisted, cross-surface UI preference
// (CARD_CONTENT_SPEC §1): one toggle drives every day card on both the trip
// overview and Phase Detail. Persisted to localStorage so it survives reload.

export type DayCardMetric = 'booked' | 'budget';

const STORAGE_KEY = 'waypoint:day-card-metric';

// Guard on `window`, not `localStorage`: under SSR `localStorage` can be a
// defined-but-stub global whose `.getItem` throws (matches reduced-motion.ts).
function initial(): DayCardMetric {
	if (typeof window === 'undefined') return 'booked';
	return window.localStorage.getItem(STORAGE_KEY) === 'budget' ? 'budget' : 'booked';
}

export const dayCardMetric = writable<DayCardMetric>(initial());

dayCardMetric.subscribe((value) => {
	if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, value);
});

export function toggleDayCardMetric() {
	dayCardMetric.update((m) => (m === 'booked' ? 'budget' : 'booked'));
}
