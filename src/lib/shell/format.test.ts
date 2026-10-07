import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
	formatCountdown,
	formatTime,
	formatTimeRange,
	formatDateRange,
	formatCalendarDate
} from './format';

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

describe('formatTime with real-dated stored values', () => {
	it('renders the wall-clock time from a full naive-local datetime', () => {
		expect(formatTime('2026-06-08 18:00:00.000Z')).toBe('6:00 PM');
		expect(formatTime('2026-06-08 09:05:00.000Z')).toBe('9:05 AM');
	});
	it('renders a range', () => {
		expect(formatTimeRange('2026-06-08 17:30:00.000Z', '2026-06-08 19:00:00.000Z')).toBe(
			'5:30 PM – 7:00 PM'
		);
	});
});

describe('formatDateRange', () => {
	it('formats a start→end span as abbreviated month/day', () => {
		expect(formatDateRange('2026-06-18', '2026-06-22')).toBe('Jun 18 → Jun 22');
	});
	it('returns empty string when either side is missing', () => {
		expect(formatDateRange('', '2026-06-22')).toBe('');
		expect(formatDateRange('2026-06-18', '')).toBe('');
	});
});

// #393 — calendar days are stored as UTC midnight. A formatter that renders them in the
// viewer's local zone shows every day one day early west of UTC. Every other suite runs in
// UTC and can never see this, so this block pins the process zone itself. The precondition
// test fails loudly if the zone did not take, rather than letting a UTC run pass vacuously.
const LONG = { weekday: 'long', month: 'long', day: 'numeric' } as const;

describe.each(['America/Detroit', 'Pacific/Honolulu', 'Pacific/Auckland'])(
	'formatCalendarDate in %s',
	(zone) => {
		const originalTz = process.env.TZ;
		beforeAll(() => {
			vi.stubEnv('TZ', zone);
		});
		afterAll(() => {
			vi.unstubAllEnvs();
			if (originalTz === undefined) delete process.env.TZ;
			else process.env.TZ = originalTz;
		});

		it('runs in the zone under test', () => {
			expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
		});

		it('keeps the stored calendar day, not the previous local day', () => {
			expect(formatCalendarDate('2026-09-19 00:00:00.000Z', LONG)).toBe('Saturday, September 19');
		});

		it('accepts the ISO and bare-date shapes', () => {
			expect(formatCalendarDate('2026-09-19T00:00:00.000Z', LONG)).toBe('Saturday, September 19');
			expect(formatCalendarDate('2026-09-19', LONG)).toBe('Saturday, September 19');
		});

		it('supports year-bearing long formats (archive range, publish date)', () => {
			expect(
				formatCalendarDate('2026-09-22 00:00:00.000Z', {
					month: 'long',
					day: 'numeric',
					year: 'numeric'
				})
			).toBe('September 22, 2026');
		});
	}
);

describe('formatCalendarDate edge cases', () => {
	it('returns empty string for a missing day', () => {
		expect(formatCalendarDate('', LONG)).toBe('');
	});
});
