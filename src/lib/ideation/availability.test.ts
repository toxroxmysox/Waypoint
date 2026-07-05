import { describe, it, expect } from 'vitest';
import {
	canvasExtent,
	daysInExtent,
	aggregateDayStatuses,
	rollupByDay,
	windowStatus,
	cycleValue,
	myValueByDay,
	type AvailabilityCell
} from './availability';

const cell = (member: string, day: string, value: 'available' | 'maybe'): AvailabilityCell => ({
	member,
	day,
	value
});

describe('canvasExtent (ADR-0023 Decision 5 — today → min/max painted ± 2 weeks)', () => {
	it('empty poll: today → today + 2 weeks', () => {
		expect(canvasExtent([], '2027-06-01')).toEqual({ start: '2027-06-01', end: '2027-06-15' });
	});

	it('painted future days push the end out 2 weeks past the latest', () => {
		const ext = canvasExtent([cell('m', '2027-07-10', 'available')], '2027-06-01');
		expect(ext.start).toBe('2027-06-01'); // today still the floor
		expect(ext.end).toBe('2027-07-24'); // 2 weeks past 07-10
	});

	it('painted past days pull the start back 2 weeks before the earliest', () => {
		const ext = canvasExtent([cell('m', '2027-05-20', 'available')], '2027-06-01');
		expect(ext.start).toBe('2027-05-06'); // 2 weeks before 05-20
		expect(ext.end).toBe('2027-06-15'); // today + 2 weeks (05-20 + 2wk = 06-03 < 06-15)
	});

	it('spans both edges of a wide painted range', () => {
		const ext = canvasExtent(
			[cell('a', '2027-05-01', 'available'), cell('b', '2027-08-01', 'maybe')],
			'2027-06-01'
		);
		expect(ext.start).toBe('2027-04-17'); // 05-01 − 2wk
		expect(ext.end).toBe('2027-08-15'); // 08-01 + 2wk
	});

	it('tolerates PB datetime-shaped days and is order-independent', () => {
		const ext = canvasExtent(
			[cell('b', '2027-08-01 00:00:00.000Z', 'maybe'), cell('a', '2027-05-01 00:00:00.000Z', 'available')],
			'2027-06-01'
		);
		expect(ext).toEqual({ start: '2027-04-17', end: '2027-08-15' });
	});

	it('today is always inside the canvas even when all paint is far future', () => {
		const ext = canvasExtent([cell('m', '2028-01-01', 'available')], '2027-06-01');
		expect(ext.start).toBe('2027-06-01');
		expect(ext.start <= '2027-06-01' && '2027-06-01' <= ext.end).toBe(true);
	});
});

describe('daysInExtent', () => {
	it('inclusive of both ends', () => {
		expect(daysInExtent('2027-06-01', '2027-06-03')).toEqual([
			'2027-06-01',
			'2027-06-02',
			'2027-06-03'
		]);
	});
	it('single day when start === end', () => {
		expect(daysInExtent('2027-06-01', '2027-06-01')).toEqual(['2027-06-01']);
	});
	it('crosses a month boundary correctly', () => {
		expect(daysInExtent('2027-01-30', '2027-02-02')).toEqual([
			'2027-01-30',
			'2027-01-31',
			'2027-02-01',
			'2027-02-02'
		]);
	});
});

describe('aggregateDayStatuses (ADR-0023 Decision 4 — green iff EVERY active member available)', () => {
	const active = ['a', 'b'];

	it('green only when every active member marked available on the day', () => {
		const cells = [cell('a', '2027-06-01', 'available'), cell('b', '2027-06-01', 'available')];
		expect(aggregateDayStatuses(cells, active).get('2027-06-01')).toBe('green');
	});

	it('any maybe → yellow', () => {
		const cells = [cell('a', '2027-06-01', 'available'), cell('b', '2027-06-01', 'maybe')];
		expect(aggregateDayStatuses(cells, active).get('2027-06-01')).toBe('yellow');
	});

	it('a blank (missing member) → yellow, never green', () => {
		const cells = [cell('a', '2027-06-01', 'available')]; // b did not paint
		expect(aggregateDayStatuses(cells, active).get('2027-06-01')).toBe('yellow');
	});

	it('a day with no cells is absent from the map (blank → no tint)', () => {
		expect(aggregateDayStatuses([], active).has('2027-06-01')).toBe(false);
	});

	it('green UN-greens when a new member joins (denominator grows)', () => {
		const cells = [cell('a', '2027-06-01', 'available'), cell('b', '2027-06-01', 'available')];
		expect(aggregateDayStatuses(cells, ['a', 'b']).get('2027-06-01')).toBe('green');
		// c joins but hasn't painted → the same cells now read yellow.
		expect(aggregateDayStatuses(cells, ['a', 'b', 'c']).get('2027-06-01')).toBe('yellow');
	});

	it('ignores cells from non-active (tombstoned) members', () => {
		const cells = [
			cell('a', '2027-06-01', 'available'),
			cell('b', '2027-06-01', 'available'),
			cell('ghost', '2027-06-01', 'maybe') // tombstoned — not in active set
		];
		// ghost's maybe must not pull the day to yellow.
		expect(aggregateDayStatuses(cells, ['a', 'b']).get('2027-06-01')).toBe('green');
	});

	it('a tombstoned member who painted a day still leaves a response after removal', () => {
		// only ghost painted; ghost not active → day has NO active response → absent.
		const cells = [cell('ghost', '2027-06-01', 'available')];
		expect(aggregateDayStatuses(cells, ['a', 'b']).has('2027-06-01')).toBe(false);
	});

	it('single-member group: their sole available day is green', () => {
		expect(aggregateDayStatuses([cell('a', '2027-06-01', 'available')], ['a']).get('2027-06-01')).toBe(
			'green'
		);
	});

	it('no active members: a stray cell still shows a response but never green', () => {
		expect(aggregateDayStatuses([cell('a', '2027-06-01', 'available')], []).has('2027-06-01')).toBe(
			false
		);
	});
});

describe('rollupByDay (Group-mode counts + who)', () => {
	const active = ['a', 'b', 'c'];
	const days = ['2027-06-01', '2027-06-02'];

	it('counts available and maybe members per day, in active order', () => {
		const cells = [
			cell('b', '2027-06-01', 'available'),
			cell('a', '2027-06-01', 'available'),
			cell('c', '2027-06-01', 'maybe')
		];
		const r = rollupByDay(cells, active, days).get('2027-06-01')!;
		expect(r.status).toBe('yellow'); // c is maybe
		expect(r.availableCount).toBe(2);
		expect(r.maybeCount).toBe(1);
		expect(r.availableMembers).toEqual(['a', 'b']); // stable, active order
		expect(r.maybeMembers).toEqual(['c']);
	});

	it('a day with no responses carries status null and zero counts', () => {
		const cells = [cell('a', '2027-06-01', 'available')];
		const r = rollupByDay(cells, active, days).get('2027-06-02')!;
		expect(r.status).toBe(null);
		expect(r.availableCount).toBe(0);
		expect(r.maybeCount).toBe(0);
		expect(r.availableMembers).toEqual([]);
	});

	it('all-available day rolls up green', () => {
		const cells = [
			cell('a', '2027-06-01', 'available'),
			cell('b', '2027-06-01', 'available'),
			cell('c', '2027-06-01', 'available')
		];
		expect(rollupByDay(cells, active, days).get('2027-06-01')!.status).toBe('green');
	});

	it('excludes non-active members from counts', () => {
		const cells = [
			cell('a', '2027-06-01', 'available'),
			cell('ghost', '2027-06-01', 'available')
		];
		const r = rollupByDay(cells, active, days).get('2027-06-01')!;
		expect(r.availableCount).toBe(1);
		expect(r.availableMembers).toEqual(['a']);
	});
});

describe('windowStatus (ADR-0023 Decision 8 — colour a scenario window)', () => {
	const active = ['a', 'b'];

	it('green when EVERY day in the window is green', () => {
		const cells = [
			cell('a', '2027-06-01', 'available'),
			cell('b', '2027-06-01', 'available'),
			cell('a', '2027-06-02', 'available'),
			cell('b', '2027-06-02', 'available')
		];
		expect(windowStatus(cells, active, '2027-06-01', '2027-06-02')).toBe('green');
	});

	it('yellow when the window has a responded day that is not green', () => {
		const cells = [
			cell('a', '2027-06-01', 'available'),
			cell('b', '2027-06-01', 'available'),
			cell('a', '2027-06-02', 'maybe') // 06-02 yellow
		];
		expect(windowStatus(cells, active, '2027-06-01', '2027-06-02')).toBe('yellow');
	});

	it('yellow when a day in the window has no response but another does', () => {
		const cells = [cell('a', '2027-06-01', 'available'), cell('b', '2027-06-01', 'available')];
		// 06-02 blank → not all green → yellow (06-01 responded).
		expect(windowStatus(cells, active, '2027-06-01', '2027-06-02')).toBe('yellow');
	});

	it('null when no day in the window has any response', () => {
		const cells = [cell('a', '2027-05-01', 'available')]; // outside the window
		expect(windowStatus(cells, active, '2027-06-01', '2027-06-02')).toBe(null);
	});

	it('null for a missing/blank date pair', () => {
		expect(windowStatus([], active, '', '2027-06-02')).toBe(null);
		expect(windowStatus([], active, '2027-06-01', '')).toBe(null);
	});

	it('null when end is before start', () => {
		expect(windowStatus([], active, '2027-06-05', '2027-06-01')).toBe(null);
	});

	it('tolerates PB datetime-shaped window bounds', () => {
		const cells = [
			cell('a', '2027-06-01', 'available'),
			cell('b', '2027-06-01', 'available')
		];
		expect(
			windowStatus(cells, active, '2027-06-01 00:00:00.000Z', '2027-06-01 00:00:00.000Z')
		).toBe('green');
	});
});

describe('cycleValue (My-mode tap: blank → available → maybe → blank)', () => {
	it('blank → available', () => expect(cycleValue(null)).toBe('available'));
	it('available → maybe', () => expect(cycleValue('available')).toBe('maybe'));
	it('maybe → blank', () => expect(cycleValue('maybe')).toBe(null));
	it('full cycle returns to blank in three taps', () => {
		let v: 'available' | 'maybe' | null = null;
		v = cycleValue(v);
		v = cycleValue(v);
		v = cycleValue(v);
		expect(v).toBe(null);
	});
});

describe('myValueByDay', () => {
	it('maps each of my cells to its value, keyed by bare day', () => {
		const m = myValueByDay([
			cell('me', '2027-06-01 00:00:00.000Z', 'available'),
			cell('me', '2027-06-03', 'maybe')
		]);
		expect(m.get('2027-06-01')).toBe('available');
		expect(m.get('2027-06-03')).toBe('maybe');
		expect(m.has('2027-06-02')).toBe(false);
	});
});
