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
});
