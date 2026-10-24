import { describe, it, expect } from 'vitest';
import { spanLabel, dateRangeLabel } from './span-label';

describe('spanLabel (#401)', () => {
	it('reads days and nights', () => {
		expect(spanLabel('2027-11-18', '2027-11-22')).toBe('5 days · 4 nights');
	});
	it('accepts stored datetimes', () => {
		expect(spanLabel('2027-11-18 00:00:00.000Z', '2027-11-19 00:00:00.000Z')).toBe(
			'2 days · 1 night'
		);
	});
	it('single day has no nights', () => {
		expect(spanLabel('2027-11-18', '2027-11-18')).toBe('1 day');
	});
	it('trip adds a phase count', () => {
		expect(spanLabel('2027-11-18', '2027-11-27', 3)).toBe('10 days · 9 nights · 3 phases');
		expect(spanLabel('2027-11-18', '2027-11-27', 1)).toBe('10 days · 9 nights · 1 phase');
	});
	it('empty dates → empty', () => {
		expect(spanLabel('', '')).toBe('');
	});
});

describe('dateRangeLabel (#401 review: headers state dates)', () => {
	it('same month collapses the month', () => {
		expect(dateRangeLabel('2027-11-18', '2027-11-22')).toBe('Nov 18 – 22');
	});
	it('crossing months names both', () => {
		expect(dateRangeLabel('2027-11-28 00:00:00.000Z', '2027-12-02 00:00:00.000Z')).toBe(
			'Nov 28 – Dec 2'
		);
	});
	it('single day', () => {
		expect(dateRangeLabel('2027-11-18', '2027-11-18')).toBe('Nov 18');
	});
	it('with year', () => {
		expect(dateRangeLabel('2027-11-18', '2027-11-24', { year: true })).toBe('Nov 18 – 24, 2027');
		expect(dateRangeLabel('2027-12-30', '2028-01-03', { year: true })).toBe(
			'Dec 30, 2027 – Jan 3, 2028'
		);
	});
	it('empty → empty', () => {
		expect(dateRangeLabel('', '')).toBe('');
	});
});
