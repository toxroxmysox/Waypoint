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

import type { ItemStatus } from './types';

export interface MoveItemInput {
	/** The item's status before the move. */
	currentStatus: ItemStatus | string;
	/** Target day id, or '' to unschedule. */
	newDay: string;
	/** Target phase id, or '' for none. */
	newPhase: string;
}

export interface MoveItemPatch {
	day: string;
	phase: string;
	status: ItemStatus;
	/** Present (and empty) only when the move clears the day — strips the anchor. */
	start_time?: string;
	end_time?: string;
	/** Present (and reset) only when the move clears the day. */
	sort_order?: number;
}

const TERMINAL: ReadonlySet<string> = new Set(['done', 'considered']);

/**
 * Compute the status/day/phase patch for a move so day and status can never
 * contradict. Pure — no I/O; unit-tested across the full status × day matrix.
 */
export function computeMovePatch(input: MoveItemInput): MoveItemPatch {
	const { currentStatus, newDay, newPhase } = input;
	const day = newDay || '';
	const phase = newPhase || '';
	const isTerminal = TERMINAL.has(currentStatus);

	if (day) {
		// Scheduled onto a day: become planned unless the item is closeout-terminal.
		return {
			day,
			phase,
			status: (isTerminal ? currentStatus : 'planned') as ItemStatus
		};
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
