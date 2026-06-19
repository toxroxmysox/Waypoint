import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { cacheFirst, networkFirst, SHELL_URL, SHELL_HTML } from './sw-runtime';

// ── Minimal in-memory Cache Storage mock ──────────────────────────────────────
// Keys entries by request URL string (enough for these strategies). `caches.match`
// searches every open cache, mirroring the real global behavior.

function keyOf(req: RequestInfo | URL): string {
	if (typeof req === 'string') return req;
	if (req instanceof URL) return req.toString();
	return (req as Request).url;
}

class MockCache {
	store = new Map<string, Response>();
	async match(req: RequestInfo | URL): Promise<Response | undefined> {
		return this.store.get(keyOf(req));
	}
	async put(req: RequestInfo | URL, res: Response): Promise<void> {
		this.store.set(keyOf(req), res);
	}
}

class MockCacheStorage {
	caches = new Map<string, MockCache>();
	async open(name: string): Promise<MockCache> {
		let c = this.caches.get(name);
		if (!c) {
			c = new MockCache();
			this.caches.set(name, c);
		}
		return c;
	}
	async match(req: RequestInfo | URL): Promise<Response | undefined> {
		for (const c of this.caches.values()) {
			const hit = await c.match(req);
			if (hit) return hit;
		}
		return undefined;
	}
	async keys(): Promise<string[]> {
		return [...this.caches.keys()];
	}
}

const ORIGIN = 'https://waypoint.test';
let mockCaches: MockCacheStorage;

beforeEach(() => {
	mockCaches = new MockCacheStorage();
	vi.stubGlobal('caches', mockCaches);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

/** Seed a cache with a response for a URL. */
async function seed(cacheName: string, url: string, body: string, status = 200) {
	const cache = await mockCaches.open(cacheName);
	await cache.put(new Request(url), new Response(body, { status }));
}

describe('cacheFirst', () => {
	it('returns the cached copy without touching the network', async () => {
		await seed('static', `${ORIGIN}/_app/x.js`, 'cached-asset');
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);

		const res = await cacheFirst(new Request(`${ORIGIN}/_app/x.js`), 'static');

		expect(await res.text()).toBe('cached-asset');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('fetches and populates the cache on a miss', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('fresh-asset', { status: 200 }))
		);

		const res = await cacheFirst(new Request(`${ORIGIN}/_app/y.js`), 'static');
		expect(await res.text()).toBe('fresh-asset');

		// Second call now hits the cache (no second fetch).
		const cache = await mockCaches.open('static');
		const stored = await cache.match(new Request(`${ORIGIN}/_app/y.js`));
		expect(stored).toBeDefined();
		expect(await stored!.text()).toBe('fresh-asset');
	});

	it('does NOT cache a non-ok response', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('nope', { status: 404 }))
		);

		await cacheFirst(new Request(`${ORIGIN}/_app/z.js`), 'static');
		const stored = await mockCaches.match(new Request(`${ORIGIN}/_app/z.js`));
		expect(stored).toBeUndefined();
	});
});

describe('networkFirst', () => {
	it('serves the network response and refreshes the cache when online', async () => {
		await seed('data', `${ORIGIN}/trips/paris`, 'STALE');
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('FRESH', { status: 200 }))
		);

		const res = await networkFirst(new Request(`${ORIGIN}/trips/paris`), 'data', true);
		expect(await res.text()).toBe('FRESH');

		// Cache was refreshed with the fresh copy.
		const stored = await mockCaches.match(new Request(`${ORIGIN}/trips/paris`));
		expect(await stored!.text()).toBe('FRESH');
	});

	it('falls back to the cached page when the network is offline (offline nav → cached page)', async () => {
		await seed('data', `${ORIGIN}/trips/paris`, 'CACHED-PAGE');
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('Failed to fetch');
			})
		);

		const res = await networkFirst(new Request(`${ORIGIN}/trips/paris`), 'data', true);
		expect(await res.text()).toBe('CACHED-PAGE');
	});

	it('serves the precached shell on an offline navigation MISS (cold-launch offline)', async () => {
		await mockCaches
			.open('static')
			.then((c) => c.put(new Request(`${ORIGIN}${SHELL_URL}`), new Response(SHELL_HTML)));
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('Failed to fetch');
			})
		);

		// `caches.match(SHELL_URL)` is called with the bare sentinel string; seed it
		// under that exact key so the match resolves.
		const shellCache = await mockCaches.open('static');
		await shellCache.put(SHELL_URL, new Response(SHELL_HTML));

		const res = await networkFirst(
			new Request(`${ORIGIN}/never-visited`),
			'data',
			/* fallbackToShell */ true
		);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain('Waypoint');
	});

	it('synthesizes a shell even if the precached shell is missing (defensive)', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('offline');
			})
		);

		const res = await networkFirst(new Request(`${ORIGIN}/cold`), 'data', true);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain('Waypoint');
	});

	it('returns 503 (not a shell) on an offline MISS when shell fallback is off (e.g. __data.json)', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('offline');
			})
		);

		const res = await networkFirst(
			new Request(`${ORIGIN}/trips/paris/__data.json`),
			'data',
			/* fallbackToShell */ false
		);
		expect(res.status).toBe(503);
	});

	it('does NOT cache a non-ok network response', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('err', { status: 500 }))
		);

		const res = await networkFirst(new Request(`${ORIGIN}/trips/x`), 'data', true);
		expect(res.status).toBe(500);
		const stored = await mockCaches.match(new Request(`${ORIGIN}/trips/x`));
		expect(stored).toBeUndefined();
	});
});
