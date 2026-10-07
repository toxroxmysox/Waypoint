import { describe, it, expect } from 'vitest';
import { validateTripImport, generateImportSlug, planImportPhases, resolveImportItemStatus } from './import';

describe('validateTripImport', () => {
	const validExport = {
		_waypoint_version: 1,
		exported_at: '2026-06-01T00:00:00Z',
		trip: {
			title: 'Test Trip',
			slug: 'test-trip',
			start_date: '2026-06-01',
			end_date: '2026-06-07',
			timezone: 'America/Detroit',
			location_summary: 'Michigan',
			countries: ['US'],
			photo_album_url: '',
			archive_enabled: false,
			archive_publish_after_days: 7,
			auto_approve_suggestions: true
		},
		phases: [],
		days: [],
		items: [],
		budget: null
	};

	it('accepts a valid export', () => {
		const result = validateTripImport(validExport);
		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
		expect(result.data).toBeTruthy();
	});

	it('rejects non-object input', () => {
		expect(validateTripImport(null).valid).toBe(false);
		expect(validateTripImport('string').valid).toBe(false);
		expect(validateTripImport(42).valid).toBe(false);
	});

	it('rejects wrong version', () => {
		const result = validateTripImport({ ...validExport, _waypoint_version: 2 });
		expect(result.valid).toBe(false);
		expect(result.errors[0]).toContain('Unsupported version');
	});

	it('rejects missing trip title', () => {
		const result = validateTripImport({
			...validExport,
			trip: { ...validExport.trip, title: '' }
		});
		expect(result.valid).toBe(false);
	});

	it('rejects missing arrays', () => {
		const result = validateTripImport({
			...validExport,
			phases: 'not-array'
		});
		expect(result.valid).toBe(false);
	});
});

describe('generateImportSlug', () => {
	it('produces a kebab-case slug with imported suffix', () => {
		const slug = generateImportSlug('Spain 2026');
		expect(slug).toMatch(/^spain-2026-imported-[a-z0-9]{4}$/);
	});

	it('handles special characters', () => {
		const slug = generateImportSlug('My Trip!!! @#$ Test');
		expect(slug).toMatch(/^my-trip-test-imported-[a-z0-9]{4}$/);
	});
});

describe('planImportPhases', () => {
	const p = (name: string, start_date: string, order = 0) => ({
		name,
		location: '',
		country_code: '',
		start_date,
		end_date: '',
		order
	});
	const TS = '2026-06-01';
	const TE = '2026-06-10';

	it('first sorted phase retargets the seeded phase; later ones tile by start', () => {
		const plan = planImportPhases([p('B', '2026-06-05', 1), p('A', '2026-06-01', 0)], TS, TE);
		expect(plan.map((x) => [x.phase.name, x.action, x.start])).toEqual([
			['A', 'first', TS],
			['B', 'create', '2026-06-05']
		]);
	});

	it('folds a start outside the trip into the phase covering it', () => {
		const plan = planImportPhases(
			[p('A', '2026-06-01'), p('B', '2026-06-05', 1), p('Late', '2026-07-01', 2), p('Early', '2026-05-01', 3)],
			TS,
			TE
		);
		const by = Object.fromEntries(plan.map((x) => [x.phase.name, x]));
		// 'Early' sorts first (May 1) and so becomes the seeded first phase.
		expect(by.Early.action).toBe('first');
		// A (June 1) is not strictly after the trip start boundary?  It equals tripStart → folds into the pinned first phase.
		expect(by.A.action).toBe('fold');
		expect(by.A.intoStart).toBe(TS);
		expect(by.B.action).toBe('create');
		// Late (July 1) is past the trip end → folds into the latest phase starting before it.
		expect(by.Late).toMatchObject({ action: 'fold', intoStart: '2026-06-05' });
	});

	it('folds a duplicate start into the phase already there', () => {
		const plan = planImportPhases([p('A', '2026-06-01'), p('B', '2026-06-04', 1), p('C', '2026-06-04', 2)], TS, TE);
		expect(plan[1].action).toBe('create');
		expect(plan[2]).toMatchObject({ action: 'fold', intoStart: '2026-06-04' });
	});

	it('a start on the trip end cannot tile (must leave a day) — folds', () => {
		const plan = planImportPhases([p('A', '2026-06-01'), p('Z', TE, 1)], TS, TE);
		expect(plan[1]).toMatchObject({ action: 'fold', intoStart: TS });
	});

	it('accepts datetime starts', () => {
		const plan = planImportPhases([p('A', '2026-06-01 00:00:00.000Z'), p('B', '2026-06-04 00:00:00.000Z', 1)], TS, TE);
		expect(plan[1]).toMatchObject({ action: 'create', start: '2026-06-04' });
	});

	it('breaks start ties by order', () => {
		const plan = planImportPhases([p('Second', '2026-06-01', 1), p('First', '2026-06-01', 0)], TS, TE);
		expect(plan[0].phase.name).toBe('First');
	});
});

describe('resolveImportItemStatus', () => {
	it('keeps planned/done/blank when the day resolved', () => {
		expect(resolveImportItemStatus('planned', true)).toBe('planned');
		expect(resolveImportItemStatus('done', true)).toBe('done');
		expect(resolveImportItemStatus('', true)).toBe('planned');
		expect(resolveImportItemStatus(undefined, true)).toBe('planned');
	});
	it('parks a dated status as unplanned when the day did not resolve', () => {
		expect(resolveImportItemStatus('planned', false)).toBe('unplanned');
		expect(resolveImportItemStatus('done', false)).toBe('unplanned');
		expect(resolveImportItemStatus(undefined, false)).toBe('unplanned');
	});
	it('leaves undated statuses alone either way', () => {
		expect(resolveImportItemStatus('considered', false)).toBe('considered');
		expect(resolveImportItemStatus('unplanned', false)).toBe('unplanned');
	});
});
