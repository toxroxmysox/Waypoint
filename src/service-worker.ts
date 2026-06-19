/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Thin service-worker shell over the pure `cache-policy` module (#253, ADR-0010).
// All routing decisions live in `cache-policy`; this file only executes them:
// precache the app shell + build assets at install, then apply the chosen
// strategy (cache-first / network-first / passthrough) to each GET. Caches are
// device-scoped and version-namespaced — old versions are evicted on activate
// and the whole set is cleared on logout (CLEAR_CACHES message).

import { build, files, version } from '$service-worker';
import { decideStrategy } from '$lib/offline/cache-policy';
import { SHELL_URL, cacheFirst, networkFirst, shellResponse } from '$lib/offline/sw-runtime';

declare const self: ServiceWorkerGlobalScope;

// One namespace per build version. Bumping `version` (SvelteKit does this per
// build) orphans the previous set, which `activate` then evicts.
const STATIC_CACHE = `waypoint-static-${version}`;
const DATA_CACHE = `waypoint-data-${version}`;
// Document artifact bytes (S5, #74). Populated by precache (active trip) and by
// cache-first runtime caching (planning mode). Bytes are immutable per record.
const DOCS_CACHE = `waypoint-docs-${version}`;

const CURRENT_CACHES = [STATIC_CACHE, DATA_CACHE, DOCS_CACHE];

const ASSETS = [...build, ...files];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(STATIC_CACHE).then(async (cache) => {
			await cache.addAll(ASSETS);
			// Precache the app shell so a cold-launch offline always renders.
			await cache.put(SHELL_URL, shellResponse());
		})
	);
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then(async (keys) => {
			for (const key of keys) {
				if (!CURRENT_CACHES.includes(key)) await caches.delete(key);
			}
			await self.clients.claim();
		})
	);
});

self.addEventListener('message', (event) => {
	const data = event.data;
	if (data?.type === 'PRECACHE_DOCS') {
		// Precache the active trip's documents while online. Per-URL fetch+put so
		// one failure doesn't abort the batch (unlike cache.addAll).
		const urls: string[] = data.urls ?? [];
		event.waitUntil(
			caches.open(DOCS_CACHE).then((cache) =>
				Promise.allSettled(
					urls.map(async (url) => {
						const res = await fetch(url);
						if (res.ok) await cache.put(url, res);
					})
				)
			)
		);
	} else if (data?.type === 'CLEAR_CACHES') {
		// Logout: caches hold authenticated SSR HTML + data, so they're device-scoped
		// and wiped on sign-out (ADR-0010). Drop every waypoint-* cache.
		event.waitUntil(
			caches.keys().then((keys) =>
				Promise.all(keys.filter((k) => k.startsWith('waypoint-')).map((k) => caches.delete(k)))
			)
		);
	}
});

self.addEventListener('fetch', (event) => {
	const strategy = decideStrategy(event.request, self.location.origin);

	switch (strategy.kind) {
		case 'cache-first': {
			// Build assets land in STATIC_CACHE; document bytes in DOCS_CACHE.
			const url = new URL(event.request.url);
			const cacheName = url.pathname.includes('/_app/') ? STATIC_CACHE : DOCS_CACHE;
			event.respondWith(cacheFirst(event.request, cacheName));
			return;
		}
		case 'network-first':
			event.respondWith(networkFirst(event.request, DATA_CACHE, strategy.fallbackToShell));
			return;
		default:
			// passthrough: let the browser handle it (default fetch). Not respondWith'd.
			return;
	}
});
