import { describe, it, expect } from 'vitest';
import { summarizeDay, summarizeDays, todayTreatment } from './day-card';
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

describe('summarizeDay — stay line: Night N of M (#426)', () => {
	const hotel = item({
		id: 'h',
		type: 'lodging',
		day: 'd1',
		end_date: '2026-06-20 00:00:00.000Z',
		title: 'The American Club'
	});

	it('check-in day reads Night 1 of 2', () => {
		expect(summarizeDay([hotel], days, days[0]).stays).toEqual([
			{ kind: 'check-in', name: 'The American Club', text: 'Night 1 of 2 · The American Club' }
		]);
	});

	it('middle day reads Night 2 of 3 (was blank before #426)', () => {
		const h3 = item({ id: 'h3', type: 'lodging', day: 'd1', end_date: '2026-06-21 00:00:00.000Z', title: 'The American Club' });
		const four = [...days, { id: 'd4', date: '2026-06-21 00:00:00.000Z' }] as Day[];
		const s = summarizeDay([h3], four, four[1]).stays;
		expect(s).toEqual([{ kind: 'staying', name: 'The American Club', text: 'Night 2 of 3 · The American Club' }]);
	});

	it('check-out day reads Check-out · Name, never a night count', () => {
		expect(summarizeDay([hotel], days, days[2]).stays).toEqual([
			{ kind: 'check-out', name: 'The American Club', text: 'Check-out · The American Club' }
		]);
	});

	it('a blank lodging title drops the separator', () => {
		const bare = item({ id: 'h', type: 'lodging', day: 'd1', end_date: '2026-06-20 00:00:00.000Z' });
		expect(summarizeDay([bare], days, days[0]).stays[0]?.text).toBe('Night 1 of 2');
		expect(summarizeDay([bare], days, days[2]).stays[0]?.text).toBe('Check-out');
	});

	it('is empty when no lodging spans the date', () => {
		expect(summarizeDay([item()], days, days[0]).stays).toEqual([]);
	});

	it('ignores non-lodging multi-day items', () => {
		const train = item({ id: 't', type: 'transportation', day: 'd1', end_date: '2026-06-20 00:00:00.000Z' });
		expect(summarizeDay([train], days, days[0]).stays).toEqual([]);
	});

	it('two lodgings checking in the same day emit two lines', () => {
		const a = item({ id: 'ha', type: 'lodging', day: 'd1', end_date: '2026-06-19 00:00:00.000Z', title: 'Hotel A' });
		const b = item({ id: 'hb', type: 'lodging', day: 'd1', end_date: '2026-06-20 00:00:00.000Z', title: 'Hotel B' });
		const stays = summarizeDay([a, b], days, days[0]).stays;
		expect(stays.map((s) => s.text)).toEqual(['Night 1 of 1 · Hotel A', 'Night 1 of 2 · Hotel B']);
	});

	it('two lodgings checking out the same day emit two lines', () => {
		const a = item({ id: 'xa', type: 'lodging', day: 'd1', end_date: '2026-06-19 00:00:00.000Z', title: 'Place A' });
		const b = item({ id: 'xb', type: 'lodging', day: 'd1', end_date: '2026-06-19 00:00:00.000Z', title: 'Place B' });
		const stays = summarizeDay([a, b], days, days[1]).stays;
		expect(stays.map((s) => s.kind)).toEqual(['check-out', 'check-out']);
	});
});

describe('summarizeDay — needsBookingCount (#426)', () => {
	it('= bookable minus booked: only planned, requires-booking, unbooked items', () => {
		const items = [
			item({ id: 'a', booked: true, requires_booking: true }),
			item({ id: 'b', booked: false, requires_booking: true }),
			item({ id: 'c', booked: false, requires_booking: true }),
			item({ id: 'd', booked: false, requires_booking: false })
		];
		expect(summarizeDay(items, days, days[0]).needsBookingCount).toBe(2);
	});
	it('is 0 when everything bookable is booked, and for an empty day', () => {
		expect(summarizeDay([item({ booked: true, requires_booking: true })], days, days[0]).needsBookingCount).toBe(0);
		expect(summarizeDay([], days, days[0]).needsBookingCount).toBe(0);
	});
});

describe('todayTreatment (#426)', () => {
	it('Planning Mode: today gets the outline, not the pill', () => {
		expect(todayTreatment('2026-06-18 00:00:00.000Z', '2026-06-18', 'planning')).toBe('outline');
	});
	it('Trip Mode keeps the TODAY pill', () => {
		expect(todayTreatment('2026-06-18 00:00:00.000Z', '2026-06-18', 'trip')).toBe('pill');
	});
	it('any other day, or no today, is none', () => {
		expect(todayTreatment('2026-06-19 00:00:00.000Z', '2026-06-18', 'planning')).toBe('none');
		expect(todayTreatment('2026-06-18 00:00:00.000Z', undefined, 'planning')).toBe('none');
	});
	it('compares calendar dates, so the stored time-of-day never matters', () => {
		expect(todayTreatment('2026-06-18T00:00:00.000Z', '2026-06-18', 'planning')).toBe('outline');
	});
});

// #355: the card headline read day.notes only, so a day with items still said
// "Nothing planned yet" while the row below it said "2 items". leadTitle is the
// content the headline falls back to.
describe('summarizeDay — leadTitle (#355)', () => {
	it('is the first item in itinerary order, not input order', () => {
		const items = [
			item({ id: 'late', title: 'Dinner', start_time: '2026-06-18 19:00:00.000Z' }),
			item({ id: 'early', title: 'Blackwolf Run', start_time: '2026-06-18 09:00:00.000Z' })
		];
		expect(summarizeDay(items, days, days[0]).leadTitle).toBe('Blackwolf Run');
	});

	it('weaves untimed items by sort_order the same way the timeline does', () => {
		const items = [
			item({ id: 'timed', title: 'Tee time', start_time: '2026-06-18 09:00:00.000Z', sort_order: 2 }),
			item({ id: 'untimed', title: 'Pack clubs', start_time: '', sort_order: 1 })
		];
		expect(summarizeDay(items, days, days[0]).leadTitle).toBe('Pack clubs');
	});

	it('is empty for a day with no items', () => {
		expect(summarizeDay([], days, days[0]).leadTitle).toBe('');
	});

	it('ignores multi-day banners — a lodging-only day still leads with nothing', () => {
		const hotel = item({
			id: 'h',
			type: 'lodging',
			title: 'Seymour St. Retreat',
			end_date: '2026-06-20 00:00:00.000Z'
		});
		const summary = summarizeDay([hotel], days, days[0]);
		expect(summary.itemCount).toBe(0);
		expect(summary.leadTitle).toBe('');
		expect(summary.stays).toHaveLength(1);
	});

	it('skips untitled items so a non-empty day never reads as empty', () => {
		const items = [
			item({ id: 'blank', title: '   ', sort_order: 1 }),
			item({ id: 'named', title: 'Kohler', sort_order: 2 })
		];
		const summary = summarizeDay(items, days, days[0]);
		expect(summary.itemCount).toBe(2);
		expect(summary.leadTitle).toBe('Kohler');
	});

	it('trims whitespace', () => {
		expect(summarizeDay([item({ title: '  Whistling Straits  ' })], days, days[0]).leadTitle).toBe(
			'Whistling Straits'
		);
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
