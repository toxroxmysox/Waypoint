import { describe, it, expect } from 'vitest';
import { TokenBucket, TtlCache } from './rate-limit';

describe('TokenBucket', () => {
	it('allows up to the burst ceiling (capacity) immediately, then denies', () => {
		let now = 0;
		const bucket = new TokenBucket({
			capacity: 240,
			refillPerSecond: 2, // 120/min
			clock: () => now
		});

		// 240 burst allowed back-to-back at t=0 (no refill time elapses).
		let allowed = 0;
		for (let i = 0; i < 240; i++) {
			if (bucket.tryRemove('user-1')) allowed++;
		}
		expect(allowed).toBe(240);

		// 241st in the same instant is denied -> route would respond 429.
		expect(bucket.tryRemove('user-1')).toBe(false);
	});

	it('refills at refillPerSecond and never exceeds capacity', () => {
		let now = 0;
		const bucket = new TokenBucket({
			capacity: 240,
			refillPerSecond: 2,
			clock: () => now
		});

		// Drain the bucket.
		for (let i = 0; i < 240; i++) bucket.tryRemove('user-2');
		expect(bucket.tryRemove('user-2')).toBe(false);

		// 1 second later: +2 tokens -> exactly two more allowed, third denied.
		now += 1000;
		expect(bucket.tryRemove('user-2')).toBe(true);
		expect(bucket.tryRemove('user-2')).toBe(true);
		expect(bucket.tryRemove('user-2')).toBe(false);

		// A very long idle does not over-fill past capacity.
		now += 60 * 60 * 1000; // 1 hour
		expect(bucket.peek('user-2')).toBe(240);
	});

	it('isolates buckets per key (one user cannot drain another)', () => {
		let now = 0;
		const bucket = new TokenBucket({ capacity: 3, refillPerSecond: 1, clock: () => now });

		expect(bucket.tryRemove('a')).toBe(true);
		expect(bucket.tryRemove('a')).toBe(true);
		expect(bucket.tryRemove('a')).toBe(true);
		expect(bucket.tryRemove('a')).toBe(false); // a is drained
		expect(bucket.tryRemove('b')).toBe(true); // b is untouched
	});

	it('refills fractionally over sub-second intervals', () => {
		let now = 0;
		const bucket = new TokenBucket({ capacity: 10, refillPerSecond: 2, clock: () => now });
		for (let i = 0; i < 10; i++) bucket.tryRemove('u');
		expect(bucket.tryRemove('u')).toBe(false);
		now += 500; // half a second -> +1 token at 2/sec
		expect(bucket.tryRemove('u')).toBe(true);
		expect(bucket.tryRemove('u')).toBe(false);
	});
});

describe('TtlCache', () => {
	it('returns a cached value within the TTL (hit)', () => {
		let now = 0;
		const cache = new TtlCache<string>({ ttlMs: 1000, clock: () => now });
		cache.set('k', 'v');
		now += 999; // still inside TTL
		expect(cache.get('k')).toBe('v');
		expect(cache.has('k')).toBe(true);
	});

	it('expires after the TTL (miss)', () => {
		let now = 0;
		const cache = new TtlCache<string>({ ttlMs: 1000, clock: () => now });
		cache.set('k', 'v');
		now += 1000; // at/after expiry boundary
		expect(cache.get('k')).toBeUndefined();
		expect(cache.has('k')).toBe(false);
	});

	it('re-set after expiry restores the value with a fresh TTL', () => {
		let now = 0;
		const cache = new TtlCache<number>({ ttlMs: 100, clock: () => now });
		cache.set('k', 1);
		now += 100;
		expect(cache.get('k')).toBeUndefined();
		cache.set('k', 2);
		expect(cache.get('k')).toBe(2);
		now += 99;
		expect(cache.get('k')).toBe(2);
	});

	it('evicts oldest-inserted entries past maxEntries', () => {
		let now = 0;
		const cache = new TtlCache<number>({ ttlMs: 1_000_000, maxEntries: 2, clock: () => now });
		cache.set('a', 1);
		cache.set('b', 2);
		cache.set('c', 3); // forces eviction of 'a' (oldest, still live)
		expect(cache.get('a')).toBeUndefined();
		expect(cache.get('b')).toBe(2);
		expect(cache.get('c')).toBe(3);
	});
});
