// #173 — clone item copy-set + status/day mapping, as pure functions.
//
// Clone was broken on real trips three ways, all centralized here:
//
//  1. Flights were silently dropped. The clone wizard's selectable type list
//     omitted `flight` (and `checklist`), so flight items never made it into
//     the copy set. CLONEABLE_ITEM_TYPES is the single source of truth for
//     "which item types a clone offers" — it includes `flight`.
//
//  2. Statuses were flattened: every cloned item was forced to `planned`. The
//     clone target is future-dated, so a finished/considered idea SHOULD reset
//     to `planned` (it's a fresh plan) — but an UNPLANNED idea (parking-lot
//     wish) must STAY unplanned, or cloning last year's trip loses exactly the
//     parking lot you wanted to reuse. cloneItemStatus encodes that:
//        unplanned                      → unplanned
//        planned | done | considered    → planned
//
//  3. The #196 invariant: an item must never be day-less-but-`planned` (shows
//     nowhere) nor day-bearing-but-`unplanned`. cloneItemPlacement keeps day
//     and status consistent: an `unplanned` clone is forced day-less (parking
//     lot), a `planned` clone keeps its mapped day. This mirrors the
//     day SET → planned / day CLEARED → unplanned rule in move-item.ts.
//
// `checklist` is intentionally NOT in CLONEABLE_ITEM_TYPES: checklists are
// cloned through their own machinery (clone-checklists.ts / fetchManualChecklists),
// not as plain items.

import type { ItemType, ItemStatus } from './types';

/**
 * Item types a clone offers / copies. Flight included (the prior bug). Checklist
 * excluded — it rides the dedicated checklist clone path, not the item copy set.
 */
export const CLONEABLE_ITEM_TYPES: readonly ItemType[] = [
	'lodging',
	'transportation',
	'flight',
	'activity',
	'meal',
	'note'
] as const;

/**
 * Map a source item's status onto the (future-dated) clone target.
 *   unplanned → unplanned (parking-lot ideas stay ideas)
 *   planned | done | considered → planned (the clone is a fresh plan)
 */
export function cloneItemStatus(sourceStatus: ItemStatus | string): ItemStatus {
	return sourceStatus === 'unplanned' ? 'unplanned' : 'planned';
}

export interface CloneItemPlacementInput {
	sourceStatus: ItemStatus | string;
	/** The clone-target day id resolved from the source day, or '' if none. */
	mappedDay: string;
	/** The clone-target phase id resolved from the source phase, or '' if none. */
	mappedPhase: string;
}

export interface CloneItemPlacement {
	status: ItemStatus;
	day: string;
	phase: string;
}

/**
 * Resolve the {status, day, phase} of a cloned item so day and status can never
 * contradict (#196). Two invariants, enforced here so every caller is safe:
 *
 *   - An unplanned idea is forced day-less (parking lot).
 *   - A would-be `planned` item whose day did NOT resolve (e.g. a phases-off
 *     clone, or the source day fell outside the new range) is downgraded to
 *     `unplanned` parking — NEVER left day-less-but-`planned` (which renders
 *     nowhere). Phases off ⇒ no days ⇒ everything lands in the parking lot.
 *
 * A `planned` item with a resolved day keeps that day + phase.
 */
export function cloneItemPlacement(input: CloneItemPlacementInput): CloneItemPlacement {
	const status = cloneItemStatus(input.sourceStatus);
	if (status === 'planned' && input.mappedDay) {
		return { status: 'planned', day: input.mappedDay, phase: input.mappedPhase };
	}
	// Unplanned idea, OR a planned item with no day to land on → parking lot.
	return { status: 'unplanned', day: '', phase: '' };
}
