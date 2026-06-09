// Client helpers for the Documents offline cache (S5, #74). The service worker
// owns the cache; these talk to it via Cache Storage (read) and postMessage
// (precache request). Browser-only — guarded for SSR.

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
