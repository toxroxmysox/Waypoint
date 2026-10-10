import { describe, it, expect } from 'vitest';
import { rowSub, flightSub, fitFlightSub, rowTrailing, flightRoute, rowContent, keyItemRows } from './row';

const est = (s: string) => s.length * 7; // 7px per char, deterministic

describe('rowSub: the sub-line for non-flight rows', () => {
	it('single day: date, time, place in the text grammar', () => {
		const sub = rowSub(
			{ type: 'meal', start_time: '2026-10-01 18:30:00.000Z', end_time: '', location_name: 'Immigrant' },
			{ dayDate: '2026-10-01 00:00:00.000Z' }
		);
		expect(sub).toBe('Thu Oct 1 · 6:30p · Immigrant');
	});
	it('range and deadline use the text forms', () => {
		expect(
			rowSub({ type: 'activity', start_time: '2026-10-01 10:00', end_time: '2026-10-01 12:00' }, { dayDate: '2026-10-01' })
		).toBe('Thu Oct 1 · 10:00a–12:00p');
		expect(rowSub({ type: 'activity', start_time: '', end_time: '2026-10-01 16:30' }, { dayDate: '2026-10-01' })).toBe(
			'Thu Oct 1 · by 4:30p'
		);
	});
	it('untimed: date and place only; nothing when there is neither', () => {
		expect(rowSub({ type: 'meal', location_name: 'Cafe' }, { dayDate: '2026-10-01' })).toBe('Thu Oct 1 · Cafe');
		expect(rowSub({ type: 'meal' }, {})).toBe('');
	});
	it('falls back to the phase name when there is no location', () => {
		expect(rowSub({ type: 'meal' }, { dayDate: '2026-10-01', phaseName: 'Milwaukee' })).toBe('Thu Oct 1 · Milwaukee');
		expect(rowSub({ type: 'meal', location_name: 'Cafe' }, { phaseName: 'Milwaukee' })).toBe('Cafe');
	});
	it('multi-day lodging: date range, nights, place', () => {
		expect(
			rowSub(
				{ type: 'lodging', end_date: '2026-10-03 00:00:00.000Z', location_name: 'American Club', start_time: '2026-10-01 15:00' },
				{ dayDate: '2026-10-01' }
			)
		).toBe('Thu Oct 1–Sat Oct 3 · 2 nights · American Club');
		expect(rowSub({ type: 'lodging', end_date: '2026-10-02' }, { dayDate: '2026-10-01' })).toBe('Thu Oct 1–Fri Oct 2 · 1 night');
	});
	it('calendar dates never shift by zone (UTC)', () => {
		expect(rowSub({ type: 'meal' }, { dayDate: '2026-01-01' })).toBe('Thu Jan 1');
	});
});

describe('flightRoute', () => {
	it('prefers airport codes', () => {
		expect(flightRoute('Milwaukee Mitchell (MKE)', 'Denver Intl (DEN)')).toBe('MKE → DEN');
	});
	it('falls back to the labels, then to what exists', () => {
		expect(flightRoute('Milwaukee', 'Denver')).toBe('Milwaukee → Denver');
		expect(flightRoute('Milwaukee', '')).toBe('Milwaukee');
		expect(flightRoute('', '')).toBe('');
	});
});

describe('flightSub', () => {
	const base = { departure: '2026-10-01 14:05', arrival: '2026-10-01 16:20', from: 'MKE Airport (MKE)', to: 'Denver (DEN)' };
	it('splits into date, departure, arrival, route', () => {
		expect(flightSub(base)).toEqual({ date: 'Thu Oct 1', dep: '2:05p', arr: '4:20p', route: 'MKE → DEN' });
	});
	it('marks a next-day arrival', () => {
		expect(flightSub({ ...base, arrival: '2026-10-02 06:10' }).arr).toBe('6:10a +1');
	});
	it('a clock-less red-eye shows the arrival date', () => {
		expect(flightSub({ ...base, arrival: '2026-10-02' }).arr).toBe('Fri Oct 2');
	});
	it('date-only departure has no departure time', () => {
		const s = flightSub({ ...base, departure: '2026-10-01', arrival: '' });
		expect(s).toEqual({ date: 'Thu Oct 1', dep: '', arr: '', route: 'MKE → DEN' });
	});
});

describe('fitFlightSub: arrival drops first so the route survives', () => {
	const sub = { date: 'Thu Oct 1', dep: '2:05p', arr: '4:20p', route: 'MKE → DEN' };
	const full = 'Thu Oct 1 · 2:05p → 4:20p · MKE → DEN';

	it('everything fits: full text, nothing dropped', () => {
		expect(fitFlightSub(sub, 1000, est)).toEqual({ text: full, dropped: [] });
	});
	it('arrival time drops first', () => {
		const r = fitFlightSub(sub, est(full) - 1, est);
		expect(r.dropped).toEqual(['arr']);
		expect(r.text).toBe('Thu Oct 1 · 2:05p · MKE → DEN');
	});
	it('then the departure time', () => {
		const r = fitFlightSub(sub, est('Thu Oct 1 · 2:05p · MKE → DEN') - 1, est);
		expect(r.dropped).toEqual(['arr', 'dep']);
		expect(r.text).toBe('Thu Oct 1 · MKE → DEN');
	});
	it('then the date, leaving the route', () => {
		const r = fitFlightSub(sub, 0, est);
		expect(r.dropped).toEqual(['arr', 'dep', 'date']);
		expect(r.text).toBe('MKE → DEN');
	});
	it('the route is never dropped, however narrow', () => {
		expect(fitFlightSub(sub, -50, est).text).toContain('MKE → DEN');
	});
	it('a flight with no arrival skips straight to the next drop', () => {
		const r = fitFlightSub({ ...sub, arr: '' }, est('Thu Oct 1 · 2:05p · MKE → DEN') - 1, est);
		expect(r.dropped).toEqual(['dep']);
	});
	it('arrival alone (no departure) reads "arrives"', () => {
		expect(fitFlightSub({ ...sub, dep: '' }, 1000, est).text).toBe('Thu Oct 1 · arrives 4:20p · MKE → DEN');
	});
	it('no route: the remaining parts still render', () => {
		expect(fitFlightSub({ ...sub, route: '' }, 1000, est).text).toBe('Thu Oct 1 · 2:05p → 4:20p');
	});
});

describe('rowTrailing: the single trailing value', () => {
	it('a chip wins', () => {
		expect(rowTrailing({ chip: 'booked', cost: 40, people: 2 })).toBe('chip');
		expect(rowTrailing({ chip: 'needs-booking' })).toBe('chip');
	});
	it('then cost, then people, then the chevron', () => {
		expect(rowTrailing({ cost: 40, people: 2 })).toBe('cost');
		expect(rowTrailing({ people: 2 })).toBe('people');
		expect(rowTrailing({})).toBe('chevron');
		expect(rowTrailing({ cost: 0, people: 0 })).toBe('chevron');
	});
});

describe('keyItemRows: the overview Flights & stays list', () => {
	const days = [
		{ id: 'd1', date: '2026-10-01 00:00:00.000Z' },
		{ id: 'd2', date: '2026-10-03 00:00:00.000Z' }
	];
	const base = { subtype: '', status: 'planned' as const, booked: false, requires_booking: true, description: '', location_name: '' };
	it('keeps flights and stays only, in date order, undated last', () => {
		const rows = keyItemRows(
			[
				{ ...base, id: 'u', type: 'lodging', title: 'Undated', day: '', start_time: '', end_time: '', end_date: '' },
				{ ...base, id: 'b', type: 'flight', title: 'Home', day: 'd2', start_time: '', end_time: '', end_date: '' },
				{ ...base, id: 'meal', type: 'meal', title: 'Dinner', day: 'd1', start_time: '', end_time: '', end_date: '' },
				{ ...base, id: 'a', type: 'lodging', title: 'Hotel', day: 'd1', start_time: '', end_time: '', end_date: '2026-10-03' }
			],
			days
		);
		expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'u']);
		expect(rows[0].sub).toBe('Thu Oct 1–Sat Oct 3 · 2 nights');
	});
	it('flags what still needs booking', () => {
		const [open, done] = keyItemRows(
			[
				{ ...base, id: 'o', type: 'flight', title: 'Out', day: 'd1', start_time: '', end_time: '', end_date: '' },
				{ ...base, id: 'k', type: 'flight', title: 'Back', day: 'd2', booked: true, start_time: '', end_time: '', end_date: '' }
			],
			days
		);
		expect([open.needsBooking, done.needsBooking]).toEqual([true, false]);
	});
});

describe('rowContent: flight place line (#435)', () => {
	const base = { type: 'flight' as const, location_name: 'Milwaukee (MKE)', description: '→ Denver (DEN)' };
	it('new flight: number is in the title, route alone', () => {
		const r = rowContent({ ...base, title: 'UA 1234 to Denver', flight_number: 'UA 1234' }, { dayDate: '2026-10-01' });
		expect(r.flight?.route).toBe('MKE → DEN');
		expect(r.sub).toBe('Thu Oct 1 · MKE → DEN');
	});
	it('legacy flight with a stored number keeps it', () => {
		const r = rowContent({ ...base, title: 'Spirit', flight_number: 'NK 345' }, { dayDate: '2026-10-01' });
		expect(r.flight?.route).toBe('NK 345 · MKE → DEN');
	});
});

describe('rowContent: one call per item', () => {
	it('a flight yields its parts and the full text', () => {
		const r = rowContent(
			{
				type: 'flight',
				start_time: '2026-10-01 14:05:00.000Z',
				end_time: '2026-10-01 16:20:00.000Z',
				location_name: 'Milwaukee (MKE)',
				description: '→ Denver (DEN)'
			},
			{ dayDate: '2026-10-01 00:00:00.000Z' }
		);
		expect(r.flight).toEqual({ date: 'Thu Oct 1', dep: '2:05p', arr: '4:20p', route: 'MKE → DEN' });
		expect(r.sub).toBe('Thu Oct 1 · 2:05p → 4:20p · MKE → DEN');
	});
	it('a flight with only a day falls back to the day for the date', () => {
		const r = rowContent({ type: 'flight', location_name: 'Milwaukee (MKE)', description: '→ Denver (DEN)' }, { dayDate: '2026-10-01' });
		expect(r.sub).toBe('Thu Oct 1 · MKE → DEN');
	});
	it('other types give plain text and no flight parts', () => {
		const r = rowContent({ type: 'meal', location_name: 'Cafe' }, { dayDate: '2026-10-01' });
		expect(r).toEqual({ sub: 'Thu Oct 1 · Cafe', flight: null });
	});
});
