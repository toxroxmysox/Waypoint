import { describe, expect, it } from 'vitest';
import { dayCards, dayFrom, resolveDate, ITEM_FIELDS, itemCard, stayLabel } from './day-data';
import type { Day, Item } from '$lib/types';

describe('resolveDate', () => {
	it('reads tomorrow in trip-local time', () => {
		// 23:30 UTC on Jul 1 is already Jul 2 in Zurich → tomorrow is Jul 3.
		expect(resolveDate('Europe/Zurich', 'tomorrow', new Date('2026-07-01T23:30:00Z'))).toBe(
			'2026-07-03'
		);
	});

	it('reads today and yesterday', () => {
		const now = new Date('2026-07-01T12:00:00Z');
		expect(resolveDate('UTC', 'today', now)).toBe('2026-07-01');
		expect(resolveDate('UTC', 'yesterday', now)).toBe('2026-06-30');
	});

	it('falls back to UTC for an invalid zone', () => {
		expect(resolveDate('Lucerne', 'today', new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-01');
	});

	it('passes an explicit date through', () => {
		expect(resolveDate('UTC', '2026-07-05', new Date())).toBe('2026-07-05');
	});

	it('rejects anything else', () => {
		expect(() => resolveDate('UTC', 'next friday', new Date())).toThrow(/YYYY-MM-DD/);
	});
});

describe('dayFrom — red-eye flights (#538)', () => {
	const item = (o: Partial<Item> & { id: string }): Item =>
		({
			title: o.id,
			type: 'activity',
			status: 'planned',
			day: 'd2',
			sort_order: 0,
			start_time: '',
			end_time: '',
			end_date: '',
			assigned_to: [],
			...o
		}) as Item;
	const days = [
		{ id: 'd1', trip: 't', date: '2026-10-25 00:00:00.000Z' },
		{ id: 'd2', trip: 't', date: '2026-10-26 00:00:00.000Z' }
	] as Day[];
	// UA 1 departs Sun 23:30, lands Mon 06:40.
	const redEye = item({
		id: 'redeye',
		title: 'UA 1',
		type: 'flight',
		day: 'd1',
		start_time: '2026-10-25 23:30:00.000Z',
		end_time: '2026-10-26 06:40:00.000Z',
		end_date: '2026-10-26 00:00:00.000Z'
	});
	const hotel = item({
		id: 'hotel',
		type: 'lodging',
		day: 'd1',
		end_date: '2026-10-26 00:00:00.000Z'
	});
	const breakfast = item({ id: 'breakfast', start_time: '2026-10-26 08:00:00.000Z' });
	const all = [redEye, hotel, breakfast];

	it('is an item on its departure day, not a stay', () => {
		const d = dayFrom(days, all, '2026-10-25');
		expect(d.stays.map((s) => s.id)).toEqual(['hotel']);
		expect(d.items.map((i) => i.id)).toEqual(['redeye']);
		expect(dayCards(d).find((c) => c.title === 'UA 1')?.lines).toContain('Lands tomorrow 6:40a');
	});

	it('is an item on its landing day, ordered by landing time', () => {
		const d = dayFrom(days, all, '2026-10-26');
		expect(d.stays.map((s) => s.id)).toEqual(['hotel']);
		expect(d.items.map((i) => i.id)).toEqual(['redeye', 'breakfast']);
		expect(dayCards(d).find((c) => c.title === 'UA 1')?.lines).toContain(
			'Lands 6:40a · departed yesterday'
		);
	});
});

describe('rating on items (#576)', () => {
	const mk = (rating: string, status = 'done') =>
		({
			id: 'safari',
			title: 'Safari',
			type: 'activity',
			status,
			rating,
			start_time: '',
			end_time: '',
			end_date: '',
			assigned_to: []
		}) as unknown as Item;
	it('ITEM_FIELDS asks PB for rating, so every item read carries it', () => {
		expect(ITEM_FIELDS.split(',')).toContain('rating');
	});
	it('a rated item card says so, in words (get_day, get_item, search; trip_brief builds its own cards)', () => {
		expect(itemCard(mk('recommend')).lines).toContain('Recommended');
		expect(itemCard(mk('not_recommend')).lines).toContain('Not recommended');
	});
	it('an unrated item card says nothing', () => {
		expect(itemCard(mk('')).lines.join()).not.toMatch(/ecommend/);
	});
	it('a rated stay card says so on get_day; an unrated one says nothing (I2)', () => {
		const days = [
			{ id: 'd1', trip: 't', date: '2026-10-25 00:00:00.000Z' },
			{ id: 'd2', trip: 't', date: '2026-10-26 00:00:00.000Z' }
		] as Day[];
		const stay = (id: string, rating: string) =>
			({
				id,
				title: id,
				type: 'lodging',
				status: 'done',
				rating,
				day: 'd1',
				sort_order: 0,
				start_time: '',
				end_time: '',
				end_date: '2026-10-26 00:00:00.000Z',
				assigned_to: []
			}) as unknown as Item;
		const d = dayFrom(days, [stay('Cape Hotel', 'recommend'), stay('Plain Inn', '')], '2026-10-25');
		const cards = dayCards(d);
		expect(cards.find((c) => c.title === 'Cape Hotel')?.lines).toContain('Recommended');
		expect(cards.find((c) => c.title === 'Plain Inn')?.lines.join()).not.toMatch(/ecommend/);
	});
	it('stayLabel names the lodging with its rating for get_trip nights (I2)', () => {
		expect(stayLabel(mk('recommend'))).toBe('Safari · Recommended');
		expect(stayLabel(mk('not_recommend'))).toBe('Safari · Not recommended');
		expect(stayLabel(mk(''))).toBe('Safari');
	});
});
