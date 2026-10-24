// Service-worker runtime executors (#253, ADR-0010). These perform the actual
// Cache API + fetch I/O for the strategies that `cache-policy` selects. Split out
// of `service-worker.ts` so they're importable and testable against a mocked
// Cache API + fetch — `service-worker.ts` itself can't be imported in a test
// (top-level `$service-worker` virtual import + `ServiceWorkerGlobalScope`).
//
// `cache-policy` stays PURE (classification only); this module is the I/O half.

/** Sentinel URL for the precached app shell (written at install, never fetched). */
export const SHELL_URL = '/__app_shell';

// Minimal self-contained shell: brand chrome only. Served for a cold-launch
// offline navigation that misses every cached page, instead of a raw 503.
export const SHELL_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#F6F2EA" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="Waypoint" />
<link rel="icon" href="/brand/favicon.svg" type="image/svg+xml" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png" />
<title>Waypoint</title>
<style>
html,body{margin:0;height:100%;background:#F6F2EA;color:#2B2724;font-family:Inter,system-ui,sans-serif}
.wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100%;padding:2rem;text-align:center}
.brand{font-weight:600;font-size:1.25rem;letter-spacing:-0.01em}
.msg{margin-top:.5rem;font-size:.875rem;color:#6B635B;max-width:22rem}
</style>
</head>
<body>
<div class="wrap">
<div class="brand">Waypoint</div>
<p class="msg">You're offline. Reconnect to load this page — your cached trips stay available.</p>
</div>
</body>
</html>`;

export function shellResponse(): Response {
	return new Response(SHELL_HTML, {
		status: 200,
		headers: { 'Content-Type': 'text/html; charset=utf-8' }
	});
}

/**
 * cache-first: serve the cached copy; on a miss, fetch and populate `cacheName`.
 * For immutable, content-addressed bytes (build assets, document files).
 */
export async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
	const cached = await caches.match(request);
	if (cached) return cached;
	const response = await fetch(request);
	if (response.ok) {
		const cache = await caches.open(cacheName);
		cache.put(request, response.clone());
	}
	return response;
}

/**
 * Best-effort whole-trip prefetch (#254). Fetch every URL in `urls` and store
 * each OK response into `cacheName`, isolating failures with `allSettled` so one
 * dead URL never aborts the batch (the existing document precache uses the same
 * shape). Called on app-open during the active window with the `offline-manifest`
 * list for the ONE active trip. Returns the number of URLs successfully cached
 * (observable for the glue test). Resolves even when offline — every fetch just
 * rejects and nothing is cached.
 */
export async function prefetchManifest(urls: string[], cacheName: string): Promise<number> {
	if (!urls.length) return 0;
	const cache = await caches.open(cacheName);
	const results = await Promise.allSettled(
		urls.map(async (url) => {
			const res = await fetch(url);
			if (!res.ok) throw new Error(`prefetch ${url} → ${res.status}`);
			await cache.put(url, res);
			return true;
		})
	);
	return results.filter((r) => r.status === 'fulfilled').length;
}

/**
 * How long network-first waits on the network before serving a cached copy
 * (#533). Weak signal ("lie-fi": captive portals, one bar of LTE) stalls a fetch
 * for tens of seconds instead of rejecting it, so without this a good cached
 * page sits unused behind a hung request. Only applies when a cached copy exists.
 */
export const NETWORK_TIMEOUT_MS = 3000;

/**
 * What a network-first request learned about connectivity. `network`: a response
 * arrived (the server is reachable). `degraded`: the fetch rejected or stalled
 * past the timeout, so the cache (or shell) answered instead.
 */
export type NetworkOutcome = 'network' | 'degraded';

export interface NetworkFirstOptions {
	/** Reported once per outcome; a timed-out fetch that later lands reports `network` too. */
	onOutcome?: (outcome: NetworkOutcome) => void;
	/** Keeps the SW alive for a timed-out fetch still refreshing the cache (`event.waitUntil`). */
	waitUntil?: (promise: Promise<unknown>) => void;
	timeoutMs?: number;
}

const TIMED_OUT = Symbol('timed-out');

/**
 * network-first: try the network (refreshing `cacheName`), fall back to the
 * cached copy when offline. When a cached copy exists the network gets
 * `timeoutMs`; past that the cache is served and the fetch keeps running in the
 * background to refresh it. With nothing cached it waits on the network, so a
 * slow first load still works. For a navigation, a miss while offline yields the
 * precached shell (`fallbackToShell`) instead of a 503.
 */
export async function networkFirst(
	request: Request,
	cacheName: string,
	fallbackToShell: boolean,
	{ onOutcome, waitUntil, timeoutMs = NETWORK_TIMEOUT_MS }: NetworkFirstOptions = {}
): Promise<Response> {
	// The cache write runs beside the response, not before it: awaiting it would
	// hold the page's first byte until the whole body had downloaded.
	let refreshed: Promise<unknown> = Promise.resolve();
	const network = fetch(request).then((response) => {
		onOutcome?.('network');
		if (response.ok) {
			const copy = response.clone();
			refreshed = caches
				.open(cacheName)
				.then((cache) => cache.put(request, copy))
				.catch(() => undefined); // a failed cache write (quota) must not fail the page
			waitUntil?.(refreshed);
		}
		return response;
	});
	const cached = await caches.match(request);

	try {
		if (!cached) return await network;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
			timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
		});
		const winner = await Promise.race([network, timeout]).finally(() => clearTimeout(timer));
		if (winner !== TIMED_OUT) return winner;
		onOutcome?.('degraded');
		// Let the stalled fetch finish refreshing the cache; swallow its failure.
		waitUntil?.(network.then(() => refreshed).catch(() => undefined));
		return cached;
	} catch {
		onOutcome?.('degraded');
		if (cached) return cached;
		if (fallbackToShell) {
			const shell = await caches.match(SHELL_URL);
			return shell ?? shellResponse();
		}
		return new Response('Offline', { status: 503 });
	}
}
