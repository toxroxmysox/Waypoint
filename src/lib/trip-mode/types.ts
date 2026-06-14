import type { Item, Day } from '$lib/types';

export interface DayGroup {
	day: Day;
	items: Item[];
}

export interface NowState {
	today: Day | null;
	todayItems: Item[];
	nextItem: Item | null;
	isPast: (item: Item) => boolean;
}

export interface UpNext {
	tomorrowDay: Day | null;
	tomorrowItems: Item[];
}

export interface Timeline {
	upcomingDays: DayGroup[];
}

export interface TripModeState {
	now: NowState;
	upNext: UpNext;
	timeline: Timeline;
}

/**
 * The single always-on Focus block at the top of the Now view (#121/#153). Its
 * content varies by state; the view (#154) renders weight/detail, this only
 * derives which state is live.
 */
export type NowFocus =
	| { kind: 'no-day' }
	| { kind: 'mid-event'; currentItem: Item; minutesRemaining: number }
	| { kind: 'free-time'; nextItem: Item; minutesUntilNext: number }
	| { kind: 'nothing-else-planned' }
	// Day-wrapped summary counts what was PLANNED for today, not what's "done":
	// done is Closeout's verdict and no Trip-Mode surface can move it (#199).
	| { kind: 'wrapped-summary'; totalCount: number };

/**
 * Full Now derivation: one Focus + a forward, today-only item list (items still
 * ahead; past hidden; multi-day excluded — those surface as banners via the
 * loader). In free-time, `focus.nextItem === forwardItems[0]`; the view decides
 * weight. In mid-event the ongoing item is the Focus and is NOT duplicated in
 * the list.
 */
export interface NowViewState {
	focus: NowFocus;
	forwardItems: Item[];
}
