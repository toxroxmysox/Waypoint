import { describe, it, expect } from 'vitest';
import { inverseOf } from './revert';
import type { CommittedChange } from './types';

const update: CommittedChange = {
	action: 'update',
	collection: 'items',
	id: 'lunch',
	via: 'record',
	before: { title: 'Picnic lunch', start_time: '2026-11-03 09:00:00.000Z' },
	after: { title: 'Lunch at Taberna', start_time: '2026-11-03 09:40:00.000Z' },
	outcome: 'saved',
	title: 'Picnic lunch',
	committed: true
};

describe('inverseOf', () => {
	it('restores every field nobody has touched since', () => {
		const inv = inverseOf(update, {
			title: 'Lunch at Taberna',
			start_time: '2026-11-03 09:40:00.000Z'
		});
		expect(inv).toEqual({
			data: { title: 'Picnic lunch', start_time: '2026-11-03 09:00:00.000Z' },
			delete: false,
			skipped: []
		});
	});

	it('skips, by name, a field someone changed since (story 27)', () => {
		const inv = inverseOf(update, { title: 'Brunch', start_time: '2026-11-03 09:40:00.000Z' });
		expect(inv.data).toEqual({ start_time: '2026-11-03 09:00:00.000Z' });
		expect(inv.skipped).toEqual(['Picnic lunch: title changed since']);
	});

	it('skips a record that was deleted since (Review Focus 5)', () => {
		expect(inverseOf(update, null)).toEqual({
			data: null,
			delete: false,
			skipped: ['Picnic lunch was deleted']
		});
	});

	it('removes a record it created (story 28)', () => {
		const create: CommittedChange = { ...update, action: 'create', before: null, title: 'Dinner' };
		expect(inverseOf(create, { id: 'lunch' })).toEqual({ data: null, delete: true, skipped: [] });
		expect(inverseOf(create, null).skipped).toEqual(['Dinner was deleted']);
	});

	it('withdraws a pending suggestion, but not one already approved', () => {
		const sug: CommittedChange = {
			...update,
			action: 'create',
			via: 'suggestion',
			before: null,
			title: 'Cooking class',
			suggestionId: 's1'
		};
		expect(inverseOf(sug, { status: 'pending' }).delete).toBe(true);
		expect(inverseOf(sug, { status: 'approved' })).toEqual({
			data: null,
			delete: false,
			skipped: ['Cooking class: already approved — remove the item in the app']
		});
	});

	it('leaves alone a change that never went through', () => {
		expect(inverseOf({ ...update, committed: false }, null)).toEqual({
			data: null,
			delete: false,
			skipped: []
		});
	});
});

describe('inverseOf — undo never clobbers (review I5)', () => {
	it('leaves a created record someone has edited since', () => {
		const create: CommittedChange = {
			...update,
			action: 'create',
			before: null,
			title: 'Lunch at Taberna'
		};
		expect(
			inverseOf(create, {
				title: 'Lunch at Taberna (moved)',
				start_time: '2026-11-03 09:40:00.000Z'
			})
		).toEqual({
			data: null,
			delete: false,
			skipped: [
				'Lunch at Taberna was changed since — remove it in the app if you still want it gone'
			]
		});
	});
});
