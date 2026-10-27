import { describe, it, expect } from 'vitest';
import { isOvernightFlight, landingView, overnightNote } from './overnight';
import { buildTimelineFlat } from './timeline';
import { cardAccessibleName, freeTimeGaps, overlapPairs } from './card-anatomy';
import type { Item } from '$lib/types';

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

// UA 1 departs Sun Oct 25 23:30, lands Mon Oct 26 06:40.
const redEye = item({
	id: 'redeye',
	type: 'flight',
	day: 'd1',
	start_time: '2026-10-25 23:30:00.000Z',
	end_time: '2026-10-26 06:40:00.000Z',
	end_date: '2026-10-26 00:00:00.000Z'
});

describe('isOvernightFlight', () => {
	it('is a flight with an end_date', () => {
		expect(isOvernightFlight(redEye)).toBe(true);
		expect(isOvernightFlight({ ...redEye, end_date: '' })).toBe(false);
		expect(isOvernightFlight({ ...redEye, type: 'lodging' })).toBe(false);
	});
});

describe('landing-day timeline (#538)', () => {
	const breakfast = item({ id: 'breakfast', start_time: '2026-10-26 08:00:00.000Z' });
	const early = item({ id: 'early', start_time: '2026-10-26 05:00:00.000Z' });
	const dinner = item({ id: 'dinner', start_time: '2026-10-26 19:00:00.000Z' });

	it('orders by landing time, not take-off', () => {
		const flat = buildTimelineFlat([dinner, landingView(redEye), breakfast, early]);
		expect(flat.map((e) => e.item.id)).toEqual(['early', 'redeye', 'breakfast', 'dinner']);
	});

	it('buckets into Morning by landing time (a 23:30 take-off is not Evening)', () => {
		const flat = buildTimelineFlat([landingView(redEye), dinner]);
		expect(flat[0]).toMatchObject({ slotLabel: 'Morning', anchored: true });
		expect(flat[1].slotLabel).toBe('Evening');
	});

	it('counts free time from the landing', () => {
		const ordered = buildTimelineFlat([landingView(redEye), breakfast]).map((e) => e.item);
		expect(freeTimeGaps(ordered).get('breakfast')).toMatchObject({ from: '6:40a', to: '8:00a' });
	});

	it("does not collide with the day's items through yesterday's take-off", () => {
		const late = item({
			id: 'late',
			start_time: '2026-10-26 23:00:00.000Z',
			end_time: '2026-10-26 23:50:00.000Z'
		});
		expect(overlapPairs([landingView(redEye), late]).size).toBe(0);
	});

	it('keeps everything but the start', () => {
		const v = landingView(redEye);
		expect(v).toMatchObject({ id: 'redeye', start_time: '', end_time: redEye.end_time });
		expect(redEye.start_time).toBe('2026-10-25 23:30:00.000Z');
	});
});

describe('overnightNote', () => {
	it('departure day says when it lands', () => {
		expect(overnightNote(redEye, 'departure')).toEqual({
			text: 'Lands tomorrow 6:40a',
			spoken: 'lands tomorrow 6:40 AM'
		});
	});

	it('landing day says it departed yesterday', () => {
		expect(overnightNote(redEye, 'landing')).toEqual({
			text: 'Lands 6:40a · departed yesterday',
			spoken: 'lands 6:40 AM, departed yesterday'
		});
	});

	it('names the day when it is more than one day apart', () => {
		const long = { ...redEye, end_time: '2026-10-27 09:15:00.000Z', end_date: '2026-10-27' };
		expect(overnightNote(long, 'departure')?.text).toBe('Lands Tue Oct 27 9:15a');
		expect(overnightNote(long, 'landing')?.text).toBe('Lands 9:15a · departed Sun Oct 25');
	});

	it('copes with no landing time', () => {
		expect(overnightNote({ ...redEye, end_time: '' }, 'departure')?.text).toBe('Lands tomorrow');
		expect(overnightNote({ ...redEye, end_time: '' }, 'landing')?.text).toBe(
			'Lands today · departed yesterday'
		);
	});

	it('is null for anything but an overnight flight', () => {
		expect(overnightNote({ ...redEye, end_date: '' }, 'departure')).toBeNull();
		expect(overnightNote(item({ id: 'x' }), 'landing')).toBeNull();
	});
});

describe('cardAccessibleName with an overnight line', () => {
	it('landing day: the line replaces the "by" time', () => {
		const name = cardAccessibleName({
			item: landingView(redEye),
			needsBooking: false,
			booked: false,
			overnight: overnightNote(redEye, 'landing')!.spoken
		});
		expect(name).toBe('lands 6:40 AM, departed yesterday, redeye, flight');
	});
});
