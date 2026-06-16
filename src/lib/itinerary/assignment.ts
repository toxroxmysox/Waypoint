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
