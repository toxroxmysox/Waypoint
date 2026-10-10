import { describe, it, expect } from 'vitest';
import { votePills, votePillsLabel, withMyVote, scoreVotes, sortByVoteScore, type DisplayVote } from './voting';

// #425 — tap-to-vote pills on ideas
function vote(value: DisplayVote['value'], member: string): DisplayVote {
	return { id: `v-${member}`, member, value };
}
const name = (id: string) => ({ m1: 'Sam', m2: 'Alex', me: 'Pat' })[id] ?? 'Unknown';

describe('votePills', () => {
	it('always returns all four pills in Love, Like, Flexible, Pass order, zero counts included', () => {
		const pills = votePills([], 'me', name);
		expect(pills.map((p) => p.value)).toEqual(['love', 'like', 'flexible', 'dislike']);
		expect(pills.map((p) => p.label)).toEqual(['Love', 'Like', 'Flexible', 'Pass']);
		expect(pills.every((p) => p.count === 0 && !p.mine)).toBe(true);
	});

	it('counts per sentiment and marks only my own pill', () => {
		const votes = [vote('love', 'm1'), vote('love', 'me'), vote('dislike', 'm2')];
		const pills = votePills(votes, 'me', name);
		expect(pills.map((p) => p.count)).toEqual([2, 0, 0, 1]);
		expect(pills.map((p) => p.mine)).toEqual([true, false, false, false]);
	});

	it('lists voter names per pill, with my own as "You" first', () => {
		const pills = votePills([vote('love', 'm1'), vote('love', 'me')], 'me', name);
		expect(pills[0].names).toEqual(['You', 'Sam']);
		expect(pills[1].names).toEqual([]);
	});

	it('marks nothing as mine when myMemberId is empty', () => {
		const pills = votePills([vote('love', 'm1')], '', name);
		expect(pills.some((p) => p.mine)).toBe(false);
	});
});

describe('votePillsLabel', () => {
	it('reads like "2 love, 1 pass, your vote love"', () => {
		const votes = [vote('love', 'm1'), vote('love', 'me'), vote('dislike', 'm2')];
		expect(votePillsLabel(votePills(votes, 'me', name))).toBe('2 love, 1 pass, your vote love');
	});
	it('omits "your vote" when I have not voted', () => {
		expect(votePillsLabel(votePills([vote('like', 'm1')], 'me', name))).toBe('1 like');
	});
	it('says "no votes" for an empty tally', () => {
		expect(votePillsLabel(votePills([], 'me', name))).toBe('no votes');
	});
	it('names my vote when it is a pass', () => {
		expect(votePillsLabel(votePills([vote('dislike', 'me')], 'me', name))).toBe('1 pass, your vote pass');
	});
});

describe('withMyVote (toggle / optimistic)', () => {
	it('adds my vote when I had none', () => {
		const out = withMyVote([vote('like', 'm1')], 'me', 'love');
		expect(out.map((v) => [v.member, v.value])).toEqual([
			['m1', 'like'],
			['me', 'love']
		]);
	});
	it('replaces my vote when I pick another sentiment', () => {
		const out = withMyVote([vote('love', 'me')], 'me', 'like');
		expect(out.map((v) => v.value)).toEqual(['like']);
	});
	it('clears my vote with null (tap your own pill again)', () => {
		const out = withMyVote([vote('love', 'me'), vote('like', 'm1')], 'me', null);
		expect(out.map((v) => v.member)).toEqual(['m1']);
	});
	it('does not mutate its input', () => {
		const input = [vote('love', 'me')];
		withMyVote(input, 'me', null);
		expect(input).toHaveLength(1);
	});
	it('a vote moves an idea up its group; ties keep sort order', () => {
		const items = [
			{ id: 'a', sort_order: 1 },
			{ id: 'b', sort_order: 2 }
		];
		expect(sortByVoteScore(items, {}).map((i) => i.id)).toEqual(['a', 'b']);
		const scores = { b: scoreVotes(withMyVote([], 'me', 'love')) };
		expect(sortByVoteScore(items, scores).map((i) => i.id)).toEqual(['b', 'a']);
	});
});
