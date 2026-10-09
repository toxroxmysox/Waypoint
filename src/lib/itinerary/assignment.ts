import type { MemberRole } from '$lib/collaboration/types';

// The self-assign brain (#226, ADR-0011). Two pure, I/O-free functions so the
// "who may self-assign" + "toggle me on/off this item" rules live in exactly one
// place — the server action and any optimistic UI call through these.

/**
 * Whether a member with this role may self-assign (add/remove themselves on an
 * item's `assigned_to`). Travelers, co-owners, and owners may; viewers may not
 * (read-only — #175 role matrix). An unknown/blank role is treated as non-member
 * → false.
 */
export function canSelfAssign(role: MemberRole | string | undefined | null): boolean {
	return role === 'traveler' || role === 'co_owner' || role === 'owner';
}

/**
 * Toggle `memberId` in an `assigned_to` array: add it if absent, remove it if
 * present. Idempotent per call, order-stable (appends to the end, preserves the
 * order of the rest), and never produces duplicates. Returns a new array; the
 * input is not mutated. `assigned_to` holds `trip_members.id` (NOT `users.id`).
 */
export function toggleAssignee(assignedTo: readonly string[], memberId: string): string[] {
	if (assignedTo.includes(memberId)) {
		return assignedTo.filter((id) => id !== memberId);
	}
	return [...assignedTo, memberId];
}

// ---------------------------------------------------------------------------
// #402 — three-state Going (CONTEXT.md "Assignment"; CARD_SYSTEM D6). A member is
// going (in `assigned_to`), not going (in `not_going`, said so) or has no answer
// (in neither). The server keeps the two lists exclusive (items.pb.js model
// hook); these pure helpers are the client/endpoint side of the same model.
// ---------------------------------------------------------------------------

/** A member's answer to "Are you going?" on one item. */
export type GoingState = 'going' | 'not_going' | 'no_answer';

const GOING_STATES: readonly GoingState[] = ['going', 'not_going', 'no_answer'];

/** Parse an untrusted value into a GoingState (exact match), else `null`. */
export function parseGoingState(raw: unknown): GoingState | null {
	return typeof raw === 'string' && (GOING_STATES as readonly string[]).includes(raw)
		? (raw as GoingState)
		: null;
}

/**
 * A member's answer on an item. Going wins if the member is somehow in both
 * lists — the same tie-break the server applies when it restores exclusivity.
 */
export function goingStateOf(
	item: { assigned_to?: readonly string[] | null; not_going?: readonly string[] | null },
	memberId: string
): GoingState {
	if (item.assigned_to?.includes(memberId)) return 'going';
	if (item.not_going?.includes(memberId)) return 'not_going';
	return 'no_answer';
}

/**
 * The two lists after `memberId` answers `state` (#440): the client mirror of
 * `goingPatch` for the optimistic update. Appends, keeps order, never duplicates,
 * does not mutate the input.
 */
export function applyGoing(
	lists: { assigned_to?: readonly string[] | null; not_going?: readonly string[] | null },
	memberId: string,
	state: GoingState
): { assigned_to: string[]; not_going: string[] } {
	const without = (a?: readonly string[] | null) => (a ?? []).filter((id) => id !== memberId);
	const assigned = state === 'going' ? [...(lists.assigned_to ?? [])] : without(lists.assigned_to);
	const notGoing = state === 'not_going' ? [...(lists.not_going ?? [])] : without(lists.not_going);
	if (state === 'going' && !assigned.includes(memberId)) assigned.push(memberId);
	if (state === 'not_going' && !notGoing.includes(memberId)) notGoing.push(memberId);
	return {
		assigned_to: state === 'not_going' ? without(assigned) : assigned,
		not_going: state === 'going' ? without(notGoing) : notGoing
	};
}

/**
 * The PocketBase update body that sets ONE member's answer, using the relation
 * `+`/`-` modifiers so it only ever touches that member's id (no client-supplied
 * array). Not a concurrency guarantee: PB applies the modifiers to the record as
 * loaded, so two answers within a few ms can lose one — accepted (#402 review).
 */
export function goingPatch(state: GoingState, memberId: string): Record<string, string> {
	switch (state) {
		case 'going':
			return { 'assigned_to+': memberId, 'not_going-': memberId };
		case 'not_going':
			return { 'not_going+': memberId, 'assigned_to-': memberId };
		case 'no_answer':
			return { 'assigned_to-': memberId, 'not_going-': memberId };
	}
}
