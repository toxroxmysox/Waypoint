import { describe, it, expect } from 'vitest';
import {
	buildDeck,
	buildCaptureDeck,
	firstVotablePhase,
	voteFromIntent,
	commitFromRelease,
	velocityOf,
	COMMIT_PX,
	COMMIT_VELOCITY,
	VELOCITY_WINDOW_MS,
	FLICK_MIN_PX,
	type PointerSample,
	type DeckCandidate,
	type DeckScope,
	type ReactionCandidate
} from './swipe-deck';
import { orderDayItems } from '$lib/itinerary/timeline';

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
		end_time: '',
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

	// #354: DeckCandidate carried start_time but not end_time, so an end-only
	// item ("back by 6" — a deadline) resolved to no anchor here and dropped to
	// the untimed tail, while the day timeline anchored it at its end. The two
	// surfaces disagreed about the same day.
	it('anchors an end-only planned card at its end_time, not in the untimed tail', () => {
		const items = [
			cand({ id: 'pm', status: 'planned', dayDate: '2026-05-01', start_time: '2026-05-01 15:00:00.000Z', sort_order: 5 }),
			cand({ id: 'am', status: 'planned', dayDate: '2026-05-01', start_time: '2026-05-01 09:00:00.000Z', sort_order: 5 }),
			// No start — a deadline at noon. Belongs between am and pm.
			cand({ id: 'deadline-noon', status: 'planned', dayDate: '2026-05-01', end_time: '2026-05-01 12:00:00.000Z', sort_order: 99 }),
			cand({ id: 'untimed', status: 'planned', dayDate: '2026-05-01', sort_order: 99 })
		];
		const { queue } = buildDeck(items, [], scope('p1', ['p1']));
		expect(queue.map((i) => i.id)).toEqual(['am', 'deadline-noon', 'pm', 'untimed']);
	});

	it('orders two end-only planned cards by their end times', () => {
		const items = [
			cand({ id: 'late', status: 'planned', dayDate: '2026-05-01', end_time: '2026-05-01 18:00:00.000Z', sort_order: 1 }),
			cand({ id: 'early', status: 'planned', dayDate: '2026-05-01', end_time: '2026-05-01 08:00:00.000Z', sort_order: 2 })
		];
		const { queue } = buildDeck(items, [], scope('p1', ['p1']));
		// end_time wins over sort_order — both are anchored, so neither is woven.
		expect(queue.map((i) => i.id)).toEqual(['early', 'late']);
	});

	it('a start_time item still anchors at its start even when it also has an end_time', () => {
		const items = [
			cand({ id: 'spans-morning', status: 'planned', dayDate: '2026-05-01', start_time: '2026-05-01 09:00:00.000Z', end_time: '2026-05-01 17:00:00.000Z' }),
			cand({ id: 'deadline-ten', status: 'planned', dayDate: '2026-05-01', end_time: '2026-05-01 10:00:00.000Z' })
		];
		const { queue } = buildDeck(items, [], scope('p1', ['p1']));
		expect(queue.map((i) => i.id)).toEqual(['spans-morning', 'deadline-ten']);
	});

	// The point of sharing orderDayItems (#120) is that the deck and the day
	// timeline present a day identically. Assert that directly rather than
	// restating the expected order twice.
	it('matches orderDayItems for a day mixing start-only, end-only, both, and untimed', () => {
		const day = [
			cand({ id: 'both', status: 'planned', dayDate: '2026-05-01', start_time: '2026-05-01 13:00:00.000Z', end_time: '2026-05-01 20:00:00.000Z', sort_order: 4 }),
			cand({ id: 'end-only', status: 'planned', dayDate: '2026-05-01', end_time: '2026-05-01 11:00:00.000Z', sort_order: 3 }),
			cand({ id: 'start-only', status: 'planned', dayDate: '2026-05-01', start_time: '2026-05-01 07:00:00.000Z', sort_order: 2 }),
			cand({ id: 'untimed', status: 'planned', dayDate: '2026-05-01', sort_order: 1 })
		];
		const { queue } = buildDeck(day, [], scope('p1', ['p1']));
		expect(queue.map((i) => i.id)).toEqual(orderDayItems(day).map((i) => i.id));
		// ...and that shared order is the timeline's: untimed (order 1) precedes
		// the first anchor, then 07:00, the 11:00 deadline, the 13:00 start.
		expect(queue.map((i) => i.id)).toEqual(['untimed', 'start-only', 'end-only', 'both']);
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

// ── #376: flick velocity ──────────────────────────────────────────────────

/**
 * Build a sample track from `[x, y, t]` triples. The LAST entry stands for the
 * release sample the component pushes on pointerup — see `velocityOf`'s note on
 * why a release sample is mandatory.
 */
function track(points: readonly (readonly [number, number, number])[]): PointerSample[] {
	return points.map(([x, y, t]) => ({ x, y, t }));
}

describe('velocityOf — trailing-window pointer velocity (#376)', () => {
	it('is still with fewer than two samples', () => {
		expect(velocityOf([]).speed).toBe(0);
		expect(velocityOf(track([[0, 0, 0]])).speed).toBe(0);
	});

	it('is still when the window collapses to a single instant', () => {
		expect(
			velocityOf(
				track([
					[0, 0, 5],
					[40, 0, 5]
				])
			).speed
		).toBe(0);
	});

	it('measures px/ms over the trailing window', () => {
		const v = velocityOf(
			track([
				[0, 0, 0],
				[30, 0, 20],
				[60, 0, 40]
			])
		);
		expect(v.vx).toBeCloseTo(1.5);
		expect(v.vy).toBe(0);
		expect(v.speed).toBeCloseTo(1.5);
	});

	it('ignores samples older than the window — the slow lead-in of a drag-then-flick', () => {
		// 300ms of crawling, then a 60px throw in the last 40ms.
		const v = velocityOf(
			track([
				[0, 0, 0],
				[10, 0, 300],
				[20, 0, 600],
				[80, 0, 640]
			])
		);
		expect(v.speed).toBeCloseTo(60 / 40);
	});

	it('reports still for a burst that decayed into a hold before release', () => {
		// The release sample is what ages the burst out of the window.
		const v = velocityOf(
			track([
				[0, 0, 0],
				[30, 0, 10],
				[60, 0, 20],
				[60, 0, 400]
			])
		);
		expect(v.speed).toBe(0);
	});
});

describe('commitFromRelease — distance OR flick (#376)', () => {
	/** A leisurely drag: one sample every 200ms, so velocity is ~0 at release. */
	function slowTo(dx: number, dy: number): PointerSample[] {
		return track([
			[0, 0, 0],
			[dx / 2, dy / 2, 200],
			[dx, dy, 400],
			[dx, dy, 410]
		]);
	}

	it('still commits on distance alone, exactly as before', () => {
		expect(commitFromRelease(100, 0, slowTo(100, 0))).toBe('like');
		expect(commitFromRelease(-100, 0, slowTo(-100, 0))).toBe('dislike');
		expect(commitFromRelease(0, -100, slowTo(0, -100))).toBe('love');
	});

	it('a slow 60px drag still springs back — no vote', () => {
		expect(commitFromRelease(60, 0, slowTo(60, 0))).toBeNull();
	});

	it('a fast 60px flick commits (the #376 bug)', () => {
		const samples = track([
			[0, 0, 0],
			[20, 0, 10],
			[40, 0, 20],
			[60, 0, 30],
			[60, 0, 32]
		]);
		expect(commitFromRelease(60, 0, samples)).toBe('like');
	});

	it('a fast start that decays into a hold does NOT commit', () => {
		const samples = track([
			[0, 0, 0],
			[30, 0, 10],
			[60, 0, 20],
			[60, 0, 400] // release, long after the burst
		]);
		expect(commitFromRelease(60, 0, samples)).toBeNull();
	});

	it('a slow drag that ends in a flick commits', () => {
		const samples = track([
			[0, 0, 0],
			[10, 0, 300],
			[20, 0, 600],
			[80, 0, 640],
			[80, 0, 645]
		]);
		expect(commitFromRelease(80, 0, samples)).toBe('like');
	});

	it('flicks in the flick direction, not the accumulated drag direction', () => {
		// Dragged left, changed mind, threw right. The release vector is +30px.
		const samples = track([
			[0, 0, 0],
			[-40, 0, 300],
			[0, 0, 620],
			[30, 0, 640],
			[30, 0, 645]
		]);
		expect(commitFromRelease(30, 0, samples)).toBe('like');
	});

	it('applies the same axis dominance to a diagonal flick as to a drag', () => {
		// Up-left-ish throw, 78px total: |dy| clears |dx| * 0.8 → love, same as
		// voteFromIntent would say for a long drag of that shape.
		const samples = track([
			[0, 0, 0],
			[25, -30, 15],
			[50, -60, 30],
			[50, -60, 33]
		]);
		expect(commitFromRelease(50, -60, samples)).toBe(voteFromIntent(50, -60));
		expect(commitFromRelease(50, -60, samples)).toBe('love');
	});

	it('keeps south dead — a fast downward flick is not a vote', () => {
		const samples = track([
			[0, 0, 0],
			[0, 30, 10],
			[0, 60, 20],
			[0, 60, 25]
		]);
		expect(commitFromRelease(0, 60, samples)).toBeNull();
	});

	it('ignores a fast jitter shorter than the flick floor (tap protection)', () => {
		// 5px in 7ms clears COMMIT_VELOCITY, but it is a tap, not a throw.
		const samples = track([
			[0, 0, 0],
			[5, 0, 5],
			[5, 0, 7]
		]);
		expect(velocityOf(samples).speed).toBeGreaterThan(COMMIT_VELOCITY);
		expect(commitFromRelease(5, 0, samples)).toBeNull();
	});

	it('commits nothing on a release with no movement at all', () => {
		expect(commitFromRelease(0, 0, track([[0, 0, 0]]))).toBeNull();
	});

	it('pins the flick thresholds', () => {
		expect(COMMIT_VELOCITY).toBe(0.6);
		expect(VELOCITY_WINDOW_MS).toBe(80);
		expect(FLICK_MIN_PX).toBe(24);
	});
});

describe('firstVotablePhase — adaptive onboarding CTA detection (#275)', () => {
	// Narrowed candidate: only id/phase/status matter to this helper.
	type V = Parameters<typeof firstVotablePhase>[0][number];
	const it_ = (id: string, phase: string, status: V['status'] = 'unplanned'): V => ({
		id,
		phase,
		status
	});

	it('returns null phaseId + 0 total when there are no items', () => {
		expect(firstVotablePhase([], [], ['p1', 'p2'])).toEqual({ phaseId: null, unratedTotal: 0 });
	});

	it('flags votable content + the first phase (in order) with an unrated card', () => {
		const items = [it_('a', 'p2'), it_('b', 'p1'), it_('c', 'p2')];
		const r = firstVotablePhase(items, [], ['p1', 'p2']);
		expect(r.unratedTotal).toBe(3);
		expect(r.phaseId).toBe('p1'); // first in phaseOrder with a card, not first item
	});

	it('skips phases the member has fully rated → lands on the next with cards', () => {
		const items = [it_('a', 'p1'), it_('b', 'p2')];
		const r = firstVotablePhase(items, [{ item: 'a' }], ['p1', 'p2']);
		expect(r.unratedTotal).toBe(1);
		expect(r.phaseId).toBe('p2');
	});

	it('returns null phaseId once the member has voted on everything', () => {
		const items = [it_('a', 'p1'), it_('b', 'p2')];
		const r = firstVotablePhase(items, [{ item: 'a' }, { item: 'b' }], ['p1', 'p2']);
		expect(r).toEqual({ phaseId: null, unratedTotal: 0 });
	});

	it('ignores done/considered items (closeout-only, never votable)', () => {
		const items = [it_('a', 'p1', 'done'), it_('b', 'p1', 'considered')];
		expect(firstVotablePhase(items, [], ['p1'])).toEqual({ phaseId: null, unratedTotal: 0 });
	});

	it('counts both planned and unplanned as votable', () => {
		const items = [it_('a', 'p1', 'planned'), it_('b', 'p1', 'unplanned')];
		const r = firstVotablePhase(items, [], ['p1']);
		expect(r.unratedTotal).toBe(2);
		expect(r.phaseId).toBe('p1');
	});

	it('returns null when an unrated card sits in a phase absent from phaseOrder', () => {
		// A card whose phase is not in the order has no launch point — treated as
		// non-votable (mirrors the deck launcher, which only enters known phases).
		const items = [it_('a', 'ghost')];
		const r = firstVotablePhase(items, [], ['p1', 'p2']);
		expect(r.unratedTotal).toBe(1); // it IS unrated...
		expect(r.phaseId).toBe(null); // ...but there's nowhere to launch
	});
});
