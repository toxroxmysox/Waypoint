// #258 — one-tap quick-split presets for ExpenseForm.
// Presets are pure setters over the existing equal-split model (splitMode='equal'
// + splitMembers Set). They never introduce a new data shape — "Whole group" =
// every active member, "Just me" = the current member only. The page already
// hands ExpenseForm a tombstone-free member list (load filters removed_at = ""),
// so `allMemberIds` is assumed active; no extra filtering happens here.

export type SplitPreset = 'whole_group' | 'just_me';

/** The member-id set a preset selects. Equal-split only — by_amount has no preset. */
export function presetMembers(
	preset: SplitPreset,
	allMemberIds: string[],
	currentMemberId: string
): Set<string> {
	if (preset === 'just_me') return new Set([currentMemberId]);
	return new Set(allMemberIds);
}

/**
 * Which preset (if any) the live split state currently matches, so the active
 * chip never lies after a manual checkbox toggle (acceptance #2). Only `equal`
 * mode can match a preset; `by_amount` always returns null. Set comparison is
 * order-independent and ignores any stale ids not in `allMemberIds`.
 */
export function activePreset(
	mode: 'equal' | 'by_amount',
	selected: Set<string>,
	allMemberIds: string[],
	currentMemberId: string
): SplitPreset | null {
	if (mode !== 'equal') return null;
	if (setEquals(selected, new Set([currentMemberId]))) return 'just_me';
	if (setEquals(selected, new Set(allMemberIds))) return 'whole_group';
	return null;
}

function setEquals(a: Set<string>, b: Set<string>): boolean {
	if (a.size !== b.size) return false;
	for (const v of a) if (!b.has(v)) return false;
	return true;
}
