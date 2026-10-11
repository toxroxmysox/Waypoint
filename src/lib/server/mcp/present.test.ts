import { describe, expect, it } from 'vitest';
import { result, scrub, offTrip, type Card } from './present';
import type { Trip } from '$lib/types';

describe('scrub', () => {
	it('removes email addresses in any case and shape', () => {
		const out = scrub({
			a: 'Abby@Example.COM',
			b: 'write mailto:x@y.io now',
			c: '<a href="mailto:a@b.co">host</a>',
			d: ['nested z@z.dev']
		});
		const s = JSON.stringify(out);
		expect(s).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
		expect(s).not.toContain('mailto:');
		expect(out.a).toBe('[email removed]');
	});

	it('removes PocketBase file URLs', () => {
		const out = scrub({ u: 'see https://app.example/pb/api/files/abc/def/photo.jpg?token=x ok' });
		expect(out.u).toBe('see [file removed] ok');
	});

	it('leaves ordinary text alone', () => {
		expect(scrub({ t: 'Hotel @ Lucerne, 10:30–11:00' }).t).toBe('Hotel @ Lucerne, 10:30–11:00');
	});
});

describe('result', () => {
	const cards: Card[] = Array.from({ length: 60 }, (_, i) => ({ emoji: '•', title: `c${i}`, lines: [] }));

	it('caps at 50 cards and says how many more', () => {
		const r = result('Things', cards);
		expect(r.structuredContent.cards).toHaveLength(50);
		expect(r.structuredContent.heading).toBe('Things +10 more');
		expect(r.content[0].text).toContain('+10 more');
	});

	it('scrubs both the text and the structured content', () => {
		const r = result('H', [{ emoji: '•', title: 'x@y.io', lines: ['mailto:q@w.io'] }]);
		expect(JSON.stringify(r)).not.toMatch(/@[a-z]+\.io/);
	});
});

describe('offTrip', () => {
	it('shows only name, dates and the notice', () => {
		const trip = { id: 't', title: 'Private', start_date: '2026-11-01 00:00:00.000Z', end_date: '2026-11-03 00:00:00.000Z' } as Trip;
		const r = offTrip(trip);
		expect(r.structuredContent.heading).toBe('Private');
		expect(r.content[0].text).toContain('AI access is turned off for this trip by its owner.');
		expect(r.content[0].text).toContain('2026-11-01 → 2026-11-03');
	});
});
