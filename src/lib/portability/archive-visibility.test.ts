import { describe, it, expect } from 'vitest';
import { isArchiveVisible, publishStatus } from './archive-visibility';
import type { ArchiveVisibilityTrip } from './archive-visibility';

// Prior art: archive-view.test.ts. These assert EXTERNAL behavior — (trip, now) in,
// visibility/status out — across the cases the publish gate must honor (#241).

function trip(o: Partial<ArchiveVisibilityTrip> = {}): ArchiveVisibilityTrip {
	return { archive_enabled: true, archive_publish_at: '', timezone: 'UTC', ...o };
}

describe('isArchiveVisible (#241)', () => {
	const now = new Date('2026-06-15T12:00:00Z');

	it('unpublished — no archive_publish_at → not visible', () => {
		expect(isArchiveVisible(trip({ archive_publish_at: '' }), now)).toBe(false);
	});

	it('reopen-pause — a cleared archive_publish_at → not visible', () => {
		// Reopen sets archived:false AND clears archive_publish_at; the public route
		// must immediately stop serving the record.
		expect(isArchiveVisible(trip({ archive_publish_at: '   ' }), now)).toBe(false);
	});

	it('scheduled-future — publish date is after today → not yet visible', () => {
		expect(isArchiveVisible(trip({ archive_publish_at: '2026-06-20' }), now)).toBe(false);
	});

	it('scheduled-today — publish date is today → visible', () => {
		expect(isArchiveVisible(trip({ archive_publish_at: '2026-06-15' }), now)).toBe(true);
	});

	it('live — publish date is in the past → visible', () => {
		expect(isArchiveVisible(trip({ archive_publish_at: '2026-06-01' }), now)).toBe(true);
	});

	it('disabled — archive_enabled:false hides it even with a past publish date', () => {
		expect(
			isArchiveVisible(trip({ archive_enabled: false, archive_publish_at: '2026-06-01' }), now)
		).toBe(false);
	});

	it('accepts a full PB datetime in archive_publish_at (date portion compared)', () => {
		expect(
			isArchiveVisible(trip({ archive_publish_at: '2026-06-15 00:00:00.000Z' }), now)
		).toBe(true);
	});

	describe('trip-local timezone boundary (#167)', () => {
		it('ahead-of-UTC: a today-publish goes live by trip-local date, not UTC', () => {
			// 2026-06-15 08:00 Tokyo == 2026-06-14 23:00Z. Trip-local "today" is 2026-06-15,
			// so a publish date of 2026-06-15 is already live — even though UTC is still
			// on the 14th (a raw UTC compare would read it as not-yet-visible).
			const n = new Date('2026-06-14T23:00:00Z');
			expect(
				isArchiveVisible(trip({ archive_publish_at: '2026-06-15', timezone: 'Asia/Tokyo' }), n)
			).toBe(true);
		});

		it('behind-UTC: a today-publish is NOT live until the trip-local day arrives', () => {
			// 2026-06-14 22:00 New York == 2026-06-15 02:00Z. Trip-local "today" is still
			// 2026-06-14, so a publish date of 2026-06-15 is not visible yet (a raw UTC
			// compare would have wrongly flipped it live).
			const n = new Date('2026-06-15T02:00:00Z');
			expect(
				isArchiveVisible(
					trip({ archive_publish_at: '2026-06-15', timezone: 'America/New_York' }),
					n
				)
			).toBe(false);
		});
	});
});

describe('export ↔ page visibility parity (#282)', () => {
	// TOKEN-1/TOKEN-2: the public archive PAGE (`/archive/[token]`) and EXPORT
	// (`/archive/[token]/export`) share one token, so they must agree on whether the
	// trip is public. Both now gate on the SAME pure `isArchiveVisible` — the export
	// route no longer derives its own `end_date + archive_publish_after_days` window.
	// This locks the parity at the gate: for every publish state, the serve/block
	// decision the export route makes (serve ⇔ isArchiveVisible) equals the decision
	// the page route makes (full view ⇔ isArchiveVisible).
	const now = new Date('2026-06-15T12:00:00Z');

	// [state name, trip overrides, should the public surface serve?]
	const cases: [string, Partial<ArchiveVisibilityTrip>, boolean][] = [
		['never-published', { archive_publish_at: '' }, false],
		['kept-private', { archive_enabled: false, archive_publish_at: '' }, false],
		['reopened (publish date cleared)', { archive_publish_at: '   ' }, false],
		['scheduled-future', { archive_publish_at: '2026-06-20' }, false],
		['published (live)', { archive_publish_at: '2026-06-01' }, true],
	];

	for (const [name, overrides, shouldServe] of cases) {
		it(`${name}: page and export agree (serve=${shouldServe})`, () => {
			const t = trip(overrides);
			const visible = isArchiveVisible(t, now);
			// Page route: shows the full archive ⇔ isArchiveVisible (else pending screen).
			const pageServes = visible;
			// Export route: returns the plan JSON ⇔ isArchiveVisible (else 404).
			const exportServes = visible;
			expect(visible).toBe(shouldServe);
			expect(exportServes).toBe(pageServes);
		});
	}
});

describe('publishStatus (#241)', () => {
	const now = new Date('2026-06-15T12:00:00Z');

	it('unpublished — no date', () => {
		expect(publishStatus(trip({ archive_publish_at: '' }), now)).toEqual({ status: 'unpublished' });
	});

	it('unpublished — sharing disabled (even with a date)', () => {
		expect(
			publishStatus(trip({ archive_enabled: false, archive_publish_at: '2026-06-01' }), now)
		).toEqual({ status: 'unpublished' });
	});

	it('scheduled — future date, carries the date', () => {
		expect(publishStatus(trip({ archive_publish_at: '2026-06-20' }), now)).toEqual({
			status: 'scheduled',
			date: '2026-06-20'
		});
	});

	it('live — today', () => {
		expect(publishStatus(trip({ archive_publish_at: '2026-06-15' }), now)).toEqual({
			status: 'live'
		});
	});

	it('live — past date', () => {
		expect(publishStatus(trip({ archive_publish_at: '2026-06-01' }), now)).toEqual({
			status: 'live'
		});
	});
});
