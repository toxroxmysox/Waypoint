import { describe, it, expect } from 'vitest';
import { compileOps, type RecordLoader } from './compile';
import { WRITABLE } from './registry';
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
const DAYS = Array.from({ length: 8 }, (_, i) => ({
	id: `day0${i + 1}`,
	date: `2026-11-0${i + 1} 00:00:00.000Z`,
	phases: [i < 4 ? 'pPorto' : 'pLisbon']
}));
const PHASES = [
	{ id: 'pPorto', name: 'Porto', start_date: '2026-11-01 00:00:00.000Z', order: 0 },
	{ id: 'pLisbon', name: 'Lisbon', start_date: '2026-11-05 00:00:00.000Z', order: 1 }
];

const RECORDS: Record<string, Record<string, Record<string, unknown>>> = {
	items: {
		lunch: {
			id: 'lunch',
			trip: 'porto',
			day: 'day03',
			title: 'Lunch',
			start_time: '2026-11-03 09:00:00.000Z',
			created_by: 'mOwner'
		},
		mine: { id: 'mine', trip: 'porto', day: 'day03', title: 'My idea', created_by: 'mTrav' },
		redeye: {
			id: 'redeye',
			trip: 'porto',
			day: 'day02',
			title: 'Red-eye',
			start_time: '2026-11-02 23:30:00.000Z',
			end_time: '2026-11-03 06:10:00.000Z',
			end_date: '2026-11-03 00:00:00.000Z'
		},
		safari: {
			id: 'safari',
			trip: 'porto',
			day: 'day03',
			title: 'Safari',
			status: 'done',
			created_by: 'mOwner'
		},
		hike: {
			id: 'hike',
			trip: 'porto',
			day: 'day03',
			title: 'Hike',
			status: 'planned',
			created_by: 'mOwner'
		},
		lisbon: { id: 'lisbon', trip: 'lisbon', day: 'x', title: 'Elsewhere' }
	},
	checklists: { packing: { id: 'packing', trip: 'porto', title: 'Packing' } },
	phases: {
		pPorto: { id: 'pPorto', trip: 'porto' },
		pLisbon: { id: 'pLisbon', trip: 'porto' },
		pElse: { id: 'pElse', trip: 'lisbon' }
	},
	trip_members: {
		mOwner: { id: 'mOwner', trip: 'porto' },
		mTrav: { id: 'mTrav', trip: 'porto' },
		mElse: { id: 'mElse', trip: 'lisbon' }
	},
	trips: { porto: { id: 'porto', title: 'Porto', timezone: 'UTC' } }
};

const loader: RecordLoader = {
	async get(collection, id) {
		return RECORDS[collection]?.[id] ?? null;
	},
	async tripIdOf(collection, record) {
		if (collection === 'tasks')
			return String(RECORDS.checklists[String(record.checklist)]?.trip ?? '');
		if (collection === 'trips') return String(record.id ?? '');
		return String(record.trip ?? '');
	},
	async days() {
		return DAYS;
	},
	async phases() {
		return PHASES;
	}
};

const as = (role: MemberRole, trip: Partial<Trip> = {}) =>
	tripRef({ ...TRIP, ...trip }, role, role === 'traveler' ? 'mTrav' : 'mOwner');
const compile = (ops: WriteOp[], role: MemberRole = 'owner', trip: Partial<Trip> = {}) =>
	compileOps(loader, as(role, trip), ops, 'uOwner');

describe('compileOps', () => {
	it('refuses an empty or oversized proposal', async () => {
		await expect(compile([])).rejects.toThrow('Nothing to change.');
		const many = Array.from({ length: 51 }, () => ({
			action: 'update' as const,
			collection: 'items',
			id: 'lunch',
			data: { title: 'x' }
		}));
		await expect(compile(many)).rejects.toThrow('At most 50 changes at once.');
	});

	it('refuses a blocked collection or field with the plain reason', async () => {
		await expect(
			compile([{ action: 'create', collection: 'trip_members', data: {} }])
		).rejects.toThrow("I can't change a trip's members.");
		await expect(
			compile([{ action: 'update', collection: 'trips', id: 'porto', data: { ai_write: false } }])
		).rejects.toThrow("I can't change AI settings");
		await expect(
			compile([{ action: 'update', collection: 'items', id: 'lunch', data: { created_by: 'm2' } }])
		).rejects.toThrow(/Who made something/);
	});

	it('refuses a record in another trip (Review Focus 1)', async () => {
		await expect(
			compile([{ action: 'update', collection: 'items', id: 'lisbon', data: { title: 'x' } }])
		).rejects.toThrow("That record isn't in Porto.");
		await expect(
			compile([{ action: 'create', collection: 'items', data: { title: 'x', trip: 'lisbon' } }])
		).rejects.toThrow("That record isn't in Porto.");
	});

	it('resolves a friendly date to the day, and refuses one outside the trip', async () => {
		const [c] = await compile([
			{
				action: 'create',
				collection: 'items',
				data: { type: 'meal', title: 'Dinner', date: '2026-11-03' }
			}
		]);
		expect(c.after.day).toBe('day03');
		expect(c.after.trip).toBe('porto');
		expect('date' in c.after).toBe(false);
		await expect(
			compile([{ action: 'create', collection: 'items', data: { title: 'x', date: '2026-11-30' } }])
		).rejects.toThrow('2026-11-30 is outside Porto (2026-11-01 → 2026-11-08).');
	});

	it("stores a 24h time on the record's day", async () => {
		const [c] = await compile([
			{
				action: 'create',
				collection: 'items',
				data: { title: 'Train', date: '2026-11-03', start_time: '09:40' }
			}
		]);
		expect(c.after.start_time).toBe('2026-11-03 09:40:00.000Z');
		const [u] = await compile([
			{ action: 'update', collection: 'items', id: 'lunch', data: { start_time: '09:40' } }
		]);
		expect(u.after.start_time).toBe('2026-11-03 09:40:00.000Z');
	});

	it('gives a ref create a 15-char id and substitutes it later', async () => {
		const [list, task] = await compile([
			{ action: 'create', collection: 'checklists', ref: 'trip', data: { title: 'Before we go' } },
			{
				action: 'create',
				collection: 'tasks',
				data: { checklist: '$ref:trip', title: 'Passports' }
			}
		]);
		expect(list.id).toMatch(/^[a-z0-9]{15}$/);
		expect(task.after.checklist).toBe(list.id);
		await expect(
			compile([
				{ action: 'create', collection: 'tasks', data: { checklist: '$ref:nope', title: 'x' } }
			])
		).rejects.toThrow(/nope/);
	});

	it('fills author fields from stamp', async () => {
		const [c] = await compile([
			{ action: 'create', collection: 'trip_goals', data: { title: 'See the sea' } }
		]);
		expect(c.after.created_by).toBe('mOwner');
	});

	it('an owner item create is saved; a traveler one becomes a suggestion', async () => {
		const [own] = await compile([
			{ action: 'create', collection: 'items', data: { title: 'Dinner', date: '2026-11-03' } }
		]);
		expect(own).toMatchObject({ via: 'record', outcome: 'saved' });
		const [off] = await compile(
			[{ action: 'create', collection: 'items', data: { title: 'Dinner' } }],
			'traveler'
		);
		expect(off).toMatchObject({ via: 'suggestion', outcome: 'suggested' });
		const [on] = await compile(
			[{ action: 'create', collection: 'items', data: { title: 'Dinner' } }],
			'traveler',
			{
				auto_approve_suggestions: true
			}
		);
		expect(on).toMatchObject({ via: 'suggestion', outcome: 'idea' });
	});

	it('refuses a traveler editing an item the app would not let them edit', async () => {
		await expect(
			compile(
				[{ action: 'update', collection: 'items', id: 'lunch', data: { title: 'x' } }],
				'traveler'
			)
		).rejects.toThrow(
			"Only the trip's owners can edit items. I can leave a comment for them instead."
		);
	});

	it('lets a traveler edit their own item, or say they are not going (#219, #402)', async () => {
		await expect(
			compile(
				[{ action: 'update', collection: 'items', id: 'mine', data: { title: 'y' } }],
				'traveler'
			)
		).resolves.toHaveLength(1);
		await expect(
			compile(
				[{ action: 'update', collection: 'items', id: 'lunch', data: { not_going: ['mTrav'] } }],
				'traveler'
			)
		).resolves.toHaveLength(1);
	});

	it('records only the touched fields as before', async () => {
		const [u] = await compile([
			{ action: 'update', collection: 'items', id: 'lunch', data: { title: 'Lunch at Taberna' } }
		]);
		expect(u.before).toEqual({ title: 'Lunch' });
		expect(u.after).toEqual({ title: 'Lunch at Taberna' });
		expect(u.title).toBe('Lunch');
	});

	it('runs the registry checks the audit kept (timezone)', async () => {
		await expect(
			compile([
				{ action: 'update', collection: 'trips', id: 'porto', data: { timezone: 'Mars/Base' } }
			])
		).rejects.toThrow(/timezone/);
	});
});

describe('compileOps — moving records', () => {
	it('refuses an update that moves a record to another trip', async () => {
		await expect(
			compile([{ action: 'update', collection: 'items', id: 'lunch', data: { trip: 'lisbon' } }])
		).rejects.toThrow("That record isn't in Porto.");
	});
});

describe('compileOps — only real field names (review C1)', () => {
	it("refuses PB field modifiers that would slip past the can't-list", async () => {
		for (const key of ['created_by+', '+created_by', 'trip+', '+trip', 'title-']) {
			await expect(
				compile([{ action: 'update', collection: 'items', id: 'lunch', data: { [key]: 'x' } }]),
				key
			).rejects.toThrow();
		}
	});
	it('refuses a field the collection does not have', async () => {
		await expect(
			compile([{ action: 'update', collection: 'items', id: 'lunch', data: { bogus: 1 } }])
		).rejects.toThrow(/"bogus"/);
	});
});

describe('compileOps — links stay in the trip (review I6)', () => {
	it('refuses a phase or member from another trip', async () => {
		await expect(
			compile([{ action: 'update', collection: 'items', id: 'lunch', data: { phase: 'pElse' } }])
		).rejects.toThrow("That phase isn't in Porto.");
		await expect(
			compile([
				{ action: 'update', collection: 'items', id: 'lunch', data: { assigned_to: ['mElse'] } }
			])
		).rejects.toThrow("That assigned to isn't in Porto.");
		await expect(
			compile([
				{
					action: 'update',
					collection: 'items',
					id: 'lunch',
					data: { assigned_to: ['mOwner', 'mElse'] }
				}
			])
		).rejects.toThrow(/isn't in Porto/);
	});
	it('accepts links within the trip', async () => {
		await expect(
			compile([
				{
					action: 'update',
					collection: 'items',
					id: 'lunch',
					data: { phase: 'pLisbon', assigned_to: ['mTrav'] }
				}
			])
		).resolves.toHaveLength(1);
	});
});

describe('compileOps — fills what the app fills (intent review: stories 17, 19)', () => {
	it("an undated idea lands in the first phase as unplanned; a dated item takes its day's phase", async () => {
		const [idea] = await compile([
			{ action: 'create', collection: 'items', data: { type: 'activity', title: 'Surf' } }
		]);
		expect(idea.after).toMatchObject({ phase: 'pPorto', status: 'unplanned' });
		const [plan] = await compile([
			{
				action: 'create',
				collection: 'items',
				data: { type: 'meal', title: 'Fado', date: '2026-11-06' }
			}
		]);
		expect(plan.after).toMatchObject({ phase: 'pLisbon', status: 'planned', day: 'day06' });
	});
	it('a new list is a manual list; a goal starts unplanned; a scenario starts as a candidate', async () => {
		const [list] = await compile([
			{ action: 'create', collection: 'checklists', data: { title: 'Packing' } }
		]);
		expect(list.after.kind).toBe('manual');
		const [goal] = await compile([
			{ action: 'create', collection: 'trip_goals', data: { title: 'See the sea' } }
		]);
		expect(goal.after.manual_status).toBe('unplanned');
		const [sc] = await compile(
			[{ action: 'create', collection: 'scenarios', data: { title: 'Coast' } }],
			'owner',
			{ start_date: '', end_date: '' }
		);
		expect(sc.after).toMatchObject({ status: 'candidate', champion: 'mOwner' });
	});
});

describe('compileOps — moving to another day moves the times (intent review: story 11)', () => {
	it('re-anchors start, end and span by the same number of days', async () => {
		const [u] = await compile([
			{ action: 'update', collection: 'items', id: 'redeye', data: { date: '2026-11-04' } }
		]);
		expect(u.after).toMatchObject({
			day: 'day04',
			start_time: '2026-11-04 23:30:00.000Z',
			end_time: '2026-11-05 06:10:00.000Z',
			end_date: '2026-11-05 00:00:00.000Z'
		});
		expect(u.before).toMatchObject({ start_time: '2026-11-02 23:30:00.000Z' });
	});
});

describe('compileOps — phase rules the hooks enforce, refused at preview (intent review: story 8)', () => {
	it("refuses a new phase on the trip's first or last day, or outside it", async () => {
		for (const d of ['2026-11-01', '2026-11-08', '2030-01-01']) {
			await expect(
				compile([{ action: 'create', collection: 'phases', data: { name: 'X', start_date: d } }]),
				d
			).rejects.toThrow(/phase/);
		}
		await expect(
			compile([
				{
					action: 'create',
					collection: 'phases',
					data: { name: 'Coast', start_date: '2026-11-03' }
				}
			])
		).resolves.toHaveLength(1);
	});
	it('refuses moving a phase past its neighbour', async () => {
		await expect(
			compile([
				{
					action: 'update',
					collection: 'phases',
					id: 'pLisbon',
					data: { start_date: '2026-11-01' }
				}
			])
		).rejects.toThrow(/must start between/);
	});
	it('refuses phase and budget changes from a traveler (owners only in the app)', async () => {
		await expect(
			compile(
				[
					{
						action: 'create',
						collection: 'phases',
						data: { name: 'Coast', start_date: '2026-11-03' }
					}
				],
				'traveler'
			)
		).rejects.toThrow(/owners/);
		await expect(
			compile(
				[{ action: 'create', collection: 'trip_budgets', data: { categories: [] } }],
				'traveler'
			)
		).rejects.toThrow(/owners/);
	});
	it('lets a traveler edit Phase Notes and nothing else on a phase (#535, phases.pb.js)', async () => {
		await expect(
			compile(
				[{ action: 'update', collection: 'phases', id: 'pPorto', data: { notes: 'Ferry 9am' } }],
				'traveler'
			)
		).resolves.toHaveLength(1);
		await expect(
			compile(
				[
					{
						action: 'update',
						collection: 'phases',
						id: 'pPorto',
						data: { notes: 'x', name: 'Coast' }
					}
				],
				'traveler'
			)
		).rejects.toThrow(/owners/);
	});
});

describe('compileOps — dead Item fields are not writable (#536)', () => {
	it.each(['booked_by', 'paid_by', 'confirmation_codes', 'cost_actual_usd'])(
		'refuses %s on an item',
		async (field) => {
			await expect(
				compile([{ action: 'update', collection: 'items', id: 'lunch', data: { [field]: 'x' } }])
			).rejects.toThrow(`"${field}" isn't something I can set`);
		}
	);
	it('keeps paid_by on expenses, where it lives', () => {
		expect(WRITABLE.expenses.fields).toHaveProperty('paid_by');
	});
});

describe('compileOps — rating (#576)', () => {
	const upd = (id: string, data: Record<string, unknown>) =>
		[{ action: 'update' as const, collection: 'items', id, data }] as WriteOp[];
	it('carries rating through unchanged on a done item (PB hook still clears non-done)', async () => {
		const [u] = await compile(upd('safari', { rating: 'recommend' }));
		expect(u.after).toEqual({ rating: 'recommend' });
		expect(u.before).toEqual({ rating: null });
		const [c] = await compile(upd('safari', { rating: '' }));
		expect(c.after).toEqual({ rating: '' });
	});
	it('refuses rating a non-done item, unless the same change sets status done', async () => {
		await expect(compile(upd('hike', { rating: 'recommend' }))).rejects.toThrow(
			/Only done items can be rated/
		);
		await expect(
			compile(upd('hike', { rating: 'recommend', status: 'considered' }))
		).rejects.toThrow(/Only done items can be rated/);
		await expect(
			compile(upd('hike', { rating: 'recommend', status: 'done' }))
		).resolves.toHaveLength(1);
		await expect(compile(upd('hike', { rating: '' }))).resolves.toHaveLength(1);
	});
	it('traveler: {rating} and {rating, status} admitted on any item; PB owns the rest', async () => {
		await expect(
			compile(upd('safari', { rating: 'not_recommend' }), 'traveler')
		).resolves.toHaveLength(1);
		await expect(
			compile(upd('hike', { rating: 'recommend', status: 'done' }), 'traveler')
		).resolves.toHaveLength(1);
		await expect(compile(upd('hike', { status: 'considered' }), 'traveler')).resolves.toHaveLength(
			1
		);
	});
	it('traveler: any other field alongside is refused', async () => {
		await expect(
			compile(upd('safari', { rating: 'recommend', title: 'x' }), 'traveler')
		).rejects.toThrow(/Only the trip's owners/);
		// pinned old rule: assigned_to is a self field, rating is not, so the mix is refused
		await expect(
			compile(upd('safari', { rating: 'recommend', assigned_to: ['mTrav'] }), 'traveler')
		).rejects.toThrow(/Only the trip's owners/);
	});
	it('does not refuse an archived trip', async () => {
		await expect(
			compile(upd('safari', { rating: 'recommend' }), 'owner', { archived: true })
		).resolves.toHaveLength(1);
	});
});
