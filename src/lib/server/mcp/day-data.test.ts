import { describe, expect, it } from 'vitest';
import { resolveDate } from './day-data';

describe('resolveDate', () => {
	it('reads tomorrow in trip-local time', () => {
		// 23:30 UTC on Jul 1 is already Jul 2 in Zurich → tomorrow is Jul 3.
		expect(resolveDate('Europe/Zurich', 'tomorrow', new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-03');
	});

	it('reads today and yesterday', () => {
		const now = new Date('2026-07-01T12:00:00Z');
		expect(resolveDate('UTC', 'today', now)).toBe('2026-07-01');
		expect(resolveDate('UTC', 'yesterday', now)).toBe('2026-06-30');
	});

	it('falls back to UTC for an invalid zone', () => {
		expect(resolveDate('Lucerne', 'today', new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-01');
	});

	it('passes an explicit date through', () => {
		expect(resolveDate('UTC', '2026-07-05', new Date())).toBe('2026-07-05');
	});

	it('rejects anything else', () => {
		expect(() => resolveDate('UTC', 'next friday', new Date())).toThrow(/YYYY-MM-DD/);
	});
});
