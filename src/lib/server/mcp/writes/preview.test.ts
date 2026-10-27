import { describe, it, expect } from 'vitest';
import { previewCards, outcomeLine, clockAm, rangeText, changeSummary } from './preview';
import type { Cascade, PlannedChange } from './types';
import type { Trip } from '$lib/types';

const trip = {
	id: 'porto',
	title: 'Porto',
	start_date: '2026-11-01 00:00:00.000Z',
	end_date: '2026-11-08 00:00:00.000Z'
} as Trip;
const update: PlannedChange = {
	action: 'update',
	collection: 'items',
	id: 'lunch',
	via: 'record',
	before: { start_time: '2026-11-03 09:00:00.000Z' },
	after: { start_time: '2026-11-03 09:40:00.000Z' },
	outcome: 'saved',
	title: 'Train to Coimbra'
};
const create = (outcome: PlannedChange['outcome']): PlannedChange => ({
	action: 'create',
	collection: 'items',
	id: 'new123',
	via: outcome === 'saved' ? 'record' : 'suggestion',
	before: null,
	after: { type: 'meal', title: 'Dinner', notes: 'x' },
	outcome,
	title: 'Dinner'
});

describe('previewCards', () => {
	it('shows a changed time old → new as 9:40 am', () => {
		const [card] = previewCards([update], null, trip);
		expect(card.changes).toContainEqual({ field: 'Start time', from: '9:00 am', to: '9:40 am' });
		expect(card.lines).toContain('Start time: 9:00 am → 9:40 am');
	});

	it('carries the real outcome on each card', () => {
		expect(previewCards([create('suggested')], null, trip)[0].lines).toContain(
			'Sent to the owners as a suggestion'
		);
		expect(previewCards([create('idea')], null, trip)[0].lines).toContain('Added as an idea');
		expect(previewCards([update], null, trip)[0].lines).toContain('Saved');
		expect(outcomeLine([update, create('idea')])).toBe('Saved · Added as an idea');
	});

	it('puts the cascade first: removed days and moves', () => {
		const cascade: Cascade = {
			tripBefore: ['2026-11-01', '2026-11-08'],
			tripAfter: ['2026-11-01', '2026-11-07'],
			daysAdded: [],
			daysRemoved: ['2026-11-08'],
			phases: [
				{
					name: 'Lisbon',
					before: ['2026-11-05', '2026-11-08'],
					after: ['2026-11-05', '2026-11-07']
				}
			],
			moves: [
				{ title: 'Fado night', from: '2026-11-08', to: 'Lisbon' },
				{ title: 'Tram 28', from: '2026-11-08', to: 'Lisbon' }
			]
		};
		const cards = previewCards([update], cascade, trip);
		expect(cards).toHaveLength(2);
		const text = cards[0].lines.join('\n');
		expect(text).toContain('Sun 8 Nov removed');
		expect(text).toContain('2 items become ideas in Lisbon: Fado night, Tram 28');
	});

	it('scrubs emails out of what it shows', () => {
		const withEmail = {
			...create('saved'),
			after: { title: 'Dinner', description: 'book via x@y.com' }
		};
		const card = previewCards([withEmail], null, trip)[0];
		expect(JSON.stringify(card)).not.toContain('x@y.com');
	});
});

describe('formats', () => {
	it('clocks read like the app: 9:40 am, 12:05 pm', () => {
		expect(clockAm('2026-11-03 09:40:00.000Z')).toBe('9:40 am');
		expect(clockAm('12:05')).toBe('12:05 pm');
		expect(clockAm('')).toBe('');
	});
	it('date ranges read Mon 3 Nov → Tue 4 Nov', () => {
		expect(rangeText(['2026-11-02', '2026-11-03'])).toBe('Mon 2 Nov → Tue 3 Nov');
	});
});

describe('wording (intent review)', () => {
	it('a phase merge moves items; a dropped day turns them into ideas', () => {
		const cascade: Cascade = {
			tripBefore: null,
			tripAfter: null,
			daysAdded: [],
			daysRemoved: [],
			phases: [],
			moves: [{ title: 'Idea in F', from: 'F', to: 'E' }]
		};
		expect(previewCards([update], cascade, trip)[0].lines).toContain(
			'1 item moves to E: Idea in F'
		);
	});
	it("shows the year on a date outside the trip's year", () => {
		const phase: PlannedChange = {
			...create('saved'),
			collection: 'phases',
			after: { name: 'Winter', start_date: '2027-01-02 00:00:00.000Z' }
		};
		expect(previewCards([phase], null, trip)[0].lines).toContain('Start date: Sat 2 Jan 2027');
		const inYear: PlannedChange = {
			...phase,
			after: { name: 'Lisbon', start_date: '2026-11-05 00:00:00.000Z' }
		};
		expect(previewCards([inYear], null, trip)[0].lines).toContain('Start date: Thu 5 Nov');
	});
});

describe('previewCards — no raw data (#520)', () => {
	const labels = {
		members: new Map([
			['m1', 'Ana'],
			['m2', 'Ben']
		]),
		records: new Map([
			['it1', 'Cooking class'],
			['cl1', 'Packing'],
			['sc1', 'Coast first']
		])
	};
	const mk = (collection: string, after: Record<string, unknown>): PlannedChange => ({
		action: 'create',
		collection,
		id: 'x',
		via: 'record',
		before: null,
		after,
		outcome: 'saved',
		title: 'T'
	});
	const lines = (c: PlannedChange) => previewCards([c], null, trip, labels)[0].lines;

	it('an expense split reads as names and amounts', () => {
		expect(lines(mk('expenses', { split_data: { members: ['m1', 'm2'] } }))).toContain(
			'Split data: Equally: Ana, Ben'
		);
		expect(lines(mk('expenses', { split_data: { amounts: { m1: 20, m2: 30.5 } } }))).toContain(
			'Split data: Ana $20, Ben $30.50'
		);
		expect(lines(mk('expenses', { category: 'food', split_mode: 'by_amount' }))).toEqual(
			expect.arrayContaining(['Category: Food', 'Split mode: By amount'])
		);
	});

	it('a vote names the item, not its id', () => {
		expect(lines(mk('votes', { item: 'it1', value: 'love' }))).toContain('Item: Cooking class');
	});

	it('a budget lists its categories in words', () => {
		expect(
			lines(
				mk('trip_budgets', {
					categories: [
						{ category: 'lodging', mode: 'per_day', total: 120 },
						{ category: 'food', mode: 'total', total: 500 }
					]
				})
			)
		).toContain('Categories: Lodging $120/day, Food $500 total');
	});

	it('tasks, points and codes name their parent', () => {
		expect(lines(mk('tasks', { checklist: 'cl1', title: 'Pack' }))).toContain('Checklist: Packing');
		expect(lines(mk('scenario_points', { scenario: 'sc1', kind: 'pro' }))).toContain(
			'Scenario: Coast first'
		);
		expect(lines(mk('documents', { item: 'it1', code_value: 'X1' }))).toContain(
			'Item: Cooking class'
		);
		expect(lines(mk('tasks', { checklist: 'gone' }))).toContain('Checklist: a list');
	});
});

describe('changeSummary — what an AI Change touched, for Account (#520)', () => {
	const c = (title: string, committed = true) => ({ title, committed });
	it('names up to two records, then counts the rest', () => {
		expect(changeSummary([c('Picnic lunch')])).toBe('Picnic lunch');
		expect(changeSummary([c('Lunch'), c('Dinner'), c('Lunch')])).toBe('Lunch, Dinner');
		expect(changeSummary([c('A'), c('B'), c('C'), c('D')])).toBe('A, B and 2 more');
	});
	it('skips changes that never went through, and falls back to a count', () => {
		expect(changeSummary([c('A', false), c('B')])).toBe('B');
		expect(changeSummary([])).toBe('No changes');
		expect(changeSummary([{ title: '', committed: true }])).toBe('1 change');
	});
});
