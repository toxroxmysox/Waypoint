import { describe, it, expect } from 'vitest';
import { dropPrompt, planDropLabels, canPlanOnDay, dayHeadline, upNextRow } from './drag-to-plan';
import type { DayCardSummary } from './day-card';

const item = (id: string, start?: string, end?: string) =>
	({
		id,
		start_time: start ? `2026-07-01 ${start}:00.000Z` : '',
		end_time: end ? `2026-07-01 ${end}:00.000Z` : ''
	}) as never;

const summary = (over: Partial<DayCardSummary> = {}): DayCardSummary => ({
	itemCount: 0,
	bookedCount: 0,
	bookableCount: 0,
	needsBookingCount: 0,
	budgetTotal: 0,
	stays: [],
	leadTitle: '',
	...over
});

describe('dropPrompt', () => {
	it('names the free time it offers', () => {
		expect(dropPrompt({ minutes: 120, from: '4:30p', to: '6:30p' })).toBe('Drop to plan · 2h free · 4:30p to 6:30p');
	});
	it('is bare when the day has no gap', () => {
		expect(dropPrompt(null)).toBe('Drop to plan');
	});
});

describe('planDropLabels', () => {
	it('labels the item that closes each free gap', () => {
		const labels = planDropLabels([item('a', '09:00', '10:00'), item('b', '12:30', '13:30'), item('c')]);
		expect([...labels.keys()]).toEqual(['b']);
		expect(labels.get('b')).toBe('Drop to plan · 2h 30m free · 10:00a to 12:30p');
	});
	it('is empty when nothing leaves an hour free', () => {
		expect(planDropLabels([item('a', '09:00', '10:00'), item('b', '10:30', '11:00')]).size).toBe(0);
	});
});

describe('canPlanOnDay', () => {
	it('accepts an idea from one of the day phases', () => {
		expect(canPlanOnDay('p1', ['p1', 'p2'])).toBe(true);
	});
	it('rejects a foreign-phase idea', () => {
		expect(canPlanOnDay('p3', ['p1'])).toBe(false);
	});
});

describe('dayHeadline', () => {
	it('prefers the day notes', () => {
		expect(dayHeadline({ notes: ' Lake day ' }, summary({ leadTitle: 'Hike', itemCount: 2 }))).toBe('Lake day');
	});
	it('falls back to the lead item with a + N more', () => {
		expect(dayHeadline({ notes: '' }, summary({ leadTitle: 'Hike', itemCount: 3 }))).toBe('Hike + 2 more');
		expect(dayHeadline({ notes: '' }, summary({ leadTitle: 'Hike', itemCount: 1 }))).toBe('Hike');
	});
	it('says so when the day is empty', () => {
		expect(dayHeadline({ notes: '' }, summary())).toBe('Nothing planned yet');
	});
});

describe('upNextRow', () => {
	it('carries title, count and the to-book count', () => {
		const r = upNextRow({ notes: '' }, summary({ leadTitle: 'Hike', itemCount: 2, needsBookingCount: 1 }));
		expect(r).toEqual({ title: 'Hike + 1 more', itemCount: 2, toBook: 1, empty: false });
	});
	it('marks an empty day', () => {
		expect(upNextRow({ notes: '' }, undefined)).toEqual({
			title: 'Nothing planned yet',
			itemCount: 0,
			toBook: 0,
			empty: true
		});
	});
});
