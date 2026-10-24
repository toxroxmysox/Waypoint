import { describe, expect, it } from 'vitest';
import { resolveSince } from './what-changed';

describe('resolveSince', () => {
	const now = new Date('2026-07-02T01:30:00Z'); // 03:30 on Jul 2 in Zurich (UTC+2)

	it('reads a bare date as trip-local midnight', () => {
		expect(resolveSince('2026-07-01', now, 'Europe/Zurich').toISOString()).toBe(
			'2026-06-30T22:00:00.000Z'
		);
	});

	it('reads "yesterday" as the start of yesterday in the trip', () => {
		expect(resolveSince('yesterday', now, 'Europe/Zurich').toISOString()).toBe(
			'2026-06-30T22:00:00.000Z'
		);
	});

	it('"last week" is seven days back; ISO passes through', () => {
		expect(resolveSince('last week', now, 'Europe/Zurich').toISOString()).toBe(
			'2026-06-25T01:30:00.000Z'
		);
		expect(resolveSince('2026-07-01T12:00:00Z', now).toISOString()).toBe(
			'2026-07-01T12:00:00.000Z'
		);
	});
});
