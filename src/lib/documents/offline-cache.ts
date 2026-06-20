// Client helpers for the Documents offline cache (S5, #74). The service worker
// owns the cache; these talk to it via Cache Storage (read) and postMessage
// (precache request). Browser-only — guarded for SSR.

/**
 * Matches a document file endpoint path: `/trips/<slug>/documents/<id>/file`.
 * Shared by the service worker (to cache-first these bytes) and tested here.
 */
export function isDocumentFilePath(pathname: string): boolean {
	return /^\/trips\/[^/]+\/documents\/[^/]+\/file$/.test(pathname);
}

/**
 * True when this file's bytes are already in any cache (`caches.match`). This is
 * the single source of truth for the offline tick + "Saved offline" chip — never
 * an assumption. Absent = not cached yet (PRD: no "syncing" state).
 */
export async function isCached(url: string): Promise<boolean> {
	if (typeof caches === 'undefined') return false;
	try {
		return !!(await caches.match(url));
	} catch {
		return false;
	}
}

/**
 * Ask the active service worker to precache these document file URLs (the active
 * trip's artifacts, while the user presumably still has signal). No-op without a
 * controlling SW — the runtime cache-on-view path still applies.
 */
export function precacheDocuments(urls: string[]): void {
	if (typeof navigator === 'undefined' || !urls.length) return;
	navigator.serviceWorker?.controller?.postMessage({ type: 'PRECACHE_DOCS', urls });
}

/**
 * Ask the active service worker to prefetch the WHOLE active trip into cache
 * (#254): the `offline-manifest` URL list (every route + `__data.json` payload +
 * document bytes), so after one online app-open the entire active trip is
 * browsable offline. Best-effort in the SW (allSettled). No-op without a
 * controlling SW or an empty list. The caller gates this on the tz-correct
 * `isTripActive` and scopes it to the one active trip.
 */
export function prefetchTrip(urls: string[]): void {
	if (typeof navigator === 'undefined' || !urls.length) return;
	navigator.serviceWorker?.controller?.postMessage({ type: 'PREFETCH_TRIP', urls });
}

/**
 * Ask the active service worker to drop every offline cache (authenticated SSR
 * HTML + data + document bytes). Fire on logout — caches are device-scoped, so a
 * sign-out must not leave the prior account's trip readable (ADR-0010). No-op
 * without a controlling SW.
 */
export function clearOfflineCaches(): void {
	if (typeof navigator === 'undefined') return;
	navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_CACHES' });
}
