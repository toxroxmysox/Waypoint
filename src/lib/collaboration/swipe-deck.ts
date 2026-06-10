import type { ItemStatus } from '$lib/itinerary/types';
import type { VoteValue } from './types';

/** px a drag must travel past to commit a vote (else it springs back). */
export const COMMIT_PX = 88;

/** Up-bias: a vote reads as Love (up) only when |dy| clears this fraction of |dx|. */
const UP_BIAS = 0.8;

/**
 * Map a drag vector to a directional vote, or null for no commit.
 * up = Love, right = Like, left = Pass (dislike); down is intentionally dead
 * (rubber-bands, never votes). Flexible is button-only and never returned here.
 */
export function voteFromIntent(dx: number, dy: number): Exclude<VoteValue, 'flexible'> | null {
	if (Math.abs(dy) > Math.abs(dx) * UP_BIAS) {
		return dy < 0 ? 'love' : null; // south = dead
	}
	return dx >= 0 ? 'like' : 'dislike';
}

/**
 * The pure deck builder behind the Swipe-Quiz harvest (and the shared SwipeDeck
 * substrate). No UI, no IO — see `swipe-deck.test.ts`.
 *
 * Resolution 8: order = vote-quantity desc (count of *all* members' votes, not
 * weighted score), ties + zero-vote by creation time oldest-first.
 * Eligibility: in-scope phase, status planned|unplanned (done/considered are
 * closeout-only), not already voted by the current member.
 */

/** Statuses a card can carry. done/considered only exist post-trip (closeout). */
const ELIGIBLE_STATUSES: ReadonlySet<ItemStatus> = new Set<ItemStatus>(['planned', 'unplanned']);

/**
 * A trip item, narrowed to what the deck needs, decorated by the loader with the
 * all-members vote count. `created` is PB's fixed-width sortable string.
 */
export interface DeckCandidate {
	id: string;
	phase: string;
	status: ItemStatus;
	created: string;
	/** Count of every member's votes on this item (not the weighted score). */
	voteCount: number;
}

/** Phase-scoped only in v4; `phaseOrder` drives the next-phase hand-off. */
export interface DeckScope {
	phaseId: string;
	phaseOrder: string[];
}

export interface BuiltDeck {
	queue: DeckCandidate[];
	/** Next phase in order that still has unvoted cards, or null. */
	nextPhaseId: string | null;
}

function isEligible(item: DeckCandidate, votedItemIds: Set<string>): boolean {
	return ELIGIBLE_STATUSES.has(item.status) && !votedItemIds.has(item.id);
}

/**
 * Resolution-8 comparator: vote-quantity desc, ties + zero-vote by creation
 * oldest-first. Shared by the harvest deck and the capture deck's reaction lane.
 */
function byVoteQtyThenOldest(a: { voteCount: number; created: string }, b: { voteCount: number; created: string }): number {
	if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
	return a.created < b.created ? -1 : a.created > b.created ? 1 : 0;
}

/** Order: vote-quantity desc, then creation oldest-first. Pure (no mutation). */
function orderCards(items: DeckCandidate[]): DeckCandidate[] {
	return [...items].sort(byVoteQtyThenOldest);
}

export function buildDeck(
	items: DeckCandidate[],
	myVotes: { item: string }[],
	scope: DeckScope
): BuiltDeck {
	const votedItemIds = new Set(myVotes.map((v) => v.item));

	const queue = orderCards(
		items.filter((i) => i.phase === scope.phaseId && isEligible(i, votedItemIds))
	);

	// Hand off to the next phase *in order* that still has at least one unvoted card.
	const fromIndex = scope.phaseOrder.indexOf(scope.phaseId);
	let nextPhaseId: string | null = null;
	if (fromIndex !== -1) {
		for (const phaseId of scope.phaseOrder.slice(fromIndex + 1)) {
			const hasCards = items.some((i) => i.phase === phaseId && isEligible(i, votedItemIds));
			if (hasCards) {
				nextPhaseId = phaseId;
				break;
			}
		}
	}

	return { queue, nextPhaseId };
}

// ── Capture deck (goal wizard) ─────────────────────────────────────────────
//
// The capture wizard runs on the same SwipeDeck substrate but interleaves two
// card kinds: REACTION cards (vote on others' goals → goal_votes) and PROMPT
// cards (type 0..n goals → trip_goals). Resolution 8: cards alternate 1:1
// reaction/prompt, degrading to all-prompts (a new trip's first member, no
// reactions) or all-reactions (prompts spent). Deterministic given inputs →
// unit-testable, exactly like buildDeck.

/**
 * A goal eligible to react to: one the member hasn't voted on and didn't create
 * (eligibility filtered by the loader). `voteCount` is all-members; `created` is
 * PB's fixed-width sortable string. Ordered here by Resolution 8.
 */
export interface ReactionCandidate {
	id: string;
	voteCount: number;
	created: string;
}

/** A built card: a reaction (goal id) or a prompt (prompt id). */
export type CaptureCard = { kind: 'reaction'; id: string } | { kind: 'prompt'; id: string };

/**
 * Interleave reaction + prompt cards 1:1, starting with a reaction. When one
 * stream empties the other drains continuously (→ all-prompts / all-reactions).
 * Reactions are ordered by Resolution 8; prompts keep the caller's order (the
 * caller shuffles + does once-per-session dedup). Pure, no mutation.
 */
export function buildCaptureDeck(reactions: ReactionCandidate[], promptIds: string[]): CaptureCard[] {
	const ordered = [...reactions].sort(byVoteQtyThenOldest);
	const deck: CaptureCard[] = [];
	let ri = 0;
	let pi = 0;
	let wantReaction = true; // alternation starts on a reaction
	while (ri < ordered.length || pi < promptIds.length) {
		if (wantReaction && ri < ordered.length) {
			deck.push({ kind: 'reaction', id: ordered[ri++].id });
		} else if (!wantReaction && pi < promptIds.length) {
			deck.push({ kind: 'prompt', id: promptIds[pi++] });
		} else if (ri < ordered.length) {
			// prompt stream spent → drain reactions
			deck.push({ kind: 'reaction', id: ordered[ri++].id });
		} else {
			// reaction stream spent → drain prompts
			deck.push({ kind: 'prompt', id: promptIds[pi++] });
		}
		wantReaction = !wantReaction;
	}
	return deck;
}
