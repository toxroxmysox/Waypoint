import { describe, it, expect } from 'vitest';
import { validateTripImport, generateImportSlug } from './import';

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
