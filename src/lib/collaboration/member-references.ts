// Member reference checks for removal disposition (#238, ADR-0013).
//
// The /api/members/remove hook auto-purges (hard-deletes) a member that NOTHING
// references, and tombstones one that any record references. Most references are
// relation FKs the hook scans directly, but `expenses.split_data` is a JSON field
// with NO foreign key — a member can owe a share of an expense someone else paid,
// and that membership lives only inside the split. Missing it would wrongly purge
// a member who still owes money (a money-integrity bug).
//
// This is the pure, testable core of that JSON membership check. The hook inlines
// an identical copy in its goja callback (the PB sandbox can't import modules);
// this module exists so the algorithm is unit-tested in isolation and documented
// in one place. Keep the two in lock-step.

import type { SplitData } from '$lib/money/types';

/**
 * True when `memberId` appears in an expense's parsed `split_data` — either as a
 * participant in an equal split (`members: [...]`) or as a key in a by-amount
 * split (`amounts: { memberId: n }`). A member present in a split is referenced
 * by that expense and must NOT be purged.
 *
 * Defensive against malformed/partial JSON (older rows, hand-edited data): a
 * value that is null, not an object, or missing both shapes simply returns false.
 */
export function splitDataReferencesMember(
	split: SplitData | null | undefined,
	memberId: string
): boolean {
	if (!split || typeof split !== 'object' || !memberId) return false;

	// Equal split: members is a string[] of member ids.
	const members = (split as { members?: unknown }).members;
	if (Array.isArray(members)) {
		for (const id of members) {
			if (id === memberId) return true;
		}
	}

	// By-amount split: amounts is keyed by member id.
	const amounts = (split as { amounts?: unknown }).amounts;
	if (amounts && typeof amounts === 'object') {
		if (Object.prototype.hasOwnProperty.call(amounts, memberId)) return true;
	}

	return false;
}

/**
 * True when ANY expense in the list references `memberId` via its split_data.
 * `expenses` is the trip's expenses with their already-parsed `split_data`.
 */
export function anyExpenseSplitReferencesMember(
	expenses: ReadonlyArray<{ split_data: SplitData | null | undefined }>,
	memberId: string
): boolean {
	for (const exp of expenses) {
		if (splitDataReferencesMember(exp.split_data, memberId)) return true;
	}
	return false;
}
