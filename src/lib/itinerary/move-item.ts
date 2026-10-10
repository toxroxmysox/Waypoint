// #172 — moveItem status/day invariant, as a pure function.
//
// The item-detail "Move" action let day and status drift apart: it wrote day
// + phase but never status, so pulling an unplanned idea onto a day left it
// `unplanned` (shows in parking, not on the day) and clearing a planned item's
// day left it `planned` (shows nowhere, or twice). This centralizes the single
// invariant the day view's pullToPlan/pushToParking already enforce:
//
//   - day SET   → status `planned`   (unless terminal: done / considered)
//   - day CLEARED → status `unplanned` (unless terminal: done / considered)
//
// `done` and `considered` are closeout-terminal and never auto-flipped by a
// move (mirrors items/[itemId]/edit). Clearing a day also strips the time
// anchors so "unscheduled" means unscheduled — no silent re-anchor later
// (mirrors pushToParking, #60).
//
// #497 — setting a day re-anchors a timed item: start_time/end_time/end_date
// shift by the whole days between the old start date and the new day's date,
// keeping their clocks. The day page reads clock minutes and never noticed;
// Now compares absolute instants and bucketed moved items as Earlier.

import type { ItemStatus } from './types';
import { daysBetween, shiftStoredDays } from '$lib/shell/trip-time';

export interface MoveItemInput {
	/** The item's status before the move. */
	currentStatus: ItemStatus | string;
	/** Target day id, or '' to unschedule. */
	newDay: string;
	/** Target phase id, or '' for none. */
	newPhase: string;
	/** Target day's date — with `times`, re-anchors a timed item (#497). */
	newDayDate?: string;
	/** The item's current anchors. */
	times?: { start_time: string; end_time: string; end_date: string };
}

export interface MoveItemPatch {
	day: string;
	phase: string;
	status: ItemStatus;
	/** Emptied when the move clears the day; shifted when a day re-anchors a timed item. */
	start_time?: string;
	end_time?: string;
	/** Shifted with the times when a day re-anchors a timed item. */
	end_date?: string;
	/** Present (and reset) only when the move clears the day. */
	sort_order?: number;
}

const TERMINAL: ReadonlySet<string> = new Set(['done', 'considered']);

/**
 * Compute the status/day/phase patch for a move so day and status can never
 * contradict. Pure — no I/O; unit-tested across the full status × day matrix.
 */
export function computeMovePatch(input: MoveItemInput): MoveItemPatch {
	const { currentStatus, newDay, newPhase, newDayDate, times } = input;
	const day = newDay || '';
	const phase = newPhase || '';
	const isTerminal = TERMINAL.has(currentStatus);

	if (day) {
		// Scheduled onto a day: become planned unless the item is closeout-terminal.
		const patch: MoveItemPatch = {
			day,
			phase,
			status: (isTerminal ? currentStatus : 'planned') as ItemStatus
		};
		const anchor = times?.start_time || times?.end_time;
		if (newDayDate && times && anchor) {
			const delta = daysBetween(anchor, newDayDate);
			if (delta !== 0) {
				patch.start_time = shiftStoredDays(times.start_time, delta);
				patch.end_time = shiftStoredDays(times.end_time, delta);
				patch.end_date = shiftStoredDays(times.end_date, delta);
			}
		}
		return patch;
	}

	// Unscheduled: become unplanned unless terminal. Strip the time anchor and
	// reset sort order so the item is a clean parking-lot idea.
	return {
		day: '',
		phase,
		status: (isTerminal ? currentStatus : 'unplanned') as ItemStatus,
		start_time: '',
		end_time: '',
		sort_order: 0
	};
}
