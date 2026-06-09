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

/** Order: vote-quantity desc, then creation oldest-first. Pure (no mutation). */
function orderCards(items: DeckCandidate[]): DeckCandidate[] {
	return [...items].sort((a, b) => {
		if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
		return a.created < b.created ? -1 : a.created > b.created ? 1 : 0;
	});
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
