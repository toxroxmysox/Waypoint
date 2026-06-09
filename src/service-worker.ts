/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';
import { isDocumentFilePath } from '$lib/documents/offline-cache';

declare const self: ServiceWorkerGlobalScope;

const STATIC_CACHE = `waypoint-static-${version}`;
const DATA_CACHE = `waypoint-data-${version}`;
// Document artifact bytes (S5, #74). Populated by precache (active trip) and by
// cache-on-view runtime caching (planning mode). Bytes are immutable per record.
const DOCS_CACHE = `waypoint-docs-${version}`;

const ASSETS = [...build, ...files];

let offlineMode = false;

self.addEventListener('message', (event) => {
	if (event.data?.type === 'SET_OFFLINE') {
		offlineMode = event.data.offline;
	} else if (event.data?.type === 'PRECACHE_DOCS') {
		// Precache the active trip's documents while online. Per-URL fetch+put so
		// one failure doesn't abort the batch (unlike cache.addAll).
		const urls: string[] = event.data.urls ?? [];
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
	}
});

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(STATIC_CACHE).then((cache) => cache.addAll(ASSETS))
	);
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then(async (keys) => {
			for (const key of keys) {
				if (key !== STATIC_CACHE && key !== DATA_CACHE && key !== DOCS_CACHE) {
					await caches.delete(key);
				}
			}
		})
	);
	self.clients.claim();
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);

	// Document artifact bytes — cache-first (immutable per record). A miss falls
	// through to the network and populates DOCS_CACHE (cache-on-view for planning
	// mode); precache puts the active trip's files here ahead of time. Serves
	// offline once cached regardless of token expiry — we cache the bytes.
	if (isDocumentFilePath(url.pathname)) {
		event.respondWith(
			caches.match(event.request).then((cached) => {
				if (cached) return cached;
				return fetch(event.request)
					.then(async (response) => {
						if (response.ok) {
							const cache = await caches.open(DOCS_CACHE);
							cache.put(event.request, response.clone());
						}
						return response;
					})
					.catch(() => new Response('Offline', { status: 503 }));
			})
		);
		return;
	}

	// PocketBase API requests — network-first with data cache fallback
	const isPBApi = url.port === '8090' || url.pathname.startsWith('/api/');

	if (isPBApi) {
		if (offlineMode) {
			// In explicit offline mode, serve from cache only
			event.respondWith(
				caches.match(event.request).then((cached) => {
					return cached ?? new Response(
						JSON.stringify({ error: 'Offline' }),
						{ status: 503, headers: { 'Content-Type': 'application/json' } }
					);
				})
			);
			return;
		}

		// Network-first: try network, cache the response, fallback to cache
		event.respondWith(
			fetch(event.request)
				.then(async (response) => {
					if (response.ok) {
						const cache = await caches.open(DATA_CACHE);
						cache.put(event.request, response.clone());
					}
					return response;
				})
				.catch(() =>
					caches.match(event.request).then((cached) => {
						return cached ?? new Response(
							JSON.stringify({ error: 'Offline' }),
							{ status: 503, headers: { 'Content-Type': 'application/json' } }
						);
					})
				)
		);
		return;
	}

	// Navigation requests — network-first with cache fallback
	if (event.request.mode === 'navigate') {
		event.respondWith(
			fetch(event.request).catch(async () => {
				const cached = await caches.match(event.request);
				return cached ?? new Response('Offline', {
					status: 503,
					headers: { 'Content-Type': 'text/html' }
				});
			})
		);
		return;
	}

	// Static assets — cache-first
	event.respondWith(
		caches.match(event.request).then((cached) => {
			return cached ?? fetch(event.request);
		})
	);
});
