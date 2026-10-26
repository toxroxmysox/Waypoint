import { describe, it, expect } from 'vitest';
import { cachedAt, formatAsOf } from './snapshot-time';

const res = (date?: string) => new Response('', { headers: date ? { date } : {} });

describe('cachedAt (#534)', () => {
	it("reads the cached page's Date header, not the clock", async () => {
		const match = async (u: string) =>
			u === 'https://w.test/trips/porto/now' ? res('Tue, 14 Oct 2026 21:40:00 GMT') : undefined;
		expect(await cachedAt(new URL('https://w.test/trips/porto/now'), match)).toBe(
			Date.parse('2026-10-14T21:40:00Z')
		);
	});
	it('takes the newer of the page and its __data.json (a client-side navigation)', async () => {
		const match = async (u: string, o?: CacheQueryOptions) =>
			u.endsWith('/__data.json') && o?.ignoreSearch
				? res('Wed, 15 Oct 2026 08:00:00 GMT')
				: res('Tue, 14 Oct 2026 21:40:00 GMT');
		expect(await cachedAt(new URL('https://w.test/trips/porto/now?x=1'), match)).toBe(
			Date.parse('2026-10-15T08:00:00Z')
		);
	});
	it('returns null when nothing is cached or the header is missing/garbled', async () => {
		expect(await cachedAt(new URL('https://w.test/a'), async () => undefined)).toBeNull();
		expect(await cachedAt(new URL('https://w.test/a'), async () => res())).toBeNull();
		expect(await cachedAt(new URL('https://w.test/a'), async () => res('nope'))).toBeNull();
	});
	it('returns null when the Cache API throws or is missing', async () => {
		expect(
			await cachedAt(new URL('https://w.test/a'), async () => {
				throw new Error('SecurityError');
			})
		).toBeNull();
	});
});

describe('formatAsOf (#534)', () => {
	const now = new Date(2026, 9, 15, 10, 0).getTime();
	it('time only for today', () => {
		const t = new Date(2026, 9, 15, 7, 5).getTime();
		const s = formatAsOf(t, now, 'en-US');
		expect(s).toMatch(/7:05/);
		expect(s).not.toMatch(/Oct/);
	});
	it('date and time for an older snapshot', () => {
		const s = formatAsOf(new Date(2026, 9, 14, 21, 40).getTime(), now, 'en-US');
		expect(s).toMatch(/Oct 14/);
		expect(s).toMatch(/9:40/);
	});
	it('null in, null out', () => {
		expect(formatAsOf(null, now)).toBeNull();
	});
});
