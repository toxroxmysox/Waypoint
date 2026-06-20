import { describe, it, expect } from 'vitest';
import { getTripLifecycle, isTripActive } from './trip-lifecycle';

const trip = (start: string, end: string, archived = false) => ({
	start_date: start,
	end_date: end,
	archived
});

const tzTrip = (start: string, end: string, timezone: string, archived = false) => ({
	start_date: start,
	end_date: end,
	archived,
	timezone
});

describe('getTripLifecycle', () => {
	describe('the four states', () => {
		it('planning before the trip starts', () => {
			expect(getTripLifecycle(trip('2026-06-10', '2026-06-15'), new Date('2026-06-05'))).toBe(
				'planning'
			);
		});

		it('active within the trip dates', () => {
			expect(getTripLifecycle(trip('2026-06-01', '2026-06-10'), new Date('2026-06-05'))).toBe(
				'active'
			);
		});

		it('wrap-up the day after the trip ends', () => {
			expect(getTripLifecycle(trip('2026-06-01', '2026-06-05'), new Date('2026-06-10'))).toBe(
				'wrap-up'
			);
		});

		it('closed when archived', () => {
			expect(getTripLifecycle(trip('2026-06-01', '2026-06-05', true), new Date('2026-06-10'))).toBe(
				'closed'
			);
		});
	});

	describe('date boundaries', () => {
		it('day before start → planning', () => {
			expect(getTripLifecycle(trip('2026-06-05', '2026-06-10'), new Date('2026-06-04'))).toBe(
				'planning'
			);
		});

		it('first day (== start_date) → active', () => {
			expect(getTripLifecycle(trip('2026-06-05', '2026-06-10'), new Date('2026-06-05'))).toBe(
				'active'
			);
		});

		it('last day (== end_date) → active', () => {
			expect(getTripLifecycle(trip('2026-06-01', '2026-06-05'), new Date('2026-06-05'))).toBe(
				'active'
			);
		});

		it('day after end → wrap-up', () => {
			expect(getTripLifecycle(trip('2026-06-01', '2026-06-05'), new Date('2026-06-06'))).toBe(
				'wrap-up'
			);
		});

		it('single-day trip on its one day → active', () => {
			expect(getTripLifecycle(trip('2026-06-05', '2026-06-05'), new Date('2026-06-05'))).toBe(
				'active'
			);
		});

		it('ignores the time portion of now — compares dates only', () => {
			expect(
				getTripLifecycle(trip('2026-06-05', '2026-06-05'), new Date('2026-06-05T23:59:59Z'))
			).toBe('active');
		});
	});

	describe('archived precedence + the reopen flip', () => {
		it('archived takes precedence over an in-range date (would be active) → closed', () => {
			expect(getTripLifecycle(trip('2026-06-01', '2026-06-10', true), new Date('2026-06-05'))).toBe(
				'closed'
			);
		});

		it('archived takes precedence over a future date (would be planning) → closed', () => {
			expect(getTripLifecycle(trip('2026-06-10', '2026-06-15', true), new Date('2026-06-05'))).toBe(
				'closed'
			);
		});

		it('reopen: archived:false on a past-end trip re-derives to wrap-up (no special state)', () => {
			expect(getTripLifecycle(trip('2026-06-01', '2026-06-05', false), new Date('2026-06-10'))).toBe(
				'wrap-up'
			);
		});

		it('reopen: archived:false on an in-range trip re-derives to active', () => {
			expect(getTripLifecycle(trip('2026-06-01', '2026-06-10', false), new Date('2026-06-05'))).toBe(
				'active'
			);
		});
	});

	describe('the date-less → planning guard (never wrap-up via empty end_date)', () => {
		it('no start and no end → planning', () => {
			expect(getTripLifecycle(trip('', ''), new Date('2026-06-05'))).toBe('planning');
		});

		it('empty end_date → planning, NOT wrap-up (the explicit guard)', () => {
			expect(getTripLifecycle(trip('2026-06-01', ''), new Date('2026-06-05'))).toBe('planning');
		});

		it('empty start_date → planning', () => {
			expect(getTripLifecycle(trip('', '2026-06-10'), new Date('2026-06-05'))).toBe('planning');
		});

		it('a date-less trip still closes when archived (archived wins over the guard)', () => {
			expect(getTripLifecycle(trip('', '', true), new Date('2026-06-05'))).toBe('closed');
		});
	});

	describe('timezone boundaries (#167 — the lethal scar)', () => {
		// Behind-UTC (America/New_York, -4 in June): the last-day evening LOCAL is already
		// the NEXT calendar day in UTC. The lifecycle must NOT flip to wrap-up while it's
		// still the trip's final evening locally — the #167 bug class.
		it('behind-UTC: stays active on last-day evening though UTC has rolled past midnight', () => {
			// 2026-06-05 20:00 New York == 2026-06-06 00:00Z
			const now = new Date('2026-06-06T00:00:00Z');
			expect(getTripLifecycle(tzTrip('2026-06-01', '2026-06-05', 'America/New_York'), now)).toBe(
				'active'
			);
			// A naive UTC comparison would read "today" as 2026-06-06 → wrap-up (the bug).
			expect(getTripLifecycle(tzTrip('2026-06-01', '2026-06-05', 'UTC'), now)).toBe('wrap-up');
		});

		it('behind-UTC: flips to wrap-up once the local clock passes end-of-day', () => {
			// 2026-06-06 00:30 New York == 2026-06-06 04:30Z (trip is over locally)
			const now = new Date('2026-06-06T04:30:00Z');
			expect(getTripLifecycle(tzTrip('2026-06-01', '2026-06-05', 'America/New_York'), now)).toBe(
				'wrap-up'
			);
		});

		// Ahead-of-UTC (Asia/Tokyo, +9): just past local midnight after the end date, UTC
		// is still on the end date and a naive comparison would wrongly read active.
		it('ahead-of-UTC: wrap-up just after local midnight past end_date', () => {
			// 2026-06-06 01:00 Tokyo == 2026-06-05 16:00Z
			const now = new Date('2026-06-05T16:00:00Z');
			expect(getTripLifecycle(tzTrip('2026-06-01', '2026-06-05', 'Asia/Tokyo'), now)).toBe(
				'wrap-up'
			);
			// A naive UTC comparison would read "today" as 2026-06-05 → active.
			expect(getTripLifecycle(tzTrip('2026-06-01', '2026-06-05', 'UTC'), now)).toBe('active');
		});

		it('ahead-of-UTC: still planning on the morning before start, before UTC catches up', () => {
			// 2026-05-31 08:00 Tokyo == 2026-05-30 23:00Z (UTC still two days before start)
			const now = new Date('2026-05-30T23:00:00Z');
			expect(getTripLifecycle(tzTrip('2026-06-01', '2026-06-05', 'Asia/Tokyo'), now)).toBe(
				'planning'
			);
		});

		it('ahead-of-UTC: active on first-day local morning before UTC catches up', () => {
			// 2026-06-01 08:00 Tokyo == 2026-05-31 23:00Z (UTC still on the prior day)
			const now = new Date('2026-05-31T23:00:00Z');
			expect(getTripLifecycle(tzTrip('2026-06-01', '2026-06-05', 'Asia/Tokyo'), now)).toBe('active');
		});

		it('falls back to UTC when the timezone is invalid', () => {
			// Invalid zone → tripTz → UTC. 2026-06-06 00:00Z reads today as 2026-06-06 → wrap-up.
			const now = new Date('2026-06-06T00:00:00Z');
			expect(getTripLifecycle(tzTrip('2026-06-01', '2026-06-05', 'Mars/Olympus'), now)).toBe(
				'wrap-up'
			);
		});

		it('archived precedence holds across the tz boundary', () => {
			// Same instant that would be active locally, but archived → still closed.
			const now = new Date('2026-06-06T00:00:00Z');
			expect(
				getTripLifecycle(tzTrip('2026-06-01', '2026-06-05', 'America/New_York', true), now)
			).toBe('closed');
		});
	});
});

describe('isTripActive (alias over getTripLifecycle === "active")', () => {
	it('true only for the active state', () => {
		expect(isTripActive(trip('2026-06-01', '2026-06-10'), new Date('2026-06-05'))).toBe(true);
	});

	it('false for planning', () => {
		expect(isTripActive(trip('2026-06-10', '2026-06-15'), new Date('2026-06-05'))).toBe(false);
	});

	it('false for wrap-up (not active-or-wrap-up)', () => {
		expect(isTripActive(trip('2026-06-01', '2026-06-05'), new Date('2026-06-10'))).toBe(false);
	});

	it('false for closed', () => {
		expect(isTripActive(trip('2026-06-01', '2026-06-10', true), new Date('2026-06-05'))).toBe(false);
	});

	it('false for a date-less trip', () => {
		expect(isTripActive(trip('', ''), new Date('2026-06-05'))).toBe(false);
	});

	it('agrees with getTripLifecycle on the behind-UTC last-day evening', () => {
		const now = new Date('2026-06-06T00:00:00Z');
		expect(isTripActive(tzTrip('2026-06-01', '2026-06-05', 'America/New_York'), now)).toBe(true);
	});
});
