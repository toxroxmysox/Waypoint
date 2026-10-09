import { describe, it, expect } from 'vitest';
import { spanBandText } from './multi-day';
import type { Item, Day } from '$lib/types';

// #423: the Span band's text at the multi-day seam (spec §Span).
describe('spanBandText (#423)', () => {
	const run = [
		{ id: 'a', date: '2026-06-18 00:00:00.000Z' },
		{ id: 'b', date: '2026-06-19 00:00:00.000Z' },
		{ id: 'c', date: '2026-06-20 00:00:00.000Z' },
		{ id: 'd', date: '2026-06-21 00:00:00.000Z' },
		{ id: 'e', date: '2026-06-22 00:00:00.000Z' }
	] as Day[];
	const stay = (over: Partial<Item> = {}) =>
		({
			id: 's',
			day: 'a',
			type: 'lodging',
			end_date: '2026-06-22 00:00:00.000Z',
			start_time: '2026-06-18 15:00:00.000Z',
			end_time: '2026-06-22 11:00:00.000Z',
			...over
		}) as Item;
	const rental = (over: Partial<Item> = {}) =>
		stay({ type: 'transportation', start_time: '2026-06-18 10:00:00.000Z', end_time: '2026-06-22 12:00:00.000Z', ...over });

	describe('stay', () => {
		it('first day: Check-in time · N nights', () => {
			expect(spanBandText(stay(), run, '2026-06-18')).toEqual({ phase: 'first', text: 'Check-in 3:00p · 4 nights' });
		});
		it('middle day: Night N of M · check-out Weekday by time', () => {
			expect(spanBandText(stay(), run, '2026-06-19')).toEqual({ phase: 'middle', text: 'Night 2 of 4 · check-out Mon by 11:00a' });
			expect(spanBandText(stay(), run, '2026-06-21')?.text).toBe('Night 4 of 4 · check-out Mon by 11:00a');
		});
		it('last day: Check-out by time', () => {
			expect(spanBandText(stay(), run, '2026-06-22')).toEqual({ phase: 'last', text: 'Check-out by 11:00a' });
		});
		it('without times the time parts drop', () => {
			const bare = stay({ start_time: '', end_time: '' });
			expect(spanBandText(bare, run, '2026-06-18')?.text).toBe('Check-in · 4 nights');
			expect(spanBandText(bare, run, '2026-06-19')?.text).toBe('Night 2 of 4 · check-out Mon');
			expect(spanBandText(bare, run, '2026-06-22')?.text).toBe('Check-out');
		});
		it('one night is singular', () => {
			const one = stay({ end_date: '2026-06-19 00:00:00.000Z' });
			expect(spanBandText(one, run, '2026-06-18')?.text).toBe('Check-in 3:00p · 1 night');
		});
	});

	describe('rental (transportation)', () => {
		it('first day: Pick up time', () => {
			expect(spanBandText(rental(), run, '2026-06-18')).toEqual({ phase: 'first', text: 'Pick up 10:00a' });
		});
		it('middle day: Day N of M · return Weekday by time', () => {
			expect(spanBandText(rental(), run, '2026-06-19')).toEqual({ phase: 'middle', text: 'Day 2 of 5 · return Mon by 12:00p' });
			expect(spanBandText(rental(), run, '2026-06-21')?.text).toBe('Day 4 of 5 · return Mon by 12:00p');
		});
		it('last day: Return by time', () => {
			expect(spanBandText(rental(), run, '2026-06-22')).toEqual({ phase: 'last', text: 'Return by 12:00p' });
		});
		it('without times the time parts drop', () => {
			const bare = rental({ start_time: '', end_time: '' });
			expect(spanBandText(bare, run, '2026-06-18')?.text).toBe('Pick up');
			expect(spanBandText(bare, run, '2026-06-19')?.text).toBe('Day 2 of 5 · return Mon');
			expect(spanBandText(bare, run, '2026-06-22')?.text).toBe('Return');
		});
	});

	it('any other multi-day type reads neutrally (Starts / Ends)', () => {
		const camp = stay({ type: 'activity', start_time: '', end_time: '' });
		expect(spanBandText(camp, run, '2026-06-18')?.text).toBe('Starts');
		expect(spanBandText(camp, run, '2026-06-19')?.text).toBe('Day 2 of 5 · ends Mon');
		expect(spanBandText(camp, run, '2026-06-22')?.text).toBe('Ends');
	});

	it('null when the item is not multi-day', () => {
		expect(spanBandText(stay({ end_date: '' }), run, '2026-06-18')).toBeNull();
	});
});
