import { describe, it, expect } from 'vitest';
import { cascadeFor, ideasLeft, sameCascade, type CascadeSnapshot } from './cascade';
import type { Cascade, PlannedChange } from './types';

// Mirrors backend/test-tiling.mjs: what trips.pb.js / phases.pb.js do on commit.
const D = (n: number) => `2026-08-${String(n).padStart(2, '0')}`;
const stored = (n: number) => `${D(n)} 00:00:00.000Z`;

function snap(phaseStarts: [string, number][], end = 10, start = 1): CascadeSnapshot {
	const sorted = [...phaseStarts].sort((a, b) => a[1] - b[1]);
	return {
		trip: { id: 't', start_date: stored(start), end_date: stored(end) },
		phases: sorted.map(([name, s], i) => ({
			id: name,
			name,
			start_date: stored(s),
			end_date: stored(i < sorted.length - 1 ? sorted[i + 1][1] : end)
		})),
		days: Array.from({ length: end - start + 1 }, (_, i) => ({
			id: `d${start + i}`,
			date: stored(start + i)
		})),
		items: [
			{ id: 'i1', title: 'Idea in F', phase: 'F', day: '' },
			{ id: 'i2', title: 'Idea in C', phase: 'C', day: '' },
			{ id: 'i3', title: 'Day 10 plan', phase: '', day: 'd10' }
		]
	};
}
const tripDates = (after: Record<string, unknown>): PlannedChange => ({
	action: 'update',
	collection: 'trips',
	id: 't',
	via: 'record',
	before: {},
	after,
	outcome: 'saved',
	title: 'Trip'
});

describe('cascadeFor', () => {
	it('extend: the last phase grows and the new days are listed', () => {
		const c = cascadeFor(
			[tripDates({ end_date: '2026-08-12 00:00:00.000Z' })],
			snap([
				['C', 1],
				['E', 5]
			])
		)!;
		expect(c.tripBefore).toEqual([D(1), D(10)]);
		expect(c.tripAfter).toEqual([D(1), '2026-08-12']);
		expect(c.daysAdded).toEqual(['2026-08-11', '2026-08-12']);
		expect(c.daysRemoved).toEqual([]);
		expect(c.phases.find((p) => p.name === 'E')).toEqual({
			name: 'E',
			before: [D(5), D(10)],
			after: [D(5), '2026-08-12']
		});
		expect(c.moves).toEqual([]);
	});

	it('shrink: the phase starting on the new end merges into its predecessor, its ideas move', () => {
		const c = cascadeFor(
			[tripDates({ end_date: stored(8) })],
			snap([
				['C', 1],
				['E', 5],
				['F', 8]
			])
		)!;
		expect(c.daysRemoved).toEqual([D(9), D(10)]);
		expect(c.phases.find((p) => p.name === 'F')).toEqual({
			name: 'F',
			before: [D(8), D(10)],
			after: null
		});
		expect(c.phases.find((p) => p.name === 'E')!.after).toEqual([D(5), D(8)]);
		expect(c.moves).toContainEqual({ title: 'Idea in F', from: 'F', to: 'E' });
	});

	it('a pruned-day item lands in a surviving phase', () => {
		const c = cascadeFor(
			[tripDates({ end_date: stored(8) })],
			snap([
				['C', 1],
				['E', 5],
				['F', 8]
			])
		)!;
		expect(c.moves).toContainEqual({ title: 'Day 10 plan', from: D(10), to: 'E' });
	});

	it('later start: the first phase is pinned, earlier phases merge', () => {
		const c = cascadeFor(
			[tripDates({ start_date: stored(6) })],
			snap([
				['C', 1],
				['E', 5]
			])
		)!;
		expect(c.phases.find((p) => p.name === 'C')!.after).toBeNull();
		expect(c.phases.find((p) => p.name === 'E')!.after).toEqual([D(6), D(10)]);
		expect(c.moves).toContainEqual({ title: 'Idea in C', from: 'C', to: 'E' });
		expect(c.daysRemoved).toEqual([D(1), D(2), D(3), D(4), D(5)]);
	});

	it('a phase start move re-tiles its neighbours, days unchanged', () => {
		const move: PlannedChange = {
			...tripDates({ start_date: stored(6) }),
			collection: 'phases',
			id: 'E'
		};
		const c = cascadeFor(
			[move],
			snap([
				['C', 1],
				['E', 5]
			])
		)!;
		expect(c.tripBefore).toBeNull();
		expect(c.phases.find((p) => p.name === 'C')!.after).toEqual([D(1), D(6)]);
		expect(c.phases.find((p) => p.name === 'E')!.after).toEqual([D(6), D(10)]);
		expect(c.daysAdded).toEqual([]);
		expect(c.daysRemoved).toEqual([]);
	});

	it('non-date changes cascade nothing', () => {
		expect(cascadeFor([tripDates({ title: 'Renamed' })], snap([['C', 1]]))).toBeNull();
		const rename: PlannedChange = {
			...tripDates({ name: 'Porto' }),
			collection: 'phases',
			id: 'C'
		};
		expect(cascadeFor([rename], snap([['C', 1]]))).toBeNull();
	});
});

describe('sameCascade — commit re-checks the cascade it previewed (#520)', () => {
	const base = (): Cascade => ({
		tripBefore: ['2026-08-01', '2026-08-10'],
		tripAfter: ['2026-08-01', '2026-08-08'],
		daysAdded: [],
		daysRemoved: ['2026-08-09', '2026-08-10'],
		phases: [
			{ name: 'A', before: ['2026-08-01', '2026-08-05'], after: ['2026-08-01', '2026-08-05'] },
			{ name: 'B', before: ['2026-08-05', '2026-08-10'], after: ['2026-08-05', '2026-08-08'] }
		],
		moves: [
			{ title: 'X', from: '2026-08-09', to: 'B' },
			{ title: 'Y', from: '2026-08-10', to: 'B' }
		]
	});
	it('ignores the order PB happened to list phases and items in', () => {
		const b = base();
		b.phases.reverse();
		b.moves.reverse();
		expect(sameCascade(base(), b)).toBe(true);
	});
	it('notices a phase or an item added since the preview', () => {
		const p = base();
		p.phases.push({ name: 'C', before: ['2026-08-09', '2026-08-10'], after: null });
		expect(sameCascade(base(), p)).toBe(false);
		const m = base();
		m.moves.push({ title: 'Z', from: '2026-08-10', to: 'B' });
		expect(sameCascade(base(), m)).toBe(false);
		expect(sameCascade(base(), null)).toBe(false);
		expect(sameCascade(null, null)).toBe(true);
	});
});

describe('ideasLeft — revert names what it left as ideas (#520)', () => {
	it('lists the items a dropped day turned into ideas, not phase moves', () => {
		expect(
			ideasLeft({
				tripBefore: null,
				tripAfter: null,
				daysAdded: [],
				daysRemoved: [],
				phases: [],
				moves: [
					{ title: 'Cooking class', from: '2026-08-09', to: 'B' },
					{ title: 'Idea in F', from: 'F', to: 'C' },
					{ title: 'Port tasting', from: '2026-08-10', to: 'B' }
				]
			})
		).toEqual(['Cooking class', 'Port tasting']);
		expect(ideasLeft(null)).toEqual([]);
	});
});
