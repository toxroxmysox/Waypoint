/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = `waypoint-${version}`;

// App shell assets to precache
const ASSETS = [...build, ...files];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
	);
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then(async (keys) => {
			for (const key of keys) {
				if (key !== CACHE_NAME) await caches.delete(key);
			}
		})
	);
	self.clients.claim();
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);

	// Skip PocketBase API requests — always network-first
	if (url.port === '8090' || url.pathname.startsWith('/api/')) return;

	// For navigation requests, use network-first with cache fallback
	if (event.request.mode === 'navigate') {
		event.respondWith(
			fetch(event.request).catch(() => caches.match(event.request) as Promise<Response>)
		);
		return;
	}

	// For static assets, use cache-first
	event.respondWith(
		caches.match(event.request).then((cached) => {
			return cached ?? fetch(event.request);
		})
	);
});
