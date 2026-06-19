import { describe, it, expect } from 'vitest';
import { parkingLotCards, type Card, type CardVote } from './parking-lot-cards';
import type { Item } from './types';
import type { MemberRole, Suggestion, VoteValue } from '../collaboration/types';

// --- builders ---------------------------------------------------------------

function makeItem(over: Partial<Item> = {}): Item {
	// Only the fields the module reads (id, sort_order, status) plus a few for
	// rendering context. Cast covers the RecordModel/Item fields it never touches.
	return {
		id: 'i1',
		trip: 't1',
		phase: 'p1',
		day: '',
		type: 'activity',
		title: 'Item',
		status: 'unplanned',
		sort_order: 0,
		...over
	} as Item;
}

function makeSuggestion(over: Partial<Suggestion> = {}): Suggestion {
	return {
		id: 's1',
		trip: 't1',
		author_id: 'm-author',
		author_name: 'Author',
		author_role: 'traveler',
		target_type: 'new_item',
		payload: { phase: 'p1', title: 'Ghost idea' },
		status: 'pending',
		reviewed_at: '',
		created: '2026-06-01T00:00:00Z',
		...over
	} as Suggestion;
}

function votes(...values: VoteValue[]): CardVote[] {
	return values.map((value, i) => ({ id: `v${i}`, value, member: `m${i}` }));
}

const ROLES: MemberRole[] = ['owner', 'co_owner', 'traveler', 'viewer'];

// --- merge of real items + ghosts -------------------------------------------

describe('parkingLotCards — merge', () => {
	it('merges unplanned items and pending ghosts into one tagged list', () => {
		const items = [makeItem({ id: 'i1' }), makeItem({ id: 'i2' })];
		const suggestions = [makeSuggestion({ id: 's1' }), makeSuggestion({ id: 's2' })];

		const cards = parkingLotCards(items, suggestions, { phaseId: 'p1', viewerRole: 'owner' });

		expect(cards).toHaveLength(4);
		expect(cards.filter((c) => c.kind === 'item').map((c) => c.id).sort()).toEqual(['i1', 'i2']);
		expect(cards.filter((c) => c.kind === 'ghost').map((c) => c.id).sort()).toEqual(['s1', 's2']);
	});

	it('tags each card kind item|ghost and exposes its source row', () => {
		const item = makeItem({ id: 'i1', title: 'Real' });
		const suggestion = makeSuggestion({ id: 's1', payload: { phase: 'p1', title: 'Pending' } });

		const cards = parkingLotCards([item], [suggestion], { phaseId: 'p1', viewerRole: 'owner' });
		const itemCard = cards.find((c) => c.id === 'i1') as Extract<Card, { kind: 'item' }>;
		const ghostCard = cards.find((c) => c.id === 's1') as Extract<Card, { kind: 'ghost' }>;

		expect(itemCard.kind).toBe('item');
		expect(itemCard.item.title).toBe('Real');
		expect(ghostCard.kind).toBe('ghost');
		expect(ghostCard.suggestion.payload?.title).toBe('Pending');
	});

	it('returns an empty list when there are no items and no ghosts', () => {
		expect(parkingLotCards([], [], { phaseId: 'p1', viewerRole: 'owner' })).toEqual([]);
	});
});

// --- phase scoping ----------------------------------------------------------

describe('parkingLotCards — phase scoping', () => {
	it('drops ghosts whose payload.phase is a different phase', () => {
		const suggestions = [
			makeSuggestion({ id: 's-here', payload: { phase: 'p1', title: 'A' } }),
			makeSuggestion({ id: 's-there', payload: { phase: 'p2', title: 'B' } })
		];

		const cards = parkingLotCards([], suggestions, { phaseId: 'p1', viewerRole: 'owner' });

		expect(cards.map((c) => c.id)).toEqual(['s-here']);
	});

	it('drops ghosts whose payload has no phase', () => {
		const suggestions = [
			makeSuggestion({ id: 's-phaseless', payload: { title: 'No phase' } }),
			makeSuggestion({ id: 's-null', payload: null })
		];

		const cards = parkingLotCards([], suggestions, { phaseId: 'p1', viewerRole: 'owner' });

		expect(cards).toEqual([]);
	});

	it('does not phase-filter items (the caller already scopes the item query)', () => {
		// An item carrying a different phase is still rendered — items are fetched
		// per-phase upstream; the module trusts that scoping and never re-filters.
		const items = [makeItem({ id: 'i-other', phase: 'p2' })];

		const cards = parkingLotCards(items, [], { phaseId: 'p1', viewerRole: 'owner' });

		expect(cards.map((c) => c.id)).toEqual(['i-other']);
	});
});

// --- only pending suggestions ghost -----------------------------------------

describe('parkingLotCards — only pending ghosts', () => {
	it('ignores approved and rejected suggestions', () => {
		const suggestions = [
			makeSuggestion({ id: 's-pending', status: 'pending' }),
			makeSuggestion({ id: 's-approved', status: 'approved' }),
			makeSuggestion({ id: 's-rejected', status: 'rejected' })
		];

		const cards = parkingLotCards([], suggestions, { phaseId: 'p1', viewerRole: 'owner' });

		expect(cards.map((c) => c.id)).toEqual(['s-pending']);
	});
});

// --- vote-stack attachment --------------------------------------------------

describe('parkingLotCards — vote-stack attachment', () => {
	it('attaches item votes from votesByItem and ghost votes from votesBySuggestion', () => {
		const item = makeItem({ id: 'i1' });
		const suggestion = makeSuggestion({ id: 's1' });

		const cards = parkingLotCards([item], [suggestion], {
			phaseId: 'p1',
			viewerRole: 'owner',
			votesByItem: { i1: votes('love', 'like') },
			votesBySuggestion: { s1: votes('dislike') }
		});

		const itemCard = cards.find((c) => c.id === 'i1')!;
		const ghostCard = cards.find((c) => c.id === 's1')!;
		expect(itemCard.votes.map((v) => v.value)).toEqual(['love', 'like']);
		expect(ghostCard.votes.map((v) => v.value)).toEqual(['dislike']);
	});

	it('defaults to an empty vote stack when none are supplied', () => {
		const cards = parkingLotCards([makeItem({ id: 'i1' })], [makeSuggestion({ id: 's1' })], {
			phaseId: 'p1',
			viewerRole: 'owner'
		});
		expect(cards.every((c) => Array.isArray(c.votes) && c.votes.length === 0)).toBe(true);
	});
});

// --- sort (reuses the vote-score parking-lot order) -------------------------

describe('parkingLotCards — sort', () => {
	it('orders by aggregate vote score descending, across items AND ghosts', () => {
		const items = [makeItem({ id: 'i-lo', sort_order: 0 }), makeItem({ id: 'i-mid', sort_order: 1 })];
		const suggestions = [makeSuggestion({ id: 's-hi' })];

		const cards = parkingLotCards(items, suggestions, {
			phaseId: 'p1',
			viewerRole: 'owner',
			votesByItem: { 'i-lo': votes('dislike'), 'i-mid': votes('like') }, // -2, +1
			votesBySuggestion: { 's-hi': votes('love', 'love') } // +4
		});

		// A well-loved GHOST outranks both items — score is the primary signal.
		expect(cards.map((c) => c.id)).toEqual(['s-hi', 'i-mid', 'i-lo']);
	});

	it('breaks score ties by sort_order, putting equal-score items ahead of ghosts', () => {
		// All zero score → tiebreak only. Items keep their drag order; ghosts trail.
		const items = [makeItem({ id: 'i-b', sort_order: 20 }), makeItem({ id: 'i-a', sort_order: 10 })];
		const suggestions = [makeSuggestion({ id: 's1' })];

		const cards = parkingLotCards(items, suggestions, { phaseId: 'p1', viewerRole: 'owner' });

		expect(cards.map((c) => c.id)).toEqual(['i-a', 'i-b', 's1']);
	});

	it('orders equal-score ghosts oldest-first', () => {
		const suggestions = [
			makeSuggestion({ id: 's-new', created: '2026-06-03T00:00:00Z' }),
			makeSuggestion({ id: 's-old', created: '2026-06-01T00:00:00Z' }),
			makeSuggestion({ id: 's-mid', created: '2026-06-02T00:00:00Z' })
		];

		const cards = parkingLotCards([], suggestions, { phaseId: 'p1', viewerRole: 'owner' });

		expect(cards.map((c) => c.id)).toEqual(['s-old', 's-mid', 's-new']);
	});
});

// --- all-members audience ---------------------------------------------------

describe('parkingLotCards — audience (all members see ghosts)', () => {
	it('returns the same ghost list for every role, including viewer', () => {
		const items = [makeItem({ id: 'i1' })];
		const suggestions = [makeSuggestion({ id: 's1' })];

		const perRole = ROLES.map((viewerRole) =>
			parkingLotCards(items, suggestions, { phaseId: 'p1', viewerRole }).map((c) => `${c.kind}:${c.id}`)
		);

		// Every role sees the identical merged list — read-only-but-can-see. The
		// dotted/"pending" + voting affordance live in rendering, not the data.
		for (const list of perRole) expect(list).toEqual(perRole[0]);
		expect(perRole[0]).toContain('ghost:s1');
	});
});

// --- purity -----------------------------------------------------------------

describe('parkingLotCards — purity', () => {
	it('does not mutate the input arrays', () => {
		const items = [makeItem({ id: 'i2', sort_order: 5 }), makeItem({ id: 'i1', sort_order: 1 })];
		const suggestions = [
			makeSuggestion({ id: 's2', created: '2026-06-02T00:00:00Z' }),
			makeSuggestion({ id: 's1', created: '2026-06-01T00:00:00Z' })
		];
		const itemsCopy = [...items];
		const suggestionsCopy = [...suggestions];

		parkingLotCards(items, suggestions, { phaseId: 'p1', viewerRole: 'owner' });

		expect(items).toEqual(itemsCopy);
		expect(suggestions).toEqual(suggestionsCopy);
	});
});
