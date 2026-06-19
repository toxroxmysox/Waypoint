import type { Vote, VoteValue } from './types';

export type { VoteValue };

// Target-agnostic vote shape (ADR-0004/0009): item `Vote`, `GoalVote`, and
// `SuggestionVote` all satisfy it. Scoring + avatar-stack display operate on this
// alone, so the same logic serves every votable target without branching.
export interface DisplayVote {
	id: string;
	member: string;
	value: VoteValue;
}

/** Display order — strongest preference first. */
export const VOTE_OPTIONS: VoteValue[] = ['love', 'like', 'flexible', 'dislike'];

export const VOTE_WEIGHTS: Record<VoteValue, number> = {
	love: 2,
	like: 1,
	flexible: 0,
	dislike: -2
};

/** Aggregate weighted score for a target's votes. Never shown numerically — drives sort only. */
export function scoreVotes(votes: Pick<Vote, 'value'>[]): number {
	return votes.reduce((sum, v) => sum + (VOTE_WEIGHTS[v.value] ?? 0), 0);
}

/** Bucket votes by option for avatar-stack display. Every option key is always
 *  present. Generic over the concrete vote type so item/goal/suggestion votes all
 *  flow through unchanged (preserves the input element type). */
export function groupVotesByOption<T extends Pick<DisplayVote, 'value'>>(
	votes: T[]
): Record<VoteValue, T[]> {
	const grouped: Record<VoteValue, T[]> = { love: [], like: [], flexible: [], dislike: [] };
	for (const v of votes) {
		if (grouped[v.value]) grouped[v.value].push(v);
	}
	return grouped;
}

/**
 * Sort items by aggregate weighted score (desc), breaking ties by `sort_order` (asc).
 * A missing score is treated as 0. Returns a new array; the input is not mutated.
 */
export function sortByVoteScore<T extends { id: string; sort_order: number }>(
	items: T[],
	scoreByItem: Record<string, number>
): T[] {
	return [...items].sort((a, b) => {
		const diff = (scoreByItem[b.id] ?? 0) - (scoreByItem[a.id] ?? 0);
		return diff !== 0 ? diff : a.sort_order - b.sort_order;
	});
}
