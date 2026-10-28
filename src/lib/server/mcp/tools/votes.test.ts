import { describe, it, expect } from 'vitest';
import { votedCard } from './votes';

const base = { emoji: '🎯', title: 'See the aurora', tag: 'planned', lines: ['Up north'] };
const me = 'mem_me';

describe('votedCard (#567: the caller sees their own vote id, so a change is an update)', () => {
	it('a vote by the caller: your_vote {id, value}, and the id in the text', () => {
		const { card, ref } = votedCard(base, 'goal_1', me, [
			{ id: 'v_mine', member: me, value: 'love' },
			{ id: 'v_other', member: 'mem_ana', value: 'like' }
		]);
		expect(ref).toEqual({ id: 'goal_1', your_vote: { id: 'v_mine', value: 'love' } });
		expect(card.lines).toEqual([
			'Up north',
			'id: goal_1',
			'2 votes: 1 love, 1 like',
			'Your vote: love (vote id v_mine)'
		]);
		expect(card.tag).toBe('planned');
	});
	it("a vote by someone else: the tally, but no your_vote and no other member's vote id", () => {
		const { card, ref } = votedCard(base, 'goal_1', me, [
			{ id: 'v_other', member: 'mem_ana', value: 'dislike' }
		]);
		expect(ref).toEqual({ id: 'goal_1' });
		expect(card.lines).toEqual(['Up north', 'id: goal_1', '1 vote: 1 dislike']);
		expect(card.lines.join(' ')).not.toContain('v_other');
	});
	it('no vote: says so', () => {
		const { card, ref } = votedCard(base, 'goal_1', me, []);
		expect(ref).toEqual({ id: 'goal_1' });
		expect(card.lines).toEqual(['Up north', 'id: goal_1', 'no votes']);
	});
});
