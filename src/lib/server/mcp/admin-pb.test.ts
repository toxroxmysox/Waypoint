import { describe, it, expect } from 'vitest';
import { pruneUserCache } from './admin-pb';

describe('pruneUserCache (#512)', () => {
	it('drops expired entries', () => {
		const m = new Map([
			['old', { pb: {} as never, exp: 1000 }],
			['live', { pb: {} as never, exp: 5000 }]
		]);
		pruneUserCache(m, 2000);
		expect([...m.keys()]).toEqual(['live']);
	});
	it('caps the cache, oldest first', () => {
		const m = new Map(Array.from({ length: 101 }, (_, i) => [`u${i}`, { pb: {} as never, exp: 10_000 }]));
		pruneUserCache(m, 0, 100);
		expect(m.size).toBe(99);
		expect(m.has('u0')).toBe(false);
		expect(m.has('u100')).toBe(true);
	});
});
