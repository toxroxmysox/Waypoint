import { describe, it, expect } from 'vitest';
import { coversNight, lodgingForNight, nightsOf } from './lodging-nights';
import type { Item, Day } from '$lib/types';

const days = ['01', '02', '03', '04'].map(
	(d) =>
		({ id: `d${d}`, date: `2026-07-${d} 00:00:00.000Z`, phases: [], notes: '' }) as unknown as Day
);
const lodging = (over: Partial<Item>): Item =>
	({ id: 'l', type: 'lodging', status: 'planned', day: 'd01', end_date: '', ...over }) as Item;

// #537 — the one rule every surface uses for "who sleeps where on night d".
describe('coversNight', () => {
	const stay = lodging({ end_date: '2026-07-03 00:00:00.000Z' });
	it('a stay covers check-in night up to, not including, check-out', () => {
		expect(
			['2026-07-01', '2026-07-02', '2026-07-03'].map((d) => coversNight(stay, days, d))
		).toEqual([true, true, false]);
	});
	it('a lodging with no end date covers the night of its day only', () => {
		const one = lodging({ day: 'd02' });
		expect(coversNight(one, days, '2026-07-02')).toBe(true);
		expect(coversNight(one, days, '2026-07-03')).toBe(false);
	});
	it('a considered (abandoned) option covers nothing', () => {
		expect(coversNight(lodging({ ...stay, status: 'considered' }), days, '2026-07-01')).toBe(false);
		expect(coversNight(lodging({ status: 'considered' }), days, '2026-07-01')).toBe(false);
	});
	it('unplaced lodging and non-lodging cover nothing', () => {
		expect(coversNight(lodging({ day: '' }), days, '2026-07-01')).toBe(false);
		expect(coversNight(lodging({ type: 'activity' }), days, '2026-07-01')).toBe(false);
	});
});

describe('lodgingForNight / nightsOf', () => {
	it('every day but the last is a night', () => {
		expect(nightsOf(days)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
	});
	it('filters to covering lodging', () => {
		const a = lodging({ id: 'a' });
		const b = lodging({ id: 'b', status: 'considered' });
		expect(lodgingForNight([a, b], days, '2026-07-01').map((i) => i.id)).toEqual(['a']);
	});
});
