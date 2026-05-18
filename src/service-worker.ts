/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const STATIC_CACHE = `waypoint-static-${version}`;
const DATA_CACHE = `waypoint-data-${version}`;

const ASSETS = [...build, ...files];

let offlineMode = false;

self.addEventListener('message', (event) => {
	if (event.data?.type === 'SET_OFFLINE') {
		offlineMode = event.data.offline;
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
				if (key !== STATIC_CACHE && key !== DATA_CACHE) {
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
			fetch(event.request).catch(() =>
				caches.match(event.request) as Promise<Response>
			)
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
