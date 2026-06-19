import { describe, it, expect } from 'vitest';
import {
	decideStrategy,
	isAppAssetPath,
	isDataRequest,
	isDocumentFilePath,
	isNavigationRequest
} from './cache-policy';

const ORIGIN = 'https://waypoint.test';

/** Build a request rooted at the SW scope origin unless an absolute URL is given. */
function req(
	path: string,
	init: { mode?: RequestMode; method?: string; accept?: string } = {}
): Request {
	const url = path.startsWith('http') ? path : `${ORIGIN}${path}`;
	const headers = init.accept ? { accept: init.accept } : undefined;
	// `mode: 'navigate'` is not constructible via `new Request` in some runtimes;
	// stub a minimal Request-shaped object when needed so the classifier sees it.
	if (init.mode === 'navigate') {
		return {
			url,
			method: init.method ?? 'GET',
			mode: 'navigate',
			headers: new Headers(headers)
		} as unknown as Request;
	}
	return new Request(url, { method: init.method ?? 'GET', headers });
}

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

	it('rejects the API-prefixed variant', () => {
		expect(isDocumentFilePath('/api/trips/x/documents/y/file')).toBe(false);
	});
});

describe('isAppAssetPath', () => {
	it('matches SvelteKit build assets under /_app/', () => {
		expect(isAppAssetPath('/_app/immutable/chunks/abc.js')).toBe(true);
		expect(isAppAssetPath('/_app/version.json')).toBe(true);
	});

	it('rejects ordinary routes and static files', () => {
		expect(isAppAssetPath('/trips/paris-2026')).toBe(false);
		expect(isAppAssetPath('/brand/favicon.svg')).toBe(false);
	});
});

describe('isDataRequest', () => {
	it('matches a /__data.json suffix', () => {
		expect(isDataRequest(new URL(`${ORIGIN}/trips/paris-2026/__data.json`))).toBe(true);
	});

	it('matches a ?__data.json search probe', () => {
		expect(isDataRequest(new URL(`${ORIGIN}/trips/paris-2026?__data.json`))).toBe(true);
	});

	it('rejects a plain navigation path', () => {
		expect(isDataRequest(new URL(`${ORIGIN}/trips/paris-2026`))).toBe(false);
	});

	it('rejects a path that merely contains the token mid-string', () => {
		expect(isDataRequest(new URL(`${ORIGIN}/__data.json/not-the-end`))).toBe(false);
	});
});

describe('isNavigationRequest', () => {
	it('matches mode === navigate', () => {
		expect(isNavigationRequest(req('/trips', { mode: 'navigate' }))).toBe(true);
	});

	it('falls back to an HTML Accept header when mode is unavailable', () => {
		expect(isNavigationRequest(req('/trips', { accept: 'text/html,application/xhtml+xml' }))).toBe(
			true
		);
	});

	it('rejects a GET for JSON', () => {
		expect(isNavigationRequest(req('/trips', { accept: 'application/json' }))).toBe(false);
	});

	it('rejects a non-GET even with an HTML Accept', () => {
		expect(isNavigationRequest(req('/trips', { method: 'POST', accept: 'text/html' }))).toBe(false);
	});
});

describe('decideStrategy', () => {
	it('document bytes → cache-first', () => {
		const s = decideStrategy(req('/trips/paris-2026/documents/abc/file'), ORIGIN);
		expect(s.kind).toBe('cache-first');
		expect(s.fallbackToShell).toBe(false);
	});

	it('build assets → cache-first', () => {
		expect(decideStrategy(req('/_app/immutable/entry/app.js'), ORIGIN).kind).toBe('cache-first');
	});

	it('navigation → network-first WITH shell fallback', () => {
		const s = decideStrategy(req('/trips/paris-2026', { mode: 'navigate' }), ORIGIN);
		expect(s.kind).toBe('network-first');
		expect(s.fallbackToShell).toBe(true);
	});

	it('__data.json → network-first WITHOUT shell fallback', () => {
		const s = decideStrategy(req('/trips/paris-2026/__data.json'), ORIGIN);
		expect(s.kind).toBe('network-first');
		expect(s.fallbackToShell).toBe(false);
	});

	it('non-trip API (same-origin) → passthrough', () => {
		expect(decideStrategy(req('/api/collections/trips/records'), ORIGIN).kind).toBe('passthrough');
	});

	it('a same-origin XHR for JSON that is not a data payload → passthrough', () => {
		const s = decideStrategy(req('/some/endpoint', { accept: 'application/json' }), ORIGIN);
		expect(s.kind).toBe('passthrough');
	});

	it('non-GET (mutation) → passthrough even for a navigation-shaped URL', () => {
		const s = decideStrategy(req('/trips/paris-2026', { method: 'POST', mode: 'navigate' }), ORIGIN);
		expect(s.kind).toBe('passthrough');
	});

	it('cross-origin → passthrough (we only manage our own caches)', () => {
		const s = decideStrategy(
			req('https://cdn.example.com/_app/immutable/x.js'),
			ORIGIN
		);
		expect(s.kind).toBe('passthrough');
	});

	it('cross-origin navigation → passthrough (origin check precedes nav check)', () => {
		const s = decideStrategy(req('https://other.test/trips', { mode: 'navigate' }), ORIGIN);
		expect(s.kind).toBe('passthrough');
	});

	it('document-bytes check precedes the API passthrough fallthrough', () => {
		// A doc file path is same-origin and GET; must resolve to cache-first, not passthrough.
		expect(decideStrategy(req('/trips/x/documents/y/file'), ORIGIN).kind).toBe('cache-first');
	});
});
