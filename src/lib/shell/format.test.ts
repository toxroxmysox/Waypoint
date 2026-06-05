import { describe, it, expect } from 'vitest';
import { formatCountdown } from './format';

describe('formatCountdown', () => {
	it('returns "< 1m" for 0 or negative minutes', () => {
		expect(formatCountdown(0)).toBe('< 1m');
		expect(formatCountdown(-5)).toBe('< 1m');
	});

	it('returns minutes only when under 60', () => {
		expect(formatCountdown(45)).toBe('45m');
		expect(formatCountdown(1)).toBe('1m');
	});

	it('returns hours and minutes when 60 or more', () => {
		expect(formatCountdown(90)).toBe('1h 30m');
		expect(formatCountdown(120)).toBe('2h');
	});

	it('omits minutes when evenly divisible by 60', () => {
		expect(formatCountdown(180)).toBe('3h');
	});

	it('handles large values', () => {
		expect(formatCountdown(600)).toBe('10h');
	});
});
