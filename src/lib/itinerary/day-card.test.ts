import { describe, it, expect } from 'vitest';
import { summarizeDay, summarizeDays } from './day-card';
import type { Item, Day } from '$lib/types';

const days = [
	{ id: 'd1', date: '2026-06-18 00:00:00.000Z' },
	{ id: 'd2', date: '2026-06-19 00:00:00.000Z' },
	{ id: 'd3', date: '2026-06-20 00:00:00.000Z' }
] as Day[];

function item(over: Partial<Item> = {}): Item {
	return {
		id: 'i',
		day: 'd1',
		end_date: '',
		type: 'activity',
		status: 'planned',
		booked: false,
		requires_booking: false,
		cost_estimate_usd: 0,
		title: '',
		...over
	} as Item;
}

describe('summarizeDay — item count (sole fullness signal)', () => {
	it('counts timed and untimed day-scoped items alike', () => {
		const items = [
			item({ id: 'a', start_time: '2026-06-18 09:00:00.000Z' }),
			item({ id: 'b', start_time: '' })
		];
		expect(summarizeDay(items, days, days[0]).itemCount).toBe(2);
	});

	it('excludes multi-day banners (end_date set)', () => {
		const items = [
			item({ id: 'a' }),
			item({ id: 'hotel', type: 'lodging', end_date: '2026-06-20 00:00:00.000Z' })
		];
		expect(summarizeDay(items, days, days[0]).itemCount).toBe(1);
	});

	it('excludes items on other days', () => {
		const items = [item({ id: 'a', day: 'd1' }), item({ id: 'b', day: 'd2' })];
		expect(summarizeDay(items, days, days[0]).itemCount).toBe(1);
	});

	it('excludes parking-lot items (no day)', () => {
		const items = [item({ id: 'a', day: 'd1' }), item({ id: 'p', day: '', status: 'unplanned' })];
		expect(summarizeDay(items, days, days[0]).itemCount).toBe(1);
	});
});

describe('summarizeDay — booked metric', () => {
	it('bookableCount = booked + needs-booking; bookedCount = booked', () => {
		const items = [
			item({ id: 'a', booked: true, requires_booking: true }),
			item({ id: 'b', booked: false, requires_booking: true }), // needs booking
			item({ id: 'c', booked: false, requires_booking: false }) // not bookable
		];
		const s = summarizeDay(items, days, days[0]);
		expect(s.bookedCount).toBe(1);
		expect(s.bookableCount).toBe(2);
	});

	it('needs-booking only counts planned items', () => {
		const items = [
			item({ id: 'a', status: 'done', requires_booking: true, booked: false }),
			item({ id: 'b', status: 'planned', requires_booking: true, booked: false })
		];
		const s = summarizeDay(items, days, days[0]);
		expect(s.bookableCount).toBe(1);
	});
});

describe('summarizeDay — budget metric', () => {
	it('sums cost_estimate_usd over day-scoped items only', () => {
		const items = [
			item({ id: 'a', cost_estimate_usd: 100 }),
			item({ id: 'b', cost_estimate_usd: 50 }),
			item({ id: 'other', day: 'd2', cost_estimate_usd: 999 }),
			item({ id: 'hotel', end_date: '2026-06-20 00:00:00.000Z', cost_estimate_usd: 777 })
		];
		expect(summarizeDay(items, days, days[0]).budgetTotal).toBe(150);
	});
});

describe('summarizeDay — stay chips: state-change only (check-in / check-out)', () => {
	const hotel = item({
		id: 'h',
		type: 'lodging',
		day: 'd1',
		end_date: '2026-06-20 00:00:00.000Z'
	});

	it('check-in day emits 1 chip with kind=check-in', () => {
		expect(summarizeDay([hotel], days, days[0]).stays).toEqual([{ kind: 'check-in', name: '' }]);
	});

	it('middle (staying) day emits NO chip', () => {
		expect(summarizeDay([hotel], days, days[1]).stays).toEqual([]);
	});

	it('check-out day emits 1 chip with kind=check-out', () => {
		expect(summarizeDay([hotel], days, days[2]).stays).toEqual([{ kind: 'check-out', name: '' }]);
	});

	it('uses the lodging title as the name', () => {
		const named = item({ id: 'h', type: 'lodging', day: 'd1', end_date: '2026-06-20 00:00:00.000Z', title: 'Hotel Splendide' });
		expect(summarizeDay([named], days, days[0]).stays[0]?.name).toBe('Hotel Splendide');
	});

	it('is empty when no lodging spans the date', () => {
		expect(summarizeDay([item()], days, days[0]).stays).toEqual([]);
	});

	it('ignores non-lodging multi-day items', () => {
		const train = item({ id: 't', type: 'transportation', day: 'd1', end_date: '2026-06-20 00:00:00.000Z' });
		expect(summarizeDay([train], days, days[0]).stays).toEqual([]);
	});

	// 3-night lodging: only check-in + check-out emit chips; middle day is blank.
	it('3-night lodging: check-in=1 chip, middle=0, check-out=1 chip', () => {
		const h3 = item({ id: 'h3', type: 'lodging', day: 'd1', end_date: '2026-06-20 00:00:00.000Z' });
		expect(summarizeDay([h3], days, days[0]).stays).toHaveLength(1); // check-in
		expect(summarizeDay([h3], days, days[1]).stays).toHaveLength(0); // staying → blank
		expect(summarizeDay([h3], days, days[2]).stays).toHaveLength(1); // check-out
	});

	// Two lodgings both check in on the same day → 2 chips.
	it('two lodgings checking in the same day emits 2 chips', () => {
		const a = item({ id: 'ha', type: 'lodging', day: 'd1', end_date: '2026-06-19 00:00:00.000Z', title: 'Hotel A' });
		const b = item({ id: 'hb', type: 'lodging', day: 'd1', end_date: '2026-06-20 00:00:00.000Z', title: 'Hotel B' });
		const stays = summarizeDay([a, b], days, days[0]).stays;
		expect(stays).toHaveLength(2);
		expect(stays.map((s) => s.kind)).toEqual(['check-in', 'check-in']);
		expect(stays.map((s) => s.name)).toEqual(['Hotel A', 'Hotel B']);
	});

	// Two lodgings both checking out on the same day → 2 chips.
	// Both start on d1, both end on d2 (June 19) — so on d2 both emit check-out.
	it('two lodgings checking out the same day emits 2 chips', () => {
		const a = item({ id: 'xa', type: 'lodging', day: 'd1', end_date: '2026-06-19 00:00:00.000Z', title: 'Place A' });
		const b = item({ id: 'xb', type: 'lodging', day: 'd1', end_date: '2026-06-19 00:00:00.000Z', title: 'Place B' });
		const stays = summarizeDay([a, b], days, days[1]).stays;
		expect(stays).toHaveLength(2);
		expect(stays.map((s) => s.kind)).toEqual(['check-out', 'check-out']);
	});
});

describe('summarizeDays — keyed by day id', () => {
	it('returns a summary for every day', () => {
		const items = [item({ id: 'a', day: 'd1' }), item({ id: 'b', day: 'd2' })];
		const map = summarizeDays(items, days);
		expect(Object.keys(map).sort()).toEqual(['d1', 'd2', 'd3']);
		expect(map.d1.itemCount).toBe(1);
		expect(map.d3.itemCount).toBe(0);
	});
});
