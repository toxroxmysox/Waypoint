import type { MemberRole } from '$lib/collaboration/types';
import type { TripViewMode } from '$lib/trip-mode/activation';
import type { Item } from './types';

// #416 — what a member may do with one item, and where Skip lands.
//
// One pure function so every item surface gates its controls the same way, and
// so a control only renders when the server will accept it. Each rule MIRRORS a
// real server gate; change the gate and this together, never this alone:
//
//   canEdit / canMove   items.pb.js onRecordUpdateRequest: owner/co_owner, or the
//                       item's creator (`created_by` holds a trip_members id). The
//                       creator check runs BEFORE the viewer block, so a creator
//                       later lowered to viewer still passes. A move is an update.
//   canDelete           items.pb.js onRecordDeleteRequest: owner/co_owner only.
//   canSkip             the item page's skipItem action: owner/co_owner only; and
//                       only a planned item that sits on a day has anything to skip.
//   canUpload           documents.pb.js onRecordCreateRequest: no viewers.
//   canEditChecklist    checklists.pb.js + tasks.pb.js: no viewers.
//   canVote             votes.createRule (migration 0055): member.role != viewer.
//   canLogPayment       expenses: no viewers; a note has nothing to pay (#229).
//
// The self-assign exception (#226) is `canSelfAssign` in assignment.ts.

export interface ItemPermissionMember {
	/** The caller's `trip_members` id — compared to `item.created_by`. */
	id: string;
	role: MemberRole | string;
}

export type ItemPermissionItem = Pick<Item, 'created_by' | 'status' | 'day' | 'type'>;

export interface ItemPermissions {
	canEdit: boolean;
	canMove: boolean;
	canDelete: boolean;
	canSkip: boolean;
	canUpload: boolean;
	canEditChecklist: boolean;
	canVote: boolean;
	canLogPayment: boolean;
}

export function itemPermissions(
	member: ItemPermissionMember,
	item: ItemPermissionItem
): ItemPermissions {
	const role = member.role;
	const privileged = role === 'owner' || role === 'co_owner';
	const contributor = privileged || role === 'traveler';
	const creator = !!item.created_by && !!member.id && item.created_by === member.id;
	const canEdit = privileged || (creator && (contributor || role === 'viewer'));

	return {
		canEdit,
		canMove: canEdit,
		canDelete: privileged,
		canSkip: privileged && item.status === 'planned' && !!item.day,
		canUpload: contributor,
		canEditChecklist: contributor,
		canVote: contributor,
		canLogPayment: contributor && item.type !== 'note'
	};
}

/**
 * The generic in-context message for a refused or failed Move / Skip / Delete.
 * Generic on purpose: the usual cause is a role that changed since the page
 * loaded, and a reload re-gates the controls.
 */
export const ITEM_ACTION_ERRORS = {
	move: "Couldn't move this item. Reload the page and try again.",
	skip: "Couldn't skip this item. Reload the page and try again.",
	delete: "Couldn't delete this item. Reload the page and try again."
} as const;

/**
 * Where a successful Skip lands (#416, Scott 2026-10-06). In Trip Mode it goes
 * to Now, where the ideas strip offers a replacement (#246). In Planning Mode it
 * stays on the item page: `null` means "don't navigate".
 */
export function skipDestination(mode: TripViewMode, slug: string): string | null {
	return mode === 'trip' ? `/trips/${slug}/now` : null;
}

/** One row of the item page's ⋯ menu (#437). */
export type ItemMenuEntry =
	| { id: 'move' | 'skip' | 'delete'; label: string }
	| { id: 'divider' };

/**
 * #437 — what the ⋯ menu lists, from the #416 permissions: Move to another day,
 * Skip…, a divider, Delete. Pure projection, no role logic of its own. An empty
 * list means the page renders no ⋯ at all. The divider only appears when
 * something precedes Delete.
 */
export function itemMenuEntries(p: Pick<ItemPermissions, 'canMove' | 'canSkip' | 'canDelete'>): ItemMenuEntry[] {
	const entries: ItemMenuEntry[] = [];
	if (p.canMove) entries.push({ id: 'move', label: 'Move to another day' });
	if (p.canSkip) entries.push({ id: 'skip', label: 'Skip…' });
	if (p.canDelete) {
		if (entries.length > 0) entries.push({ id: 'divider' });
		entries.push({ id: 'delete', label: 'Delete' });
	}
	return entries;
}
