import { describe, it, expect } from 'vitest';
import { compileOps, type RecordLoader } from './compile';
import { tripRef } from '../context';
import type { MemberRole, Trip } from '$lib/types';
import type { WriteOp } from './types';

// Porto-like fixture: a trip of 2026-11-01 → 2026-11-08, one day record per date.
const TRIP = {
	id: 'porto',
	slug: 'porto',
	title: 'Porto',
	start_date: '2026-11-01 00:00:00.000Z',
	end_date: '2026-11-08 00:00:00.000Z',
	ai_access: true,
	ai_write: true,
	auto_approve_suggestions: false
} as Trip;
const DAYS = Array.from({ length: 8 }, (_, i) => ({ id: `day0${i + 1}`, date: `2026-11-0${i + 1} 00:00:00.000Z` }));

const RECORDS: Record<string, Record<string, Record<string, unknown>>> = {
	items: {
		lunch: { id: 'lunch', trip: 'porto', day: 'day03', title: 'Lunch', start_time: '2026-11-03 09:00:00.000Z', created_by: 'mOwner' },
		mine: { id: 'mine', trip: 'porto', day: 'day03', title: 'My idea', created_by: 'mTrav' },
		lisbon: { id: 'lisbon', trip: 'lisbon', day: 'x', title: 'Elsewhere' }
	},
	checklists: { packing: { id: 'packing', trip: 'porto', title: 'Packing' } },
	trips: { porto: { id: 'porto', title: 'Porto', timezone: 'UTC' } }
};

const loader: RecordLoader = {
	async get(collection, id) {
		return RECORDS[collection]?.[id] ?? null;
	},
	async tripIdOf(collection, record) {
		if (collection === 'tasks') return String(RECORDS.checklists[String(record.checklist)]?.trip ?? '');
		if (collection === 'trips') return String(record.id ?? '');
		return String(record.trip ?? '');
	},
	async days() {
		return DAYS;
	}
};

const as = (role: MemberRole, trip: Partial<Trip> = {}) =>
	tripRef({ ...TRIP, ...trip }, role, role === 'traveler' ? 'mTrav' : 'mOwner');
const compile = (ops: WriteOp[], role: MemberRole = 'owner', trip: Partial<Trip> = {}) => compileOps(loader, as(role, trip), ops, 'uOwner');

describe('compileOps', () => {
	it('refuses an empty or oversized proposal', async () => {
		await expect(compile([])).rejects.toThrow('Nothing to change.');
		const many = Array.from({ length: 51 }, () => ({ action: 'update' as const, collection: 'items', id: 'lunch', data: { title: 'x' } }));
		await expect(compile(many)).rejects.toThrow('At most 50 changes at once.');
	});

	it('refuses a blocked collection or field with the plain reason', async () => {
		await expect(compile([{ action: 'create', collection: 'trip_members', data: {} }])).rejects.toThrow("I can't change a trip's members.");
		await expect(compile([{ action: 'update', collection: 'trips', id: 'porto', data: { ai_write: false } }])).rejects.toThrow(
			"I can't change AI settings"
		);
		await expect(compile([{ action: 'update', collection: 'items', id: 'lunch', data: { created_by: 'm2' } }])).rejects.toThrow(
			/Who made something/
		);
	});

	it('refuses a record in another trip (Review Focus 1)', async () => {
		await expect(compile([{ action: 'update', collection: 'items', id: 'lisbon', data: { title: 'x' } }])).rejects.toThrow(
			"That record isn't in Porto."
		);
		await expect(compile([{ action: 'create', collection: 'items', data: { title: 'x', trip: 'lisbon' } }])).rejects.toThrow(
			"That record isn't in Porto."
		);
	});

	it('resolves a friendly date to the day, and refuses one outside the trip', async () => {
		const [c] = await compile([{ action: 'create', collection: 'items', data: { type: 'meal', title: 'Dinner', date: '2026-11-03' } }]);
		expect(c.after.day).toBe('day03');
		expect(c.after.trip).toBe('porto');
		expect('date' in c.after).toBe(false);
		await expect(compile([{ action: 'create', collection: 'items', data: { title: 'x', date: '2026-11-30' } }])).rejects.toThrow(
			'2026-11-30 is outside Porto (2026-11-01 → 2026-11-08).'
		);
	});

	it('stores a 24h time on the record\'s day', async () => {
		const [c] = await compile([{ action: 'create', collection: 'items', data: { title: 'Train', date: '2026-11-03', start_time: '09:40' } }]);
		expect(c.after.start_time).toBe('2026-11-03 09:40:00.000Z');
		const [u] = await compile([{ action: 'update', collection: 'items', id: 'lunch', data: { start_time: '09:40' } }]);
		expect(u.after.start_time).toBe('2026-11-03 09:40:00.000Z');
	});

	it('gives a ref create a 15-char id and substitutes it later', async () => {
		const [list, task] = await compile([
			{ action: 'create', collection: 'checklists', ref: 'trip', data: { title: 'Before we go' } },
			{ action: 'create', collection: 'tasks', data: { checklist: '$ref:trip', title: 'Passports' } }
		]);
		expect(list.id).toMatch(/^[a-z0-9]{15}$/);
		expect(task.after.checklist).toBe(list.id);
		await expect(compile([{ action: 'create', collection: 'tasks', data: { checklist: '$ref:nope', title: 'x' } }])).rejects.toThrow(
			/nope/
		);
	});

	it('fills author fields from stamp', async () => {
		const [c] = await compile([{ action: 'create', collection: 'trip_goals', data: { title: 'See the sea' } }]);
		expect(c.after.created_by).toBe('mOwner');
	});

	it('an owner item create is saved; a traveler one becomes a suggestion', async () => {
		const [own] = await compile([{ action: 'create', collection: 'items', data: { title: 'Dinner', date: '2026-11-03' } }]);
		expect(own).toMatchObject({ via: 'record', outcome: 'saved' });
		const [off] = await compile([{ action: 'create', collection: 'items', data: { title: 'Dinner' } }], 'traveler');
		expect(off).toMatchObject({ via: 'suggestion', outcome: 'suggested' });
		const [on] = await compile([{ action: 'create', collection: 'items', data: { title: 'Dinner' } }], 'traveler', {
			auto_approve_suggestions: true
		});
		expect(on).toMatchObject({ via: 'suggestion', outcome: 'idea' });
	});

	it('refuses a traveler editing an item the app would not let them edit', async () => {
		await expect(compile([{ action: 'update', collection: 'items', id: 'lunch', data: { title: 'x' } }], 'traveler')).rejects.toThrow(
			"Only the trip's owners can edit items. I can leave a comment for them instead."
		);
	});

	it('lets a traveler edit their own item, or say they are not going (#219, #402)', async () => {
		await expect(compile([{ action: 'update', collection: 'items', id: 'mine', data: { title: 'y' } }], 'traveler')).resolves.toHaveLength(1);
		await expect(
			compile([{ action: 'update', collection: 'items', id: 'lunch', data: { not_going: ['mTrav'] } }], 'traveler')
		).resolves.toHaveLength(1);
	});

	it('records only the touched fields as before', async () => {
		const [u] = await compile([{ action: 'update', collection: 'items', id: 'lunch', data: { title: 'Lunch at Taberna' } }]);
		expect(u.before).toEqual({ title: 'Lunch' });
		expect(u.after).toEqual({ title: 'Lunch at Taberna' });
		expect(u.title).toBe('Lunch');
	});

	it('runs the registry checks the audit kept (timezone)', async () => {
		await expect(compile([{ action: 'update', collection: 'trips', id: 'porto', data: { timezone: 'Mars/Base' } }])).rejects.toThrow(
			/timezone/
		);
	});
});

describe('compileOps — moving records', () => {
	it('refuses an update that moves a record to another trip', async () => {
		await expect(compile([{ action: 'update', collection: 'items', id: 'lunch', data: { trip: 'lisbon' } }])).rejects.toThrow(
			"That record isn't in Porto."
		);
	});
});
