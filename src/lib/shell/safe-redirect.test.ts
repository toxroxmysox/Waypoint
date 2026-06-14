import { describe, it, expect } from 'vitest';
import { safeRedirect } from './safe-redirect';

describe('safeRedirect', () => {
	it('passes through a plain internal path', () => {
		expect(safeRedirect('/trips/spain-2025/days/abc')).toBe('/trips/spain-2025/days/abc');
	});

	it('preserves a query string and hash on an internal path', () => {
		expect(safeRedirect('/trips/x/today?tab=upcoming#focus')).toBe(
			'/trips/x/today?tab=upcoming#focus'
		);
	});

	it('falls back when target is empty / null / undefined', () => {
		expect(safeRedirect('')).toBe('/trips');
		expect(safeRedirect(null)).toBe('/trips');
		expect(safeRedirect(undefined)).toBe('/trips');
	});

	it('rejects an absolute http(s) URL', () => {
		expect(safeRedirect('https://evil.test/phish')).toBe('/trips');
		expect(safeRedirect('http://evil.test')).toBe('/trips');
	});

	it('rejects a protocol-relative URL', () => {
		expect(safeRedirect('//evil.test/phish')).toBe('/trips');
	});

	it('rejects backslash-smuggled cross-origin URLs', () => {
		expect(safeRedirect('/\\evil.test')).toBe('/trips');
		expect(safeRedirect('/\\\\evil.test')).toBe('/trips');
	});

	it('rejects a bare relative path with no leading slash', () => {
		expect(safeRedirect('trips')).toBe('/trips');
		expect(safeRedirect('evil.test')).toBe('/trips');
	});

	it('honors a custom fallback', () => {
		expect(safeRedirect(null, '/claim')).toBe('/claim');
		expect(safeRedirect('//evil', '/claim')).toBe('/claim');
	});
});
