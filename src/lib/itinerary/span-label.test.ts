import { describe, it, expect } from 'vitest';
import { spanLabel } from './span-label';

describe('spanLabel (#401)', () => {
	it('reads days and nights', () => {
		expect(spanLabel('2027-11-18', '2027-11-22')).toBe('5 days · 4 nights');
	});
	it('accepts stored datetimes', () => {
		expect(spanLabel('2027-11-18 00:00:00.000Z', '2027-11-19 00:00:00.000Z')).toBe('2 days · 1 night');
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
