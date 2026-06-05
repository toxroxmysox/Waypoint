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

export type NowViewState =
	| { kind: 'mid-event'; currentItem: Item; nextItem: Item | null; tomorrowFirstItem: Item | null; minutesRemaining: number }
	| { kind: 'between-things'; nextItem: Item; minutesUntilNext: number }
	| { kind: 'day-wrapped'; completedCount: number; totalCount: number }
	| { kind: 'no-day' };
