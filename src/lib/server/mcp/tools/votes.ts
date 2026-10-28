// #567 — goal, scenario and suggestion votes in get_trip: the record id, the
// tally, and the caller's own vote id, so a change of mind is an update to that
// vote (as get_item does for item votes, #520), never a second vote.
import type { VoteValue } from '$lib/types';
import { tallyVotes } from '$lib/collaboration/voting';
import type { Card } from '../present';

export interface VoteRow {
	id: string;
	member: string;
	value: VoteValue;
}

export interface VotedRef {
	id: string;
	your_vote?: { id: string; value: VoteValue };
}

/** "2 votes: 1 love, 1 like", or "no votes". */
export function tallyLine(votes: Pick<VoteRow, 'value'>[]): string {
	const { counts, total } = tallyVotes(votes);
	if (!total) return 'no votes';
	const breakdown = Object.entries(counts)
		.filter(([, n]) => n)
		.map(([k, n]) => `${n} ${k}`)
		.join(', ');
	return `${total} vote${total === 1 ? '' : 's'}: ${breakdown}`;
}

/** A card plus its id, tally and the caller's vote; only the caller's vote id is shown. */
export function votedCard(
	card: Card,
	id: string,
	memberId: string,
	votes: VoteRow[]
): { card: Card; ref: VotedRef } {
	const mine = votes.find((v) => v.member === memberId);
	return {
		card: {
			...card,
			lines: [
				...card.lines,
				`id: ${id}`,
				tallyLine(votes),
				...(mine ? [`Your vote: ${mine.value} (vote id ${mine.id})`] : [])
			]
		},
		ref: { id, ...(mine ? { your_vote: { id: mine.id, value: mine.value } } : {}) }
	};
}

/** Votes bucketed by the record they are on. */
export function bucket<V extends VoteRow>(votes: V[], key: (v: V) => string): Map<string, V[]> {
	const by = new Map<string, V[]>();
	for (const v of votes) by.set(key(v), [...(by.get(key(v)) ?? []), v]);
	return by;
}
