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

/** Per-option vote COUNTS (every option key present, 0 when none) plus the total.
 *  For the Inbox tally (#251): an owner reviewing a queue wants the breakdown of
 *  who-felt-what, not the (still-never-numeric) weighted score. Display-only. */
export function tallyVotes<T extends Pick<DisplayVote, 'value'>>(
	votes: T[]
): { counts: Record<VoteValue, number>; total: number } {
	const counts: Record<VoteValue, number> = { love: 0, like: 0, flexible: 0, dislike: 0 };
	for (const v of votes) {
		if (counts[v.value] !== undefined) counts[v.value] += 1;
	}
	return { counts, total: votes.length };
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

// ---------------------------------------------------------------------------
// #425 — tap-to-vote pills (card system D3). Pure model behind VotePills.svelte:
// all four pills always, per-sentiment counts, my own pill marked, voter names
// for the desktop tooltip. Target-agnostic (item / suggestion votes).
// ---------------------------------------------------------------------------

/** UI label per sentiment. The id stays `dislike`; it surfaces as "Pass". */
export const VOTE_LABELS: Record<VoteValue, string> = {
	love: 'Love',
	like: 'Like',
	flexible: 'Flexible',
	dislike: 'Pass'
};

export const VOTE_GLYPHS: Record<VoteValue, string> = { love: '♥', like: '+', flexible: '~', dislike: '–' };

export interface VotePill {
	value: VoteValue;
	label: string;
	glyph: string;
	count: number;
	mine: boolean;
	/** Voter names for the tooltip; my own is "You", listed first. */
	names: string[];
}

/** The four pills for a target's votes, in display order. `nameOf` resolves a member id. */
export function votePills(
	votes: DisplayVote[],
	myMemberId: string,
	nameOf: (memberId: string) => string
): VotePill[] {
	const grouped = groupVotesByOption(votes);
	return VOTE_OPTIONS.map((value) => {
		const mine = !!myMemberId && grouped[value].some((v) => v.member === myMemberId);
		const others = grouped[value].filter((v) => v.member !== myMemberId).map((v) => nameOf(v.member));
		return {
			value,
			label: VOTE_LABELS[value],
			glyph: VOTE_GLYPHS[value],
			count: grouped[value].length,
			mine,
			names: mine ? ['You', ...others] : others
		};
	});
}

/** The pill group's accessible name: "2 love, 1 pass, your vote love". */
export function votePillsLabel(pills: VotePill[]): string {
	const parts = pills.filter((p) => p.count > 0).map((p) => `${p.count} ${p.label.toLowerCase()}`);
	const mine = pills.find((p) => p.mine);
	if (mine) parts.push(`your vote ${mine.label.toLowerCase()}`);
	return parts.length ? parts.join(', ') : 'no votes';
}

/** Votes with my vote set to `value` (null clears it). Optimistic render + toggle result. */
export function withMyVote(votes: DisplayVote[], myMemberId: string, value: VoteValue | null): DisplayVote[] {
	const rest = votes.filter((v) => v.member !== myMemberId);
	return value === null ? rest : [...rest, { id: `optimistic-${myMemberId}`, member: myMemberId, value }];
}
