import { describe, it, expect } from 'vitest';
import {
	IDEA_GROUP_ORDER,
	IDEA_GROUP_LABEL,
	ideaGroups,
	ideaDisplayOrder,
	ideaRunStarts,
	ideaScores,
	ideaSub
} from './idea-groups';

type I = { id: string; type: string; sort_order: number };
const mk = (id: string, type: string, sort_order = 0): I => ({ id, type, sort_order });
const typeOf = (i: I) => i.type;

describe('group order and labels', () => {
	it('is Lodging, Flights, Transportation, Activities, Meals, Notes', () => {
		expect(IDEA_GROUP_ORDER).toEqual(['lodging', 'flight', 'transportation', 'activity', 'meal', 'note']);
		expect(IDEA_GROUP_ORDER.map((t) => IDEA_GROUP_LABEL[t])).toEqual([
			'Lodging',
			'Flights',
			'Transportation',
			'Activities',
			'Meals',
			'Notes'
		]);
	});
});

describe('ideaGroups', () => {
	it('orders groups by the fixed order whatever the input order, omitting empties', () => {
		const groups = ideaGroups([mk('n', 'note'), mk('a', 'activity'), mk('l', 'lodging'), mk('m', 'meal')], typeOf);
		expect(groups.map((g) => g.type)).toEqual(['lodging', 'activity', 'meal', 'note']);
		expect(groups.map((g) => g.label)).toEqual(['Lodging', 'Activities', 'Meals', 'Notes']);
	});

	it('sorts within a group by weighted score desc, ties by sort_order asc', () => {
		const items = [mk('a', 'activity', 3), mk('b', 'activity', 1), mk('c', 'activity', 2), mk('d', 'activity', 0)];
		const g = ideaGroups(items, typeOf, { a: 2, b: 0, c: 2, d: -2 });
		expect(g[0].items.map((i) => i.id)).toEqual(['c', 'a', 'b', 'd']);
	});

	it('scores never leak across groups', () => {
		const items = [mk('m1', 'meal', 0), mk('a1', 'activity', 1), mk('a2', 'activity', 0)];
		const g = ideaGroups(items, typeOf, { m1: 99 });
		expect(g.map((x) => x.type)).toEqual(['activity', 'meal']);
		expect(g[0].items.map((i) => i.id)).toEqual(['a2', 'a1']);
	});

	it('folds an unknown type (legacy checklist) into Notes', () => {
		const g = ideaGroups([mk('c', 'checklist'), mk('n', 'note', 5)], typeOf);
		expect(g).toHaveLength(1);
		expect(g[0].type).toBe('note');
		expect(g[0].items.map((i) => i.id)).toEqual(['c', 'n']);
	});

	it('does not mutate its input', () => {
		const items = [mk('b', 'meal'), mk('a', 'lodging')];
		ideaGroups(items, typeOf);
		expect(items.map((i) => i.id)).toEqual(['b', 'a']);
	});
});

describe('ideaDisplayOrder', () => {
	it('flattens the groups', () => {
		const flat = ideaDisplayOrder([mk('n', 'note'), mk('a', 'activity'), mk('a2', 'activity', 1)], typeOf);
		expect(flat.map((i) => i.id)).toEqual(['a', 'a2', 'n']);
	});
});

describe('ideaRunStarts', () => {
	it('maps the first idea of each contiguous type run to its group type', () => {
		const flat = [mk('l', 'lodging'), mk('a1', 'activity'), mk('a2', 'activity'), mk('m', 'meal')];
		const starts = ideaRunStarts(flat, typeOf);
		expect([...starts.entries()]).toEqual([
			['l', 'lodging'],
			['a1', 'activity'],
			['m', 'meal']
		]);
	});

	it('treats legacy types as notes, and an empty list as no starts', () => {
		expect(ideaRunStarts([mk('c', 'checklist')], typeOf).get('c')).toBe('note');
		expect(ideaRunStarts([], typeOf).size).toBe(0);
	});
});

describe('ideaScores', () => {
	it('sums 2 / 1 / 0 / -2 per item', () => {
		const s = ideaScores({
			a: [
				{ id: '1', member: 'm1', value: 'love' },
				{ id: '2', member: 'm2', value: 'like' }
			],
			b: [{ id: '3', member: 'm1', value: 'dislike' }],
			c: []
		});
		expect(s).toEqual({ a: 3, b: -2, c: 0 });
	});
});

describe('ideaSub', () => {
	it('is place · cost', () => {
		expect(ideaSub({ type: 'activity', location_name: 'Sheboygan', cost_estimate_usd: 40 })).toBe('Sheboygan · $40');
	});
	it('omits an empty part', () => {
		expect(ideaSub({ type: 'activity', location_name: 'Sheboygan' })).toBe('Sheboygan');
		expect(ideaSub({ type: 'activity', cost_estimate_usd: 40 })).toBe('$40');
		expect(ideaSub({ type: 'activity', location_name: ' ', cost_estimate_usd: 0 })).toBe('');
	});
	it('groups thousands and keeps cents', () => {
		expect(ideaSub({ type: 'lodging', cost_estimate_usd: 1250 })).toBe('$1,250');
		expect(ideaSub({ type: 'meal', cost_estimate_usd: 12.5 })).toBe('$12.50');
	});
	it('uses the card meta for the place: a flight route, a note first line', () => {
		expect(
			ideaSub({ type: 'flight', location_name: 'Milwaukee (MKE)', description: '→ Denver (DEN)', cost_estimate_usd: 320 })
		).toBe('MKE → DEN · $320');
		expect(ideaSub({ type: 'note', description: 'Bring cash\nsecond line' })).toBe('Bring cash');
	});
});
