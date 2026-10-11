import { describe, it, expect } from 'vitest';
import { sanitizeItemSpan } from './item-span';

// #411 — the span rule items.pb.js enforces: an end_date needs a start day, falls
// after it, and on/before the trip end. Writers that copy spans (clone, import)
// drop one that can't hold instead of tripping the hook mid-way.
describe('sanitizeItemSpan', () => {
	it('keeps a span after the day and within the trip', () => {
		expect(sanitizeItemSpan('2026-06-01', '2026-06-03 00:00:00.000Z', '2026-06-03')).toBe('2026-06-03 00:00:00.000Z');
	});
	it('drops a span with no start day', () => {
		expect(sanitizeItemSpan('', '2026-06-03 00:00:00.000Z', '2026-06-03')).toBe('');
	});
	it('drops a span ending on or before the start day', () => {
		expect(sanitizeItemSpan('2026-06-02', '2026-06-02 00:00:00.000Z', '2026-06-05')).toBe('');
		expect(sanitizeItemSpan('2026-06-02', '2026-06-01', '2026-06-05')).toBe('');
	});
	it('drops a span past the trip end', () => {
		expect(sanitizeItemSpan('2026-06-01', '2026-06-04', '2026-06-03')).toBe('');
	});
	it('passes through an empty span', () => {
		expect(sanitizeItemSpan('2026-06-01', '', '2026-06-03')).toBe('');
		expect(sanitizeItemSpan('2026-06-01', null, '2026-06-03')).toBe('');
	});
	it('accepts datetime day and trip-end inputs', () => {
		expect(sanitizeItemSpan('2026-06-01 00:00:00.000Z', '2026-06-02', '2026-06-03 00:00:00.000Z')).toBe('2026-06-02');
	});
});
