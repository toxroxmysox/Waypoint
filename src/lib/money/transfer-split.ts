// Transfer split participation on member reassign (#259, decision: move-to-target).
//
// When a departed member is removed with disposition='reassign', the
// /api/members/remove hook rewrites their AUTHORED records (expenses.paid_by,
// created_by, settlements, items, …) to the reassignment target. It did NOT
// touch `expenses.split_data` — the JSON field naming who an expense splits
// across. So after "reassign Bob→Alice + remove Bob", every expense Bob was
// split INTO still named Bob, and computeBalances / debt-simplify attributed
// Bob's owed share to the tombstone instead of Alice.
//
// This is the pure, testable core of that transfer. The hook inlines an
// identical copy in its goja callback (the PB sandbox can't import modules);
// this module exists so the algorithm is unit-tested in isolation and
// documented in one place. Keep the two in lock-step — sibling to
// `collaboration/member-references.ts`, which proves the membership READ.
//
// MERGE semantics (move-to-target):
//   equal { members: [...] }   — replace departed→target; if target is ALREADY
//                                present, dedupe so target appears once.
//   by_amount { amounts: {…} } — move departed's amount to target; if target
//                                already has an amount, SUM the two; drop the
//                                departed key.
//   An expense not referencing the departed member is returned UNCHANGED.

import type { SplitData, SplitDataEqual, SplitDataByAmount } from './types';

/**
 * Rewrite a single expense's `split_data` so a departed member's split
 * PARTICIPATION transfers to the reassignment target (move-to-target, merge).
 *
 * Returns a NEW split object when a rewrite happened, or the original `split`
 * reference unchanged when the departed member is absent (so callers can skip
 * the save). Defensive against malformed/partial JSON (older or hand-edited
 * rows): a value that is null, not an object, or missing both shapes is
 * returned untouched.
 *
 * `fromId` and `toId` must differ and both be non-empty — the remove hook
 * already guarantees this (reassign_to required, != the member being removed),
 * but we guard so a degenerate call is a no-op rather than corrupting data.
 */
export function transferSplitParticipation(
	split: SplitData | null | undefined,
	fromId: string,
	toId: string
): SplitData | null | undefined {
	if (!split || typeof split !== 'object') return split;
	if (!fromId || !toId || fromId === toId) return split;

	// Equal split: members is a string[] of member ids.
	const members = (split as { members?: unknown }).members;
	if (Array.isArray(members)) {
		if (!members.includes(fromId)) return split; // departed not a participant
		const next: string[] = [];
		for (const id of members) {
			if (id === fromId) {
				// Replace with target — but only add it once (dedupe if already present
				// earlier or later in the list).
				if (!next.includes(toId)) next.push(toId);
			} else if (id === toId) {
				// Target already present: keep it once; skip if we already added it.
				if (!next.includes(toId)) next.push(toId);
			} else {
				next.push(id);
			}
		}
		return { members: next } as SplitDataEqual;
	}

	// By-amount split: amounts is keyed by member id → number.
	const amounts = (split as { amounts?: unknown }).amounts;
	if (amounts && typeof amounts === 'object') {
		const src = amounts as Record<string, number>;
		if (!Object.prototype.hasOwnProperty.call(src, fromId)) return split; // not a participant
		const next: Record<string, number> = {};
		for (const key of Object.keys(src)) {
			if (key === fromId) continue; // drop the departed key; folded into target below
			next[key] = src[key];
		}
		// Move (and SUM, if the target already owes) the departed amount onto target.
		const moved = src[fromId];
		next[toId] = (Object.prototype.hasOwnProperty.call(next, toId) ? next[toId] : 0) + moved;
		return { amounts: next } as SplitDataByAmount;
	}

	// Neither recognised shape — leave untouched.
	return split;
}

/**
 * True when `transferSplitParticipation` would change this split — i.e. the
 * departed member participates in it. Lets a caller (the hook) decide whether
 * to write the record back at all.
 */
export function splitNeedsTransfer(
	split: SplitData | null | undefined,
	fromId: string
): boolean {
	if (!split || typeof split !== 'object' || !fromId) return false;
	const members = (split as { members?: unknown }).members;
	if (Array.isArray(members)) return members.includes(fromId);
	const amounts = (split as { amounts?: unknown }).amounts;
	if (amounts && typeof amounts === 'object') {
		return Object.prototype.hasOwnProperty.call(amounts, fromId);
	}
	return false;
}
