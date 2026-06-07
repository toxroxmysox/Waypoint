import { describe, it, expect } from 'vitest';
import {
	VOTE_WEIGHTS,
	VOTE_OPTIONS,
	scoreVotes,
	groupVotesByOption,
	sortByVoteScore
} from './voting';
import type { Vote } from './types';

function vote(value: Vote['value'], member = 'm1', item = 'i1'): Vote {
	return { id: `v-${member}-${item}`, trip: 't1', item, member, value, created: '' };
}

describe('VOTE_WEIGHTS', () => {
	it('maps each option name to its weight', () => {
		expect(VOTE_WEIGHTS).toEqual({ love: 2, like: 1, flexible: 0, dislike: -2 });
	});

	it('lists options in display order, strongest first', () => {
		expect(VOTE_OPTIONS).toEqual(['love', 'like', 'flexible', 'dislike']);
	});
});

describe('scoreVotes', () => {
	it('returns 0 for no votes', () => {
		expect(scoreVotes([])).toBe(0);
	});

	it('sums weights across votes', () => {
		// love(2) + like(1) + flexible(0) + dislike(-2) = 1
		expect(scoreVotes([vote('love'), vote('like'), vote('flexible'), vote('dislike')])).toBe(1);
	});

	it('goes negative when dislikes dominate', () => {
		expect(scoreVotes([vote('dislike'), vote('dislike'), vote('like')])).toBe(-3);
	});
});

describe('groupVotesByOption', () => {
	it('buckets votes by option, every option present even when empty', () => {
		const grouped = groupVotesByOption([vote('love', 'a'), vote('love', 'b'), vote('dislike', 'c')]);
		expect(grouped.love.map((v) => v.member)).toEqual(['a', 'b']);
		expect(grouped.like).toEqual([]);
		expect(grouped.flexible).toEqual([]);
		expect(grouped.dislike.map((v) => v.member)).toEqual(['c']);
	});
});

describe('sortByVoteScore', () => {
	const items = [
		{ id: 'a', sort_order: 20 },
		{ id: 'b', sort_order: 10 },
		{ id: 'c', sort_order: 30 }
	];

	it('orders by aggregate score descending', () => {
		const scores = { a: -1, b: 3, c: 1 };
		expect(sortByVoteScore(items, scores).map((i) => i.id)).toEqual(['b', 'c', 'a']);
	});

	it('breaks ties by sort_order ascending', () => {
		const scores = { a: 0, b: 0, c: 0 };
		expect(sortByVoteScore(items, scores).map((i) => i.id)).toEqual(['b', 'a', 'c']);
	});

	it('treats a missing score as 0', () => {
		const scores = { b: 1 }; // a, c default to 0
		expect(sortByVoteScore(items, scores).map((i) => i.id)).toEqual(['b', 'a', 'c']);
	});

	it('does not mutate the input array', () => {
		const scores = { a: 5 };
		const copy = [...items];
		sortByVoteScore(items, scores);
		expect(items).toEqual(copy);
	});
});
