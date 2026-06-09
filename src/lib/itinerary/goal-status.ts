// #78 — Goal status derivation (deep module). V4_GROUP_INPUT_PRD "Goal status
// derivation". A goal's status flows UPWARD from its linked items only; it is
// never written back down to the items.
//
//   - ≥1 linked item: status = the highest-maturity linked item status, by the
//     total order `done > planned > unplanned > considered`. Manual status is
//     ignored while links exist (keeps the goal honest — no phantom achievement).
//     Consequence: a goal is `considered` only when EVERY linked item is.
//   - zero linked items: status = manual_status (the goal's authored intent).
import type { GoalStatus, ItemStatus } from './types';

// Total order, most-mature first. A goal collapses to the single most-mature
// status among its links, so `considered` (all paths abandoned) only wins when
// nothing more mature is present.
export const STATUS_MATURITY: Record<GoalStatus, number> = {
	done: 3,
	planned: 2,
	unplanned: 1,
	considered: 0
};

/**
 * Derive a goal's effective status from its linked items.
 *
 * @param linkedItemStatuses statuses of the items linked to the goal (any order)
 * @param manualStatus the goal's authored `manual_status`, used only when unlinked
 */
export function deriveGoalStatus(
	linkedItemStatuses: ItemStatus[],
	manualStatus: GoalStatus
): GoalStatus {
	if (linkedItemStatuses.length === 0) return manualStatus;
	return linkedItemStatuses.reduce((best, status) =>
		STATUS_MATURITY[status] > STATUS_MATURITY[best] ? status : best
	);
}
