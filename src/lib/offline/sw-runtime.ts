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
 * network-first: try the network (refreshing `cacheName`), fall back to the
 * cached copy when offline. For a navigation, a cache miss while offline yields
 * the precached shell (`fallbackToShell`) instead of a 503.
 */
export async function networkFirst(
	request: Request,
	cacheName: string,
	fallbackToShell: boolean
): Promise<Response> {
	try {
		const response = await fetch(request);
		if (response.ok) {
			const cache = await caches.open(cacheName);
			cache.put(request, response.clone());
		}
		return response;
	} catch {
		const cached = await caches.match(request);
		if (cached) return cached;
		if (fallbackToShell) {
			const shell = await caches.match(SHELL_URL);
			return shell ?? shellResponse();
		}
		return new Response('Offline', { status: 503 });
	}
}
