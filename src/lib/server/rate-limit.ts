// Server-only. NEVER import into a client-reachable path — this module holds
// process-wide mutable state (token buckets + a cache) keyed by user id.
//
// Deploy assumption (#285): Waypoint runs as a SINGLE adapter-node container on
// basecamp, so in-process / in-memory state is correct and sufficient. There is
// exactly one Node process serving all requests; no external store (Redis etc.)
// is needed. If this is ever scaled to multiple replicas, this must move to a
// shared store — the per-instance buckets would otherwise each grant the full
// allowance and the cache would not be shared.

/** Injectable clock so refill/expiry is unit-testable without mocking Date. */
export type Clock = () => number;
const defaultClock: Clock = () => Date.now();

// ---------------------------------------------------------------------------
// Token bucket
// ---------------------------------------------------------------------------
//
// Per-user, per-route-family limiter. Pre-approved limits (#285):
//   - sustained 120 requests / minute  -> refill rate = 120/60 = 2 tokens/sec
//   - burst ceiling 240                -> bucket capacity = 240
// Each allowed request costs 1 token. When the bucket is empty the request is
// denied (the route returns HTTP 429).

export interface TokenBucketOptions {
	/** Max tokens the bucket can hold (burst ceiling). */
	capacity: number;
	/** Tokens added per second (sustained rate). */
	refillPerSecond: number;
	/** Injectable clock (ms epoch). Defaults to Date.now. */
	clock?: Clock;
}

interface BucketState {
	tokens: number;
	last: number; // ms epoch of last refill
}

export class TokenBucket {
	private readonly capacity: number;
	private readonly refillPerSecond: number;
	private readonly clock: Clock;
	private readonly buckets = new Map<string, BucketState>();

	constructor(opts: TokenBucketOptions) {
		this.capacity = opts.capacity;
		this.refillPerSecond = opts.refillPerSecond;
		this.clock = opts.clock ?? defaultClock;
	}

	/**
	 * Attempt to consume one token for `key`. Returns true if allowed, false if
	 * the bucket is empty (caller should respond 429).
	 */
	tryRemove(key: string, cost = 1): boolean {
		const now = this.clock();
		let b = this.buckets.get(key);
		if (!b) {
			b = { tokens: this.capacity, last: now };
			this.buckets.set(key, b);
		} else {
			const elapsedSec = Math.max(0, (now - b.last) / 1000);
			b.tokens = Math.min(this.capacity, b.tokens + elapsedSec * this.refillPerSecond);
			b.last = now;
		}

		if (b.tokens >= cost) {
			b.tokens -= cost;
			return true;
		}
		return false;
	}

	/** Current (refilled) token count for a key — test/introspection only. */
	peek(key: string): number {
		const b = this.buckets.get(key);
		if (!b) return this.capacity;
		const now = this.clock();
		const elapsedSec = Math.max(0, (now - b.last) / 1000);
		return Math.min(this.capacity, b.tokens + elapsedSec * this.refillPerSecond);
	}

	/** Drop all state — test isolation only. */
	reset(): void {
		this.buckets.clear();
	}
}

// ---------------------------------------------------------------------------
// TTL cache
// ---------------------------------------------------------------------------
//
// Tiny in-memory key -> value cache with per-entry TTL. Lazy expiry on read
// plus opportunistic eviction of expired entries on write, so an unbounded set
// of one-shot keys cannot leak indefinitely while the process is live. A hard
// `maxEntries` cap evicts the oldest-inserted entry (FIFO) as a backstop.

export interface TtlCacheOptions {
	/** Time-to-live for each entry, in milliseconds. */
	ttlMs: number;
	/** Hard cap on live entries; oldest-inserted evicted past this. */
	maxEntries?: number;
	/** Injectable clock (ms epoch). Defaults to Date.now. */
	clock?: Clock;
}

interface CacheEntry<V> {
	value: V;
	expires: number; // ms epoch
}

export class TtlCache<V> {
	private readonly ttlMs: number;
	private readonly maxEntries: number;
	private readonly clock: Clock;
	private readonly store = new Map<string, CacheEntry<V>>();

	constructor(opts: TtlCacheOptions) {
		this.ttlMs = opts.ttlMs;
		this.maxEntries = opts.maxEntries ?? 5000;
		this.clock = opts.clock ?? defaultClock;
	}

	get(key: string): V | undefined {
		const e = this.store.get(key);
		if (!e) return undefined;
		if (this.clock() >= e.expires) {
			this.store.delete(key);
			return undefined;
		}
		return e.value;
	}

	set(key: string, value: V): void {
		const now = this.clock();
		// Opportunistically drop expired entries so churn doesn't grow the map.
		if (this.store.size >= this.maxEntries) {
			for (const [k, e] of this.store) {
				if (now >= e.expires) this.store.delete(k);
			}
			// Still over cap? Evict oldest-inserted (Map preserves insertion order).
			while (this.store.size >= this.maxEntries) {
				const oldest = this.store.keys().next().value;
				if (oldest === undefined) break;
				this.store.delete(oldest);
			}
		}
		// Re-set moves the key to the end of insertion order (refresh FIFO position).
		this.store.delete(key);
		this.store.set(key, { value, expires: now + this.ttlMs });
	}

	has(key: string): boolean {
		return this.get(key) !== undefined;
	}

	/** Drop all state — test isolation only. */
	reset(): void {
		this.store.clear();
	}
}

// ---------------------------------------------------------------------------
// Shared singletons used by the enrichment routes
// ---------------------------------------------------------------------------

const MINUTE = 60;
/** Sustained: 120 req/min => 2 tokens/sec. Burst ceiling: 240. */
const SUSTAINED_PER_MINUTE = 120;
const BURST_CAPACITY = 240;

/**
 * One bucket instance per route family. Buckets are keyed internally by user id
 * (see {@link checkRateLimit}), so each family throttles independently — a user
 * hammering autocomplete does not consume their flights budget.
 */
const buckets = {
	'places-autocomplete': new TokenBucket({
		capacity: BURST_CAPACITY,
		refillPerSecond: SUSTAINED_PER_MINUTE / MINUTE
	}),
	'places-details': new TokenBucket({
		capacity: BURST_CAPACITY,
		refillPerSecond: SUSTAINED_PER_MINUTE / MINUTE
	}),
	'flights-lookup': new TokenBucket({
		capacity: BURST_CAPACITY,
		refillPerSecond: SUSTAINED_PER_MINUTE / MINUTE
	})
} as const;

export type RouteFamily = keyof typeof buckets;

/**
 * Consume one token for (family, userId). Returns true if the request may
 * proceed, false if the per-user cap is exceeded (caller responds 429).
 */
export function checkRateLimit(family: RouteFamily, userId: string): boolean {
	return buckets[family].tryRemove(userId);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** places/details responses keyed by place_id. Stable data — TTL ~30 days. */
export const placeDetailsCache = new TtlCache<unknown>({ ttlMs: 30 * DAY_MS });

/** flights/lookup responses keyed by `${flight}|${date}`. TTL ~6 hours. */
export const flightLookupCache = new TtlCache<unknown>({ ttlMs: 6 * HOUR_MS });
