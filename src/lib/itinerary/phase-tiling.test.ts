import { describe, it, expect } from 'vitest';
import { toDay, retilePhases, validateNewPhaseStart, validateMovePhaseStart } from './phase-tiling';

describe('toDay', () => {
	it('normalises a PB datetime to YYYY-MM-DD', () => {
		expect(toDay('2027-04-19 00:00:00.000Z')).toBe('2027-04-19');
		expect(toDay('2027-04-19')).toBe('2027-04-19');
	});
});

describe('retilePhases', () => {
	it('sets each end to the next phase start, last to trip end, order by start', () => {
		const out = retilePhases(
			[
				{ id: 'krabi', start_date: '2027-04-21' },
				{ id: 'trip', start_date: '2027-04-17' },
				{ id: 'khao', start_date: '2027-04-19' }
			],
			'2027-04-24'
		);
		expect(out).toEqual([
			{ id: 'trip', start: '2027-04-17', end: '2027-04-19', order: 0 },
			{ id: 'khao', start: '2027-04-19', end: '2027-04-21', order: 1 },
			{ id: 'krabi', start: '2027-04-21', end: '2027-04-24', order: 2 }
		]);
	});

	it('a sole phase spans the whole trip', () => {
		expect(retilePhases([{ id: 'a', start_date: '2027-04-17' }], '2027-04-24')).toEqual([
			{ id: 'a', start: '2027-04-17', end: '2027-04-24', order: 0 }
		]);
	});
});

describe('validateNewPhaseStart', () => {
	const tripStart = '2027-04-17',
		tripEnd = '2027-04-24',
		starts = ['2027-04-17', '2027-04-19'];
	it('accepts a day strictly inside the trip not already a boundary', () => {
		expect(validateNewPhaseStart('2027-04-21', tripStart, tripEnd, starts)).toBeNull();
	});
	it('rejects the trip start, the trip end, and an existing boundary', () => {
		expect(validateNewPhaseStart('2027-04-17', tripStart, tripEnd, starts)).toMatch(/after the trip begins/);
		expect(validateNewPhaseStart('2027-04-24', tripStart, tripEnd, starts)).toMatch(/before the trip ends/);
		expect(validateNewPhaseStart('2027-04-19', tripStart, tripEnd, starts)).toMatch(/already starts/);
	});
});

describe('validateMovePhaseStart', () => {
	// tiled: trip 17–19, khao 19–21, krabi 21–24
	const tiled = [
		{ id: 'trip', start: '2027-04-17', end: '2027-04-19', order: 0 },
		{ id: 'khao', start: '2027-04-19', end: '2027-04-21', order: 1 },
		{ id: 'krabi', start: '2027-04-21', end: '2027-04-24', order: 2 }
	];
	it('lets a middle phase move strictly between its neighbours’ starts', () => {
		expect(validateMovePhaseStart('khao', '2027-04-20', tiled, '2027-04-17', '2027-04-24')).toBeNull();
	});
	it('rejects moving onto or past a neighbour boundary', () => {
		expect(validateMovePhaseStart('khao', '2027-04-17', tiled, '2027-04-17', '2027-04-24')).toMatch(/between/);
		expect(validateMovePhaseStart('khao', '2027-04-21', tiled, '2027-04-17', '2027-04-24')).toMatch(/between/);
	});
	it('forbids moving the first phase off the trip start', () => {
		expect(validateMovePhaseStart('trip', '2027-04-18', tiled, '2027-04-17', '2027-04-24')).toMatch(/first phase/);
	});
});
