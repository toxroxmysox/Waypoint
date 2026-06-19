// #248 / PRD #202 — the testable CORE of the contribution loop's read side.
//
// A pure merge of a phase's real unplanned [[Item]]s and its pending
// [[Suggestion]]s ([[Ghost Card]]s) into ONE ordered, vote-tagged card list.
// Every parking-lot surface (Phase Detail, day-view parking zones, the Overview
// ideas affordance) renders through this so a ghost looks and sorts like a real
// idea everywhere — the dotted/"pending" treatment is a RENDER concern, not a
// data gate (ghosts are in the list for all members).
//
// No I/O. No `items` row exists for a pending suggestion — a ghost is a VIEW over
// a `suggestions` row (ADR-0009), so the two sources are merged here, never in
// the DB.
//
// Sort REUSES the existing vote-score parking-lot order (voting.ts): aggregate
// weighted vote score desc, ties broken by `sort_order` asc. Score is the point —
// a well-loved ghost outranks a lonely item. Real items carry their drag-assigned
// `sort_order`; ghosts (no stored order) are slotted AFTER the items' order range,
// oldest-first, so equal-score ghosts trail equal-score items deterministically.

import type { Item } from './types';
import type { MemberRole, Suggestion, VoteValue } from '../collaboration/types';
import { scoreVotes, sortByVoteScore, type DisplayVote } from '../collaboration/voting';

/** A vote on either a real item (`Vote`) or a ghost (`SuggestionVote`). Both
 *  satisfy the target-agnostic `DisplayVote` (id + member + value), which is all
 *  scoring (value) and the avatar stack (id + member) need. */
export type CardVote = DisplayVote;

/** A real, parked (unplanned) item. */
export interface ItemCard {
	kind: 'item';
	id: string;
	sort_order: number;
	/** The unplanned `items` row this card renders. */
	item: Item;
	/** Votes on the item (`votes` collection). */
	votes: CardVote[];
}

/** A pending suggestion shown as a dotted "pending" ghost. */
export interface GhostCard {
	kind: 'ghost';
	id: string;
	sort_order: number;
	/** The pending `suggestions` row this card is a view over. */
	suggestion: Suggestion;
	/** Votes on the suggestion (`suggestion_votes` collection). */
	votes: CardVote[];
}

export type Card = ItemCard | GhostCard;

export interface ParkingLotInput {
	/** The phase this parking lot belongs to. Ghosts are scoped to it. */
	phaseId: string;
	/** The viewing member's role. Viewers see ghosts read-only (render concern). */
	viewerRole: MemberRole;
	/** Votes for a real item, keyed by `item.id`. Missing → no votes. */
	votesByItem?: Record<string, CardVote[]>;
	/** Votes for a suggestion, keyed by `suggestion.id`. Missing → no votes. */
	votesBySuggestion?: Record<string, CardVote[]>;
}

const GHOST_SORT_BASE = 1_000_000;

/** Pull a suggestion's target phase from its payload. '' when absent. */
function suggestionPhase(s: Suggestion): string {
	return (s.payload?.phase as string | undefined) ?? '';
}

/**
 * Merge a phase's unplanned items + its pending suggestions into one ordered,
 * vote-tagged card list.
 *
 * - Ghosts are scoped to `payload.phase === phaseId`. A pending suggestion for
 *   another phase (or none) is dropped — every parking-lot surface is
 *   phase-scoped, so a ghost only appears in its own phase's lot.
 * - Only PENDING suggestions become ghosts. Approved/rejected suggestions are
 *   history (approved ones already live in `items`); they never ghost.
 * - All members get every in-phase ghost — `viewerRole` does NOT filter the list
 *   (read-only-but-can-see); it rides along for the renderer's voting affordance.
 * - Sort reuses voting.ts (score desc, sort_order asc). Pure: inputs untouched.
 */
export function parkingLotCards(
	unplannedItems: Item[],
	pendingSuggestions: Suggestion[],
	{ phaseId, votesByItem = {}, votesBySuggestion = {} }: ParkingLotInput
): Card[] {
	const itemCards: ItemCard[] = unplannedItems.map((item) => ({
		kind: 'item',
		id: item.id,
		sort_order: item.sort_order ?? 0,
		item,
		votes: votesByItem[item.id] ?? []
	}));

	// In-phase pending suggestions only, oldest-first for a stable ghost order.
	const ghostSource = pendingSuggestions
		.filter((s) => s.status === 'pending' && suggestionPhase(s) === phaseId)
		.slice()
		.sort((a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : 0));

	const ghostCards: GhostCard[] = ghostSource.map((suggestion, i) => ({
		kind: 'ghost',
		id: suggestion.id,
		// Slot ghosts after the items' order range so equal-score ties land
		// items-then-ghosts; among ghosts, oldest-first (index order).
		sort_order: GHOST_SORT_BASE + i,
		suggestion,
		votes: votesBySuggestion[suggestion.id] ?? []
	}));

	const cards: Card[] = [...itemCards, ...ghostCards];

	const scoreByCard: Record<string, number> = {};
	for (const c of cards) scoreByCard[c.id] = scoreVotes(c.votes);

	return sortByVoteScore(cards, scoreByCard);
}

export type { VoteValue };
