import { describe, it, expect } from 'vitest';
import { isTripActive } from './activation';

const trip = (start: string, end: string, archived = false) => ({
	start_date: start,
	end_date: end,
	archived
});

describe('isTripActive', () => {
	it('returns true when today is within trip dates', () => {
		expect(isTripActive(trip('2026-06-01', '2026-06-10'), new Date('2026-06-05'))).toBe(true);
	});

	it('returns true on start_date', () => {
		expect(isTripActive(trip('2026-06-05', '2026-06-10'), new Date('2026-06-05'))).toBe(true);
	});

	it('returns true on end_date', () => {
		expect(isTripActive(trip('2026-06-01', '2026-06-05'), new Date('2026-06-05'))).toBe(true);
	});

	it('returns false before start_date', () => {
		expect(isTripActive(trip('2026-06-10', '2026-06-15'), new Date('2026-06-05'))).toBe(false);
	});

	it('returns false after end_date', () => {
		expect(isTripActive(trip('2026-06-01', '2026-06-05'), new Date('2026-06-10'))).toBe(false);
	});

	it('returns false when archived', () => {
		expect(isTripActive(trip('2026-06-01', '2026-06-10', true), new Date('2026-06-05'))).toBe(false);
	});

	it('returns false when start_date is empty', () => {
		expect(isTripActive(trip('', '2026-06-10'), new Date('2026-06-05'))).toBe(false);
	});

	it('returns false when end_date is empty', () => {
		expect(isTripActive(trip('2026-06-01', ''), new Date('2026-06-05'))).toBe(false);
	});

	it('ignores time portion of now — compares dates only', () => {
		expect(isTripActive(trip('2026-06-05', '2026-06-05'), new Date('2026-06-05T23:59:59Z'))).toBe(true);
	});

	describe('timezone boundaries (#167)', () => {
		const tzTrip = (start: string, end: string, timezone: string) => ({
			start_date: start,
			end_date: end,
			archived: false,
			timezone
		});

		// Behind-UTC (America/New_York, -4 in June): last-day evening local is
		// already the NEXT calendar day in UTC. The reported symptom — Trip Mode
		// flipping back to Planning mid-evening on the last day.
		it('behind-UTC: stays active on last-day evening (UTC has rolled over)', () => {
			// 2026-06-05 20:00 New York == 2026-06-06 00:00Z
			const now = new Date('2026-06-06T00:00:00Z');
			expect(isTripActive(tzTrip('2026-06-01', '2026-06-05', 'America/New_York'), now)).toBe(true);
			// UTC-based comparison would have read "today" as 2026-06-06 → inactive.
			expect(isTripActive({ ...tzTrip('2026-06-01', '2026-06-05', 'UTC') }, now)).toBe(false);
		});

		it('behind-UTC: becomes inactive once local clock passes end-of-day', () => {
			// 2026-06-06 00:30 New York == 2026-06-06 04:30Z (trip is over locally)
			const now = new Date('2026-06-06T04:30:00Z');
			expect(isTripActive(tzTrip('2026-06-01', '2026-06-05', 'America/New_York'), now)).toBe(false);
		});

		// Ahead-of-UTC (Asia/Tokyo, +9): just past local midnight after the end
		// date, UTC is still on the end date and would wrongly read active.
		it('ahead-of-UTC: inactive just after local midnight past end_date', () => {
			// 2026-06-06 01:00 Tokyo == 2026-06-05 16:00Z
			const now = new Date('2026-06-05T16:00:00Z');
			expect(isTripActive(tzTrip('2026-06-01', '2026-06-05', 'Asia/Tokyo'), now)).toBe(false);
			// UTC-based comparison would have read "today" as 2026-06-05 → active.
			expect(isTripActive(tzTrip('2026-06-01', '2026-06-05', 'UTC'), now)).toBe(true);
		});

		it('ahead-of-UTC: active on first-day local morning before UTC catches up', () => {
			// 2026-06-01 08:00 Tokyo == 2026-05-31 23:00Z (UTC still on the prior day)
			const now = new Date('2026-05-31T23:00:00Z');
			expect(isTripActive(tzTrip('2026-06-01', '2026-06-05', 'Asia/Tokyo'), now)).toBe(true);
			// UTC-based comparison would have read "today" as 2026-05-31 → inactive.
			expect(isTripActive(tzTrip('2026-06-01', '2026-06-05', 'UTC'), now)).toBe(false);
		});

		// DST spring-forward in America/New_York: 2026-03-08 02:00 -> 03:00 (-5 to -4).
		it('DST: last-day evening across spring-forward stays active', () => {
			// 2026-03-08 20:00 New York (post-transition, -4) == 2026-03-09 00:00Z
			const now = new Date('2026-03-09T00:00:00Z');
			expect(isTripActive(tzTrip('2026-03-05', '2026-03-08', 'America/New_York'), now)).toBe(true);
		});

		it('DST: pre-transition morning resolves to the correct local date', () => {
			// 2026-03-08 01:00 New York (pre-transition, -5) == 2026-03-08 06:00Z
			const now = new Date('2026-03-08T06:00:00Z');
			expect(isTripActive(tzTrip('2026-03-08', '2026-03-10', 'America/New_York'), now)).toBe(true);
		});

		it('falls back to UTC when timezone is invalid', () => {
			const now = new Date('2026-06-06T00:00:00Z');
			const bad = { start_date: '2026-06-01', end_date: '2026-06-05', archived: false, timezone: 'Mars/Olympus' };
			// Invalid zone -> tripTz -> UTC -> today is 2026-06-06 -> inactive.
			expect(isTripActive(bad, now)).toBe(false);
		});
	});
});
