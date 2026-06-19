// Pure request → caching-strategy classifier for the service worker (#253, ADR-0010).
//
// The service worker is a thin executor; ALL routing decisions live here so they
// can be exhaustively unit-tested without a Cache API / fetch / DOM. Nothing in
// this module performs I/O — it inspects a request shape and returns a strategy
// descriptor. The SW (sw glue) is what opens caches and calls fetch.
//
// Strategies (ADR-0010):
//   - app shell + build assets, document bytes → cache-first
//   - navigations + their `__data.json` payloads → network-first, cached fallback;
//     a navigation that misses the cache WHILE OFFLINE falls back to the precached
//     app shell (so a cold launch renders the app, never a raw 503)
//   - everything else (non-trip API, cross-origin, etc.) → network passthrough

/**
 * Matches a document file endpoint path: `/trips/<slug>/documents/<id>/file`.
 * Immutable bytes per record → cache-first. (Kept here, alongside the other
 * path predicates, so the policy module is the single classifier; the documents
 * client module re-exports it for its own callers.)
 */
export function isDocumentFilePath(pathname: string): boolean {
	return /^\/trips\/[^/]+\/documents\/[^/]+\/file$/.test(pathname);
}

/**
 * Build assets and immutable hashed files emitted by SvelteKit live under
 * `${base}/_app/` (e.g. `/_app/immutable/...`). Cache-first — content-hashed, so
 * a changed file is a changed URL.
 */
export function isAppAssetPath(pathname: string): boolean {
	return pathname.includes('/_app/');
}

/**
 * SvelteKit data payload for a route load: SvelteKit appends `/__data.json` to
 * the route path (optionally with a `?__data.json` style probe via search params
 * in some versions). Treated like its navigation: network-first with cached
 * fallback. Couples to SvelteKit's data-loading contract (ADR-0010 consequence).
 */
export function isDataRequest(url: URL): boolean {
	return url.pathname.endsWith('/__data.json') || url.searchParams.has('__data.json');
}

/**
 * A top-level navigation (the user opening/visiting an HTML page). Detected via
 * `request.mode === 'navigate'`; we also accept an explicit HTML `Accept` as a
 * defensive fallback for environments where `mode` is unavailable.
 */
export function isNavigationRequest(request: Request): boolean {
	if (request.mode === 'navigate') return true;
	const accept = request.headers?.get?.('accept') ?? '';
	return request.method === 'GET' && accept.includes('text/html');
}

export type StrategyKind = 'cache-first' | 'network-first' | 'passthrough';

export interface Strategy {
	kind: StrategyKind;
	/**
	 * For `network-first`: when the network fails AND the request misses the cache,
	 * serve the precached app shell instead of a 503. True only for navigations.
	 */
	fallbackToShell: boolean;
}

const CACHE_FIRST: Strategy = { kind: 'cache-first', fallbackToShell: false };
const NETWORK_FIRST: Strategy = { kind: 'network-first', fallbackToShell: false };
const NETWORK_FIRST_SHELL: Strategy = { kind: 'network-first', fallbackToShell: true };
const PASSTHROUGH: Strategy = { kind: 'passthrough', fallbackToShell: false };

/**
 * Map a request to a caching strategy. PURE: no caches, no fetch, no globals
 * beyond what's needed to parse the URL.
 *
 * - Non-GET → passthrough (mutations always hit the network; never cached).
 * - Cross-origin → passthrough (we only manage our own origin's caches).
 * - Document file bytes → cache-first (immutable per record).
 * - Same-origin static build assets → cache-first (content-hashed).
 * - Navigations → network-first, with shell fallback on an offline miss.
 * - `__data.json` payloads → network-first (no shell fallback; not a page).
 * - Everything else same-origin (API calls, etc.) → passthrough.
 */
export function decideStrategy(request: Request, scopeOrigin: string): Strategy {
	if (request.method !== 'GET') return PASSTHROUGH;

	let url: URL;
	try {
		url = new URL(request.url);
	} catch {
		return PASSTHROUGH;
	}

	if (url.origin !== scopeOrigin) return PASSTHROUGH;

	if (isDocumentFilePath(url.pathname)) return CACHE_FIRST;
	if (isAppAssetPath(url.pathname)) return CACHE_FIRST;

	if (isDataRequest(url)) return NETWORK_FIRST;
	if (isNavigationRequest(request)) return NETWORK_FIRST_SHELL;

	return PASSTHROUGH;
}
