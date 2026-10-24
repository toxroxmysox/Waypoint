import { describe, it, expect } from 'vitest';
import { computeGlance, checkGlanceToken } from './glance';

const T = '2026-10-11';
const none = new Map<string, number>();

describe('computeGlance', () => {
	it('counts a past trip in the year', () => {
		const r = computeGlance([{ id: 'a', start: '2026-03-01', end: '2026-03-05' }], none, T);
		expect(r).toMatchObject({ year: 2026, trips: 1, days: 5 });
	});
	it('year-spanning trip: days only up to today within the year', () => {
		const trip = [{ id: 'a', start: '2026-12-28', end: '2027-01-03' }];
		expect(computeGlance(trip, none, '2026-12-30')).toMatchObject({
			year: 2026,
			trips: 1,
			days: 3
		});
		expect(computeGlance(trip, none, '2027-01-02')).toMatchObject({
			year: 2027,
			trips: 1,
			days: 2
		});
	});
	it('future trip counts as a trip with 0 days and its items', () => {
		const r = computeGlance(
			[{ id: 'a', start: '2026-11-10', end: '2026-11-15' }],
			new Map([['a', 7]]),
			T
		);
		expect(r).toEqual({ year: 2026, trips: 1, days: 0, items: 7 });
	});
	it('overlapping trips count distinct dates', () => {
		const r = computeGlance(
			[
				{ id: 'a', start: '2026-06-01', end: '2026-06-05' },
				{ id: 'b', start: '2026-06-04', end: '2026-06-08' }
			],
			none,
			T
		);
		expect(r).toMatchObject({ trips: 2, days: 8 });
	});
	it('excludes other-year trips entirely, sums items for counted only', () => {
		const r = computeGlance(
			[
				{ id: 'old', start: '2025-06-01', end: '2025-06-05' },
				{ id: 'a', start: '2026-03-01', end: '2026-03-05' }
			],
			new Map([
				['old', 99],
				['a', 4]
			]),
			T
		);
		expect(r).toEqual({ year: 2026, trips: 1, days: 5, items: 4 });
		expect(
			computeGlance(
				[{ id: 'old', start: '2025-06-01', end: '2025-06-05' }],
				new Map([['old', 9]]),
				T
			)
		).toMatchObject({ trips: 0, items: 0, days: 0 });
	});
	it('in-progress trip counts days through today inclusive', () => {
		expect(computeGlance([{ id: 'a', start: '2026-10-09', end: '2026-10-20' }], none, T).days).toBe(
			3
		);
	});
});

describe('checkGlanceToken', () => {
	it('matches', () => expect(checkGlanceToken('Bearer s3cret', 's3cret')).toBe(true));
	it('rejects wrong/missing', () => {
		expect(checkGlanceToken('Bearer nope', 's3cret')).toBe(false);
		expect(checkGlanceToken(null, 's3cret')).toBe(false);
		expect(checkGlanceToken('s3cret', 's3cret')).toBe(false);
	});
	it('rejects when expected unset/empty', () => {
		expect(checkGlanceToken('Bearer ', '')).toBe(false);
		expect(checkGlanceToken('Bearer x', undefined)).toBe(false);
	});
});
