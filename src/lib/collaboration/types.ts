import type { RecordModel } from 'pocketbase';
import type { Item } from '../itinerary/types';

export type MemberRole = 'owner' | 'co_owner' | 'traveler' | 'viewer';

export interface TripMember extends RecordModel {
	trip: string;
	user: string;
	placeholder_name: string;
	placeholder_email: string;
	display_name: string;
	role: MemberRole;
	joined_at: string;
	/** #133: empty = active member; non-empty = Departed Member tombstone. */
	removed_at: string;
	/** Set by the M2c auto-merge hook when a placeholder is claimable. */
	claimable_by?: string;
}

export type InviteRole = 'co_owner' | 'traveler' | 'viewer';

export interface PendingInvite extends RecordModel {
	trip: string;
	email: string;
	role: InviteRole;
	invited_by: string;
	code: string;
	expires_at: string;
}

export type SuggestionStatus = 'pending' | 'approved' | 'rejected';
export type SuggestionTargetType = 'new_item' | 'comment';

export interface Suggestion {
	id: string;
	trip: string;
	author_id: string;
	author_name: string;
	author_role: MemberRole;
	target_type: SuggestionTargetType;
	payload: Partial<Item> | null;
	status: SuggestionStatus;
	reviewed_at: string;
	created: string;
}

export type NotificationType = 'suggestion_added' | 'comment_added' | 'member_joined';

export interface Notification {
	id: string;
	trip: string;
	type: NotificationType;
	body: string;
	link: string;
	read_at: string | null;
	created: string;
}

export interface Comment {
	id: string;
	trip: string;
	author: string;
	target_type: 'comment';
	target_item: string;
	comment_text: string;
	status: 'approved';
	created: string;
	expand?: { author?: TripMember };
	author_name?: string;
	author_role?: string;
	author_avatar?: string;
}

export type VoteValue = 'love' | 'like' | 'flexible' | 'dislike';

export interface Vote {
	id: string;
	trip: string;
	item: string;
	member: string;
	value: VoteValue;
	created: string;
}

// #77 — a vote on a Trip Goal. Parallels `Vote` (ADR-0004: separate collection,
// not polymorphic). No `trip` field — trip is reachable via `goal`. Shares
// `VoteValue` + voting.ts grouping/scoring with item votes.
export interface GoalVote {
	id: string;
	goal: string;
	member: string;
	value: VoteValue;
	created: string;
}
