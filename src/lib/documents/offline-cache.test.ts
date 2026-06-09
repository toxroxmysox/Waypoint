import { describe, it, expect } from 'vitest';
import { isDocumentFilePath } from './offline-cache';

describe('isDocumentFilePath', () => {
	it('matches the inline document file endpoint', () => {
		expect(isDocumentFilePath('/trips/paris-2026/documents/abc123/file')).toBe(true);
	});

	it('rejects the aggregate documents page and item pages', () => {
		expect(isDocumentFilePath('/trips/paris-2026/documents')).toBe(false);
		expect(isDocumentFilePath('/trips/paris-2026/items/xyz')).toBe(false);
	});

	it('rejects a trailing segment past /file (no over-match)', () => {
		expect(isDocumentFilePath('/trips/paris-2026/documents/abc123/file/extra')).toBe(false);
	});

	it('rejects a different slug shape only when structurally wrong', () => {
		// A query string lives on url.search, not pathname — pathname stays clean.
		expect(isDocumentFilePath('/trips/x/documents/y/file')).toBe(true);
		expect(isDocumentFilePath('/api/trips/x/documents/y/file')).toBe(false);
	});
});
