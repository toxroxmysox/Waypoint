import { describe, it, expect } from 'vitest';
import {
	buildDeck,
	buildCaptureDeck,
	voteFromIntent,
	COMMIT_PX,
	type DeckCandidate,
	type DeckScope,
	type ReactionCandidate
} from './swipe-deck';

/**
 * Minimal candidate factory. `created` uses PB's fixed-width sortable format so
 * lexicographic compare == chronological.
 */
function cand(p: Partial<DeckCandidate> & { id: string }): DeckCandidate {
	return {
		phase: 'p1',
		status: 'unplanned',
		created: '2026-01-01 00:00:00.000Z',
		voteCount: 0,
		dayDate: '',
		start_time: '',
		sort_order: 0,
		...p
	};
}

const scope = (phaseId: string, phaseOrder: string[]): DeckScope => ({ phaseId, phaseOrder });

describe('buildDeck — unvoted-only filter', () => {
	it('drops items the member has already voted on', () => {
		const items = [cand({ id: 'a' }), cand({ id: 'b' }), cand({ id: 'c' })];
		const { queue } = buildDeck(items, [{ item: 'b' }], scope('p1', ['p1']));
		expect(queue.map((i) => i.id)).toEqual(['a', 'c']);
	});

	it('returns every item when the member has voted on none', () => {
		const items = [cand({ id: 'a' }), cand({ id: 'b' })];
		const { queue } = buildDeck(items, [], scope('p1', ['p1']));
		expect(queue.map((i) => i.id)).toEqual(['a', 'b']);
	});
});

describe('buildDeck — status eligibility', () => {
	it('includes planned and unplanned, excludes done and considered', () => {
		const items = [
			cand({ id: 'planned', status: 'planned' }),
			cand({ id: 'unplanned', status: 'unplanned' }),
			cand({ id: 'done', status: 'done' }),
			cand({ id: 'considered', status: 'considered' })
		];
		const { queue } = buildDeck(items, [], scope('p1', ['p1']));
		expect(queue.map((i) => i.id).sort()).toEqual(['planned', 'unplanned']);
	});
});

describe('buildDeck — phase scope', () => {
	it('only includes items in the scoped phase', () => {
		const items = [
			cand({ id: 'a', phase: 'p1' }),
			cand({ id: 'b', phase: 'p2' }),
			cand({ id: 'c', phase: 'p1' })
		];
		const { queue } = buildDeck(items, [], scope('p1', ['p1', 'p2']));
		expect(queue.map((i) => i.id)).toEqual(['a', 'c']);
	});
});

describe('buildDeck — order: planned first by itinerary, then unplanned by votes (#120)', () => {
	it('puts every planned card before every unplanned card, regardless of votes', () => {
		// Unplanned with many votes must still trail a planned card with none.
		const items = [
			cand({ id: 'u-popular', status: 'unplanned', voteCount: 9 }),
			cand({ id: 'p-quiet', status: 'planned', dayDate: '2026-05-01', voteCount: 0 })
		];
		const { queue } = buildDeck(items, [], scope('p1', ['p1']));
		expect(queue.map((i) => i.id)).toEqual(['p-quiet', 'u-popular']);
	});

	it('orders planned cards across days by date ascending', () => {
		const items = [
			cand({ id: 'd3', status: 'planned', dayDate: '2026-05-03' }),
			cand({ id: 'd1', status: 'planned', dayDate: '2026-05-01' }),
			cand({ id: 'd2', status: 'planned', dayDate: '2026-05-02' })
		];
		const { queue } = buildDeck(items, [], scope('p1', ['p1']));
		expect(queue.map((i) => i.id)).toEqual(['d1', 'd2', 'd3']);
	});

	it('orders planned cards within a day like the timeline (timed by start_time, untimed woven by sort_order)', () => {
		const items = [
			cand({ id: 'pm', status: 'planned', dayDate: '2026-05-01', start_time: '2026-05-01 15:00:00.000Z', sort_order: 5 }),
			cand({ id: 'am', status: 'planned', dayDate: '2026-05-01', start_time: '2026-05-01 09:00:00.000Z', sort_order: 5 }),
			cand({ id: 'untimed-early', status: 'planned', dayDate: '2026-05-01', start_time: '', sort_order: 1 }),
			cand({ id: 'untimed-late', status: 'planned', dayDate: '2026-05-01', start_time: '', sort_order: 99 })
		];
		const { queue } = buildDeck(items, [], scope('p1', ['p1']));
		// untimed-early (order 1) precedes the first anchor; both anchors by time; untimed-late (order 99) trails.
		expect(queue.map((i) => i.id)).toEqual(['untimed-early', 'am', 'pm', 'untimed-late']);
	});

	it('orders an all-untimed planned day by sort_order ascending', () => {
		const items = [
			cand({ id: 'c', status: 'planned', dayDate: '2026-05-01', sort_order: 3 }),
			cand({ id: 'a', status: 'planned', dayDate: '2026-05-01', sort_order: 1 }),
			cand({ id: 'b', status: 'planned', dayDate: '2026-05-01', sort_order: 2 })
		];
		const { queue } = buildDeck(items, [], scope('p1', ['p1']));
		expect(queue.map((i) => i.id)).toEqual(['a', 'b', 'c']);
	});

	it('sorts planned cards with an unset day date (PB stores "") after dated planned cards, still before unplanned', () => {
		const items = [
			cand({ id: 'p-noday', status: 'planned', dayDate: '' }),
			cand({ id: 'p-day1', status: 'planned', dayDate: '2026-05-01' }),
			cand({ id: 'u', status: 'unplanned', voteCount: 9 })
		];
		const { queue } = buildDeck(items, [], scope('p1', ['p1']));
		expect(queue.map((i) => i.id)).toEqual(['p-day1', 'p-noday', 'u']);
	});

	it('orders the unplanned tail by vote quantity descending', () => {
		const items = [
			cand({ id: 'low', status: 'unplanned', voteCount: 1 }),
			cand({ id: 'high', status: 'unplanned', voteCount: 5 }),
			cand({ id: 'mid', status: 'unplanned', voteCount: 3 })
		];
		const { queue } = buildDeck(items, [], scope('p1', ['p1']));
		expect(queue.map((i) => i.id)).toEqual(['high', 'mid', 'low']);
	});

	it('breaks unplanned vote-quantity ties by creation time, oldest first', () => {
		const items = [
			cand({ id: 'newer', status: 'unplanned', voteCount: 2, created: '2026-03-01 00:00:00.000Z' }),
			cand({ id: 'older', status: 'unplanned', voteCount: 2, created: '2026-01-01 00:00:00.000Z' }),
			cand({ id: 'middle', status: 'unplanned', voteCount: 2, created: '2026-02-01 00:00:00.000Z' })
		];
		const { queue } = buildDeck(items, [], scope('p1', ['p1']));
		expect(queue.map((i) => i.id)).toEqual(['older', 'middle', 'newer']);
	});

	it('orders zero-vote unplanned items by oldest-first', () => {
		const items = [
			cand({ id: 'b', status: 'unplanned', voteCount: 0, created: '2026-02-01 00:00:00.000Z' }),
			cand({ id: 'a', status: 'unplanned', voteCount: 0, created: '2026-01-01 00:00:00.000Z' })
		];
		const { queue } = buildDeck(items, [], scope('p1', ['p1']));
		expect(queue.map((i) => i.id)).toEqual(['a', 'b']);
	});

	it('builds a mixed deck: planned in itinerary order, then unplanned by votes', () => {
		const items = [
			cand({ id: 'u1', status: 'unplanned', voteCount: 5 }),
			cand({ id: 'p-day2', status: 'planned', dayDate: '2026-05-02', start_time: '2026-05-02 10:00:00.000Z' }),
			cand({ id: 'u2', status: 'unplanned', voteCount: 2 }),
			cand({ id: 'p-day1', status: 'planned', dayDate: '2026-05-01', sort_order: 0 })
		];
		const { queue } = buildDeck(items, [], scope('p1', ['p1']));
		expect(queue.map((i) => i.id)).toEqual(['p-day1', 'p-day2', 'u1', 'u2']);
	});

	it('does not mutate the input array', () => {
		const items = [
			cand({ id: 'u', status: 'unplanned', voteCount: 1 }),
			cand({ id: 'p', status: 'planned', dayDate: '2026-05-01' })
		];
		const before = items.map((i) => i.id);
		buildDeck(items, [], scope('p1', ['p1']));
		expect(items.map((i) => i.id)).toEqual(before);
	});
});

describe('buildDeck — drain to empty', () => {
	it('returns an empty queue when every scoped item is voted', () => {
		const items = [cand({ id: 'a' }), cand({ id: 'b' })];
		const { queue } = buildDeck(items, [{ item: 'a' }, { item: 'b' }], scope('p1', ['p1']));
		expect(queue).toEqual([]);
	});

	it('returns an empty queue when the phase has no eligible items', () => {
		const items = [cand({ id: 'a', phase: 'p2' })];
		const { queue } = buildDeck(items, [], scope('p1', ['p1', 'p2']));
		expect(queue).toEqual([]);
	});
});

describe('buildDeck — next-phase hand-off', () => {
	it('hands off to the next phase in order that has unvoted cards', () => {
		const items = [cand({ id: 'a', phase: 'p1' }), cand({ id: 'b', phase: 'p2' })];
		const { nextPhaseId } = buildDeck(items, [], scope('p1', ['p1', 'p2', 'p3']));
		expect(nextPhaseId).toBe('p2');
	});

	it('skips phases with no unvoted cards', () => {
		const items = [
			cand({ id: 'a', phase: 'p1' }),
			cand({ id: 'b', phase: 'p2' }), // already voted → p2 has nothing
			cand({ id: 'c', phase: 'p3' })
		];
		const { nextPhaseId } = buildDeck(items, [{ item: 'b' }], scope('p1', ['p1', 'p2', 'p3']));
		expect(nextPhaseId).toBe('p3');
	});

	it('skips phases whose only items are ineligible by status', () => {
		const items = [
			cand({ id: 'a', phase: 'p1' }),
			cand({ id: 'b', phase: 'p2', status: 'done' }),
			cand({ id: 'c', phase: 'p3' })
		];
		const { nextPhaseId } = buildDeck(items, [], scope('p1', ['p1', 'p2', 'p3']));
		expect(nextPhaseId).toBe('p3');
	});

	it('returns null when no later phase has unvoted cards', () => {
		const items = [cand({ id: 'a', phase: 'p1' })];
		const { nextPhaseId } = buildDeck(items, [], scope('p1', ['p1', 'p2']));
		expect(nextPhaseId).toBeNull();
	});

	it('returns null when the scoped phase is last in order', () => {
		const items = [cand({ id: 'a', phase: 'p2' })];
		const { nextPhaseId } = buildDeck(items, [], scope('p2', ['p1', 'p2']));
		expect(nextPhaseId).toBeNull();
	});

	it('never hands off to an earlier phase', () => {
		const items = [cand({ id: 'a', phase: 'p1' }), cand({ id: 'b', phase: 'p2' })];
		const { nextPhaseId } = buildDeck(items, [], scope('p2', ['p1', 'p2']));
		expect(nextPhaseId).toBeNull();
	});
});

describe('buildDeck — single card', () => {
	it('builds a one-card queue', () => {
		const items = [cand({ id: 'only' })];
		const { queue, nextPhaseId } = buildDeck(items, [], scope('p1', ['p1']));
		expect(queue.map((i) => i.id)).toEqual(['only']);
		expect(nextPhaseId).toBeNull();
	});
});

describe('buildCaptureDeck — interleave reaction/prompt 1:1', () => {
	const react = (p: Partial<ReactionCandidate> & { id: string }): ReactionCandidate => ({
		voteCount: 0,
		created: '2026-01-01 00:00:00.000Z',
		...p
	});

	it('alternates reaction/prompt starting with a reaction when both streams are equal', () => {
		const deck = buildCaptureDeck([react({ id: 'r1' }), react({ id: 'r2' })], ['p1', 'p2']);
		expect(deck).toEqual([
			{ kind: 'reaction', id: 'r1' },
			{ kind: 'prompt', id: 'p1' },
			{ kind: 'reaction', id: 'r2' },
			{ kind: 'prompt', id: 'p2' }
		]);
	});

	it('orders reaction cards by vote-qty desc then oldest-first (Resolution 8)', () => {
		const deck = buildCaptureDeck(
			[
				react({ id: 'low', voteCount: 1 }),
				react({ id: 'high', voteCount: 5 }),
				react({ id: 'tieNew', voteCount: 3, created: '2026-03-01 00:00:00.000Z' }),
				react({ id: 'tieOld', voteCount: 3, created: '2026-01-01 00:00:00.000Z' })
			],
			[]
		);
		expect(deck.map((c) => c.id)).toEqual(['high', 'tieOld', 'tieNew', 'low']);
	});

	it('degrades to all-prompts for a new trip (no reactions)', () => {
		const deck = buildCaptureDeck([], ['p1', 'p2', 'p3']);
		expect(deck).toEqual([
			{ kind: 'prompt', id: 'p1' },
			{ kind: 'prompt', id: 'p2' },
			{ kind: 'prompt', id: 'p3' }
		]);
	});

	it('degrades to all-reactions once prompts are spent', () => {
		const deck = buildCaptureDeck([react({ id: 'r1' }), react({ id: 'r2' }), react({ id: 'r3' })], []);
		expect(deck.map((c) => c.kind)).toEqual(['reaction', 'reaction', 'reaction']);
	});

	it('drains the longer stream after the shorter one empties — extra reactions trail', () => {
		const deck = buildCaptureDeck(
			[react({ id: 'r1' }), react({ id: 'r2' }), react({ id: 'r3' }), react({ id: 'r4' })],
			['p1']
		);
		expect(deck).toEqual([
			{ kind: 'reaction', id: 'r1' },
			{ kind: 'prompt', id: 'p1' },
			{ kind: 'reaction', id: 'r2' },
			{ kind: 'reaction', id: 'r3' },
			{ kind: 'reaction', id: 'r4' }
		]);
	});

	it('drains the longer stream after the shorter one empties — extra prompts trail', () => {
		const deck = buildCaptureDeck([react({ id: 'r1' })], ['p1', 'p2', 'p3']);
		expect(deck).toEqual([
			{ kind: 'reaction', id: 'r1' },
			{ kind: 'prompt', id: 'p1' },
			{ kind: 'prompt', id: 'p2' },
			{ kind: 'prompt', id: 'p3' }
		]);
	});

	it('preserves the given prompt order (caller shuffles)', () => {
		const deck = buildCaptureDeck([], ['z', 'a', 'm']);
		expect(deck.map((c) => c.id)).toEqual(['z', 'a', 'm']);
	});

	it('returns an empty deck when both streams are empty', () => {
		expect(buildCaptureDeck([], [])).toEqual([]);
	});

	it('does not mutate the input arrays', () => {
		const reactions = [react({ id: 'low', voteCount: 1 }), react({ id: 'high', voteCount: 5 })];
		const prompts = ['p1', 'p2'];
		buildCaptureDeck(reactions, prompts);
		expect(reactions.map((r) => r.id)).toEqual(['low', 'high']);
		expect(prompts).toEqual(['p1', 'p2']);
	});
});

describe('voteFromIntent — gesture map', () => {
	it('right is Like', () => {
		expect(voteFromIntent(100, 0)).toBe('like');
	});

	it('left is Pass (dislike)', () => {
		expect(voteFromIntent(-100, 0)).toBe('dislike');
	});

	it('up is Love when clearly vertical', () => {
		expect(voteFromIntent(0, -100)).toBe('love');
	});

	it('down is dead — never a vote', () => {
		expect(voteFromIntent(0, 100)).toBeNull();
		expect(voteFromIntent(10, 100)).toBeNull();
	});

	it('up wins only when |dy| > |dx| * 0.8', () => {
		// steep enough → love
		expect(voteFromIntent(50, -100)).toBe('love');
		// shallow up-right → horizontal wins (like)
		expect(voteFromIntent(100, -50)).toBe('like');
	});

	it('a mostly-horizontal drag resolves to like/dislike, not love', () => {
		expect(voteFromIntent(100, -70)).toBe('like');
		expect(voteFromIntent(-100, -70)).toBe('dislike');
	});

	it('never returns flexible (button-only)', () => {
		const samples = [
			[100, 0],
			[-100, 0],
			[0, -100],
			[0, 100],
			[60, -60]
		] as const;
		for (const [dx, dy] of samples) {
			expect(voteFromIntent(dx, dy)).not.toBe('flexible');
		}
	});

	it('exposes the ~88px commit threshold', () => {
		expect(COMMIT_PX).toBe(88);
	});
});
