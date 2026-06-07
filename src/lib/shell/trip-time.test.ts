import { describe, it, expect } from 'vitest';
import { tripNow, tripToday, tripTz, combineDateTime, isValidTimeZone } from './trip-time';

describe('tripTz', () => {
	it('returns the trip timezone when set', () => {
		expect(tripTz({ timezone: 'Europe/Madrid' })).toBe('Europe/Madrid');
	});
	it('falls back to UTC when blank', () => {
		expect(tripTz({ timezone: '' })).toBe('UTC');
		expect(tripTz({ timezone: undefined as unknown as string })).toBe('UTC');
	});
	it('falls back to UTC when the stored value is not a valid IANA zone', () => {
		// Regression: a city name like "Chengdu" was stored as a timezone and
		// crashed the entire /trips load with a RangeError from Intl.
		expect(tripTz({ timezone: 'Chengdu' })).toBe('UTC');
		expect(tripTz({ timezone: 'Not/AZone' })).toBe('UTC');
	});
});

describe('isValidTimeZone', () => {
	it('accepts canonical IANA zones', () => {
		expect(isValidTimeZone('Europe/Madrid')).toBe(true);
		expect(isValidTimeZone('UTC')).toBe(true);
	});
	it('rejects bare city names and garbage', () => {
		expect(isValidTimeZone('Chengdu')).toBe(false);
		expect(isValidTimeZone('')).toBe(false);
		expect(isValidTimeZone('Not/AZone')).toBe(false);
	});
});

describe('tripNow', () => {
	// 2026-06-08T22:30:00Z. In Madrid (UTC+2 in summer) the wall clock is 00:30 on Jun 9.
	const instant = new Date('2026-06-08T22:30:00.000Z');

	it('returns a Date whose UTC fields equal the trip-local wall clock', () => {
		const n = tripNow('Europe/Madrid', instant);
		expect(n.getUTCFullYear()).toBe(2026);
		expect(n.getUTCMonth()).toBe(5); // June (0-indexed)
		expect(n.getUTCDate()).toBe(9); // rolled past midnight in Madrid
		expect(n.getUTCHours()).toBe(0);
		expect(n.getUTCMinutes()).toBe(30);
	});

	it('is identity (UTC fields) when tz is UTC', () => {
		const n = tripNow('UTC', instant);
		expect(n.getUTCDate()).toBe(8);
		expect(n.getUTCHours()).toBe(22);
	});
});

describe('tripToday', () => {
	const instant = new Date('2026-06-08T22:30:00.000Z');
	it('gives the trip-local calendar date', () => {
		expect(tripToday('Europe/Madrid', instant)).toBe('2026-06-09');
		expect(tripToday('America/Detroit', instant)).toBe('2026-06-08'); // UTC-4, still 18:30 Jun 8
		expect(tripToday('UTC', instant)).toBe('2026-06-08');
	});
});

describe('combineDateTime', () => {
	it('combines a day date and a time-of-day into a naive-local UTC-suffixed string', () => {
		expect(combineDateTime('2026-06-08', '18:00')).toBe('2026-06-08 18:00:00.000Z');
	});
	it('accepts a day date that carries its own time/zone suffix', () => {
		expect(combineDateTime('2026-06-08 00:00:00.000Z', '09:15')).toBe('2026-06-08 09:15:00.000Z');
	});
	it('returns empty string when either part is missing', () => {
		expect(combineDateTime('', '18:00')).toBe('');
		expect(combineDateTime('2026-06-08', '')).toBe('');
	});
});
