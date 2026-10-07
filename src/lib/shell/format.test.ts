import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
	formatCountdown,
	formatTime,
	formatTimeRange,
	formatDateRange,
	formatCalendarDate,
	formatClock,
	formatDayDate,
	formatTimeText,
	railTimeLabels
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

describe('time grammar (#419, D5/D11)', () => {
	// Stored anchor times are naive trip-local wall clock: 'YYYY-MM-DD HH:MM:00.000Z'.
	const at = (hhmm: string) => `2026-10-01 ${hhmm}:00.000Z`;
	const range = (a: string, b: string, type = 'meal') => ({
		type,
		start_time: at(a),
		end_time: at(b)
	});
	const startOnly = (a: string, type = 'meal') => ({ type, start_time: at(a), end_time: '' });
	const endOnly = (b: string, type = 'activity') => ({ type, start_time: '', end_time: at(b) });
	const untimed = { type: 'note', start_time: '', end_time: '' };

	describe('formatClock — 6:30p: the colon stays, the space and the "m" go', () => {
		it('formats evening and morning times', () => {
			expect(formatClock(at('18:30'))).toBe('6:30p');
			expect(formatClock(at('10:30'))).toBe('10:30a');
		});
		it('reads noon as 12:00p and just after midnight as 12:15a', () => {
			expect(formatClock('12:00')).toBe('12:00p');
			expect(formatClock(at('00:15'))).toBe('12:15a');
		});
		it('reads the wall clock from an ISO string without shifting zones', () => {
			expect(formatClock('2026-10-01T09:05:00Z')).toBe('9:05a');
		});
		it('is empty for an empty time', () => {
			expect(formatClock('')).toBe('');
		});
	});

	describe('formatTimeText — the text form (Row, Hero, Span)', () => {
		it('start only', () => {
			expect(formatTimeText(startOnly('21:30'))).toBe('9:30p');
		});
		it('range, joined by an en dash with no spaces', () => {
			expect(formatTimeText(range('10:00', '12:00'))).toBe('10:00a–12:00p');
		});
		it('a deadline keeps "by" in text', () => {
			expect(formatTimeText(endOnly('16:30'))).toBe('by 4:30p');
		});
		it('untimed is omitted', () => {
			expect(formatTimeText(untimed)).toBe('');
		});
		it('a flight writes departure → arrival', () => {
			expect(formatTimeText(range('14:05', '16:20', 'flight'))).toBe('2:05p → 4:20p');
		});
		it('a flight with one time follows the same grammar, never a bare end', () => {
			expect(formatTimeText(startOnly('14:05', 'flight'))).toBe('2:05p');
			expect(formatTimeText(endOnly('16:20', 'flight'))).toBe('by 4:20p');
		});
	});

	describe('formatTimeText — date prefix (booking list, Rows across days)', () => {
		const date = '2026-10-01 00:00:00.000Z';
		it('prefixes the date with a middle dot', () => {
			expect(formatTimeText(startOnly('18:30'), { date })).toBe('Thu Oct 1 · 6:30p');
			expect(formatTimeText(range('10:00', '12:00'), { date })).toBe('Thu Oct 1 · 10:00a–12:00p');
		});
		it('keeps "by" on a deadline after the date', () => {
			expect(formatTimeText(endOnly('16:30'), { date })).toBe('Thu Oct 1 · by 4:30p');
		});
		it('an untimed item reads as the date alone, with no dangling separator', () => {
			expect(formatTimeText(untimed, { date })).toBe('Thu Oct 1');
		});
		it('accepts a bare calendar date and works for flights', () => {
			expect(formatTimeText(range('14:05', '16:20', 'flight'), { date: '2026-10-04' })).toBe(
				'Sun Oct 4 · 2:05p → 4:20p'
			);
		});
	});

	describe('formatDayDate', () => {
		it('formats a calendar day as "Thu Oct 1", with no comma', () => {
			expect(formatDayDate('2026-10-01')).toBe('Thu Oct 1');
			expect(formatDayDate('2026-10-01 00:00:00.000Z')).toBe('Thu Oct 1');
		});
		it('is empty for an empty date', () => {
			expect(formatDayDate('')).toBe('');
		});
	});

	describe('railTimeLabels — the rail: start on the top edge, end on the bottom edge', () => {
		it('a range prints both edges', () => {
			expect(railTimeLabels(range('18:30', '20:30'))).toEqual({ top: '6:30p', bottom: '8:30p' });
		});
		it('start-only prints only the top edge', () => {
			expect(railTimeLabels(startOnly('21:30'))).toEqual({ top: '9:30p', bottom: '' });
		});
		it('a deadline prints a plain bottom label, with no "by" on the rail', () => {
			expect(railTimeLabels(endOnly('16:30'))).toEqual({ top: '', bottom: '4:30p' });
		});
		it('untimed prints no time', () => {
			expect(railTimeLabels(untimed)).toEqual({ top: '', bottom: '' });
		});
	});
});
