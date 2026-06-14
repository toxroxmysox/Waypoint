import { describe, it, expect } from 'vitest';
import { buildTripExport } from './export';
import { validateTripImport } from './import';
import type {
	Trip,
	Phase,
	Day,
	Item,
	TripMember,
	Expense,
	Settlement,
	TripGoal,
	GoalVote
} from '$lib/types';

function makeTrip(overrides: Partial<Trip> = {}): Trip {
	return {
		id: 'trip1',
		collectionId: '',
		collectionName: 'trips',
		created: '2026-01-01',
		updated: '2026-01-01',
		slug: 'test-trip',
		title: 'Test Trip',
		start_date: '2026-06-01',
		end_date: '2026-06-07',
		timezone: 'America/Detroit',
		location_summary: 'Michigan',
		countries: ['US'],
		cover_image: '',
		photo_album_url: '',
		archive_enabled: false,
		archive_publish_after_days: 7,
		public_share_token: '',
		auto_approve_suggestions: true,
		created_by: 'user1',
		archived: false,
		...overrides
	} as Trip;
}

describe('buildTripExport', () => {
	it('exports trip with correct version and structure', () => {
		const result = buildTripExport(makeTrip(), [], [], [], null);
		expect(result._waypoint_version).toBe(1);
		expect(result.trip.title).toBe('Test Trip');
		expect(result.trip.slug).toBe('test-trip');
		expect(result.phases).toEqual([]);
		expect(result.days).toEqual([]);
		expect(result.items).toEqual([]);
		expect(result.budget).toBeNull();
	});

	it('resolves day dates and phase names for items', () => {
		const phases: Phase[] = [
			{ id: 'p1', trip: 'trip1', name: 'Barcelona', location: 'Barcelona', country_code: 'ES', start_date: '2026-06-01', end_date: '2026-06-03', order: 0, collectionId: '', collectionName: 'phases', created: '', updated: '' }
		];
		const days: Day[] = [
			{ id: 'd1', trip: 'trip1', phases: ['p1'], date: '2026-06-01', notes: '', collectionId: '', collectionName: 'days', created: '', updated: '' }
		];
		const items: Item[] = [
			{ id: 'i1', trip: 'trip1', phase: 'p1', day: 'd1', type: 'activity', subtype: '', title: 'Sagrada Familia', description: '', location_name: '', location_address: '', location_coords: null, google_place_id: '', start_time: '', end_time: '', start_tz: '', end_tz: '', end_date: '', status: 'done', booked: true, booked_by: '', paid_by: '', confirmation_codes: [], reservation_url: '', free_cancellation: false, cost_estimate_usd: 0, cost_actual_usd: 0, assigned_to: [], sort_order: 0, parent_item: '', requires_booking: false, created_by: '', collectionId: '', collectionName: 'items', created: '', updated: '' } as Item
		];

		const result = buildTripExport(makeTrip(), phases, days, items, null);
		expect(result.items[0].day_date).toBe('2026-06-01');
		expect(result.items[0].phase_name).toBe('Barcelona');
		expect(result.items[0].title).toBe('Sagrada Familia');
		expect(result.days[0].phase_names).toEqual(['Barcelona']);
	});

	it('strips sensitive fields', () => {
		const result = buildTripExport(
			makeTrip({ public_share_token: 'tok123' }),
			[], [], [], null
		);
		expect(result.trip).not.toHaveProperty('public_share_token');
		expect(result.trip).not.toHaveProperty('id');
		expect(result.trip).not.toHaveProperty('created_by');
	});

	it('includes end_date for multi-day items', () => {
		const result = buildTripExport(
			makeTrip(),
			[],
			[{ id: 'd1', date: '2026-06-18 00:00:00.000Z' } as Day],
			[
				{
					id: 'i1',
					day: 'd1',
					type: 'lodging',
					title: 'Hotel',
					status: 'planned',
					end_date: '2026-06-22 00:00:00.000Z'
				} as Item
			],
			null
		);
		expect(result.items[0].end_date).toBe('2026-06-22 00:00:00.000Z');
	});

	it('includes budget when provided', () => {
		const budget = {
			categories: [{ category: 'food', mode: 'total', daily_amount: null, total: 1500 }]
		};
		const result = buildTripExport(makeTrip(), [], [], [], budget);
		expect(result.budget).toEqual(budget);
	});

	it('exports requires_booking on items (#50/#53)', () => {
		const items = [
			{ id: 'i1', type: 'lodging', title: 'Hotel', status: 'planned', booked: false, requires_booking: true } as Item
		];
		const result = buildTripExport(makeTrip(), [], [], items, null);
		expect(result.items[0].requires_booking).toBe(true);
	});

	it('exports checklists with checked preserved and assignee stripped (#53)', () => {
		const phases: Phase[] = [
			{ id: 'p1', trip: 'trip1', name: 'Barcelona', location: '', country_code: '', start_date: '', end_date: '', order: 0, collectionId: '', collectionName: 'phases', created: '', updated: '' }
		];
		const checklists = [
			{ id: 'c1', trip: 'trip1', phase: '', item: '', title: 'Packing', kind: 'manual', order: 0 },
			{ id: 'c2', trip: 'trip1', phase: 'p1', item: '', title: 'Barcelona musts', kind: 'manual', order: 1 },
			{ id: 'c3', trip: 'trip1', phase: '', item: 'i9', title: 'Grocery', kind: 'manual', order: 2 }, // item-scoped → excluded
			{ id: 'c4', trip: 'trip1', phase: '', item: '', title: 'Booking', kind: 'booking', order: 3 } // smart list → excluded
		] as unknown as import('$lib/types').Checklist[];
		const tasks = [
			{ id: 't1', checklist: 'c1', title: 'Passport', checked: true, assignee: 'mem1', order: 0 },
			{ id: 't2', checklist: 'c1', title: 'Socks', checked: false, assignee: '', order: 1 },
			{ id: 't3', checklist: 'c2', title: 'Sagrada', checked: false, assignee: 'mem2', order: 0 }
		] as unknown as import('$lib/types').Task[];

		const result = buildTripExport(makeTrip(), phases, [], [], null, checklists, tasks);

		expect(result.checklists).toHaveLength(2); // item-scoped + booking excluded
		const packing = result.checklists.find((c) => c.title === 'Packing')!;
		expect(packing.phase_name).toBeNull();
		expect(packing.tasks).toEqual([
			{ title: 'Passport', checked: true },
			{ title: 'Socks', checked: false }
		]);
		// assignee never appears in the export shape
		expect(JSON.stringify(result.checklists)).not.toContain('mem1');
		expect(JSON.stringify(result.checklists)).not.toContain('mem2');

		const bcn = result.checklists.find((c) => c.title === 'Barcelona musts')!;
		expect(bcn.phase_name).toBe('Barcelona');
	});
});

// #174 — the export→import round-trip. A REAL trip's dates come out of PocketBase
// as full datetimes (`YYYY-MM-DD 00:00:00.000Z`); import appends ` 00:00:00.000Z`
// to the calendar-date fields. The bug: export passed the datetime through verbatim,
// so import doubled it into `...000Z 00:00:00.000Z` and PB 400'd. These tests feed
// buildTripExport the PB-stored shape (not the idealized date-only fixtures the rest
// of this file uses) and prove the export is import-safe.
describe('buildTripExport → import round-trip (#174)', () => {
	// Trip as PocketBase actually stores it: dates are full datetimes.
	const pbTrip = makeTrip({
		start_date: '2026-06-01 00:00:00.000Z',
		end_date: '2026-06-07 00:00:00.000Z'
	});
	const pbPhases: Phase[] = [
		{
			id: 'p1',
			trip: 'trip1',
			name: 'Barcelona',
			location: 'Barcelona',
			country_code: 'ES',
			start_date: '2026-06-01 00:00:00.000Z',
			end_date: '2026-06-03 00:00:00.000Z',
			order: 0,
			collectionId: '',
			collectionName: 'phases',
			created: '',
			updated: ''
		}
	];
	const pbDays: Day[] = [
		{
			id: 'd1',
			trip: 'trip1',
			phases: ['p1'],
			date: '2026-06-01 00:00:00.000Z',
			notes: '',
			collectionId: '',
			collectionName: 'days',
			created: '',
			updated: ''
		}
	];
	const pbItems: Item[] = [
		{
			id: 'i1',
			trip: 'trip1',
			phase: 'p1',
			day: 'd1',
			type: 'activity',
			title: 'Sagrada Familia',
			status: 'planned',
			start_time: '2026-06-01 09:00:00.000Z',
			end_date: '',
			booked: false
		} as Item
	];

	it('export of PB-stored dates passes validateTripImport cleanly', () => {
		const exported = buildTripExport(pbTrip, pbPhases, pbDays, pbItems, null);
		// Serialize → parse, exactly like a downloaded file fed back into import.
		const roundTripped = JSON.parse(JSON.stringify(exported));
		const result = validateTripImport(roundTripped);
		expect(result.errors).toEqual([]);
		expect(result.valid).toBe(true);
	});

	it('emits bare YYYY-MM-DD for every calendar-date field (no datetime to double up)', () => {
		const exported = buildTripExport(pbTrip, pbPhases, pbDays, pbItems, null);
		const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
		expect(exported.trip.start_date).toMatch(dateOnly);
		expect(exported.trip.end_date).toMatch(dateOnly);
		expect(exported.phases[0].start_date).toMatch(dateOnly);
		expect(exported.phases[0].end_date).toMatch(dateOnly);
		expect(exported.days[0].date).toMatch(dateOnly);
		expect(exported.items[0].day_date).toMatch(dateOnly);
	});

	it("import's ' 00:00:00.000Z' concatenation yields a valid datetime (regression guard)", () => {
		const exported = buildTripExport(pbTrip, pbPhases, pbDays, pbItems, null);
		// Reproduce the exact concatenation import does, then assert PB-parseable.
		const composed = exported.trip.start_date + ' 00:00:00.000Z';
		expect(composed).toBe('2026-06-01 00:00:00.000Z');
		expect(Number.isNaN(Date.parse(composed))).toBe(false);
		const dayComposed = exported.days[0].date + ' 00:00:00.000Z';
		expect(dayComposed).toBe('2026-06-01 00:00:00.000Z');
		// item.day_date must re-key the dayMap on import → must equal the day's date.
		expect(exported.items[0].day_date).toBe(exported.days[0].date);
	});

	it('passes wall-clock datetime fields (start_time) through verbatim', () => {
		const exported = buildTripExport(pbTrip, pbPhases, pbDays, pbItems, null);
		// These are NOT concatenated by import; full datetime is correct here.
		expect(exported.items[0].start_time).toBe('2026-06-01 09:00:00.000Z');
	});
});

// #174 — coverage extension: money ledger + goals snapshot.
describe('buildTripExport coverage extension (#174)', () => {
	const members: TripMember[] = [
		{ id: 'm1', display_name: 'Ana', role: 'owner' } as unknown as TripMember,
		{ id: 'm2', display_name: 'Bo', role: 'traveler' } as unknown as TripMember
	];
	const expenses: Expense[] = [
		{
			id: 'e1',
			paid_by: 'm1',
			amount_usd: 120,
			description: 'Tapas',
			date: '2026-06-02 00:00:00.000Z',
			category: 'food',
			split_mode: 'equal',
			split_data: { members: ['m1', 'm2'] }
		} as Expense
	];
	const settlements: Settlement[] = [
		{
			id: 's1',
			from_member: 'm2',
			to_member: 'm1',
			amount_usd: 60,
			date: '2026-06-03',
			note: 'square up'
		} as Settlement
	];
	const goals: TripGoal[] = [
		{
			id: 'g1',
			title: 'See art',
			description: 'museums',
			manual_status: 'planned',
			sort_order: 0,
			created_by: 'm1'
		} as unknown as TripGoal
	];
	const goalVotes: GoalVote[] = [
		{ id: 'gv1', goal: 'g1', member: 'm2', value: 'love' } as GoalVote,
		{ id: 'gv2', goal: 'gOTHER', member: 'm1', value: 'like' } as GoalVote
	];

	it('includes members/expenses/settlements/goals snapshots with member refs', () => {
		const result = buildTripExport(
			makeTrip(),
			[],
			[],
			[],
			null,
			[],
			[],
			members,
			expenses,
			settlements,
			goals,
			goalVotes
		);
		expect(result.members).toEqual([
			{ ref: 'm1', display_name: 'Ana', role: 'owner' },
			{ ref: 'm2', display_name: 'Bo', role: 'traveler' }
		]);
		expect(result.expenses[0]).toMatchObject({
			paid_by_ref: 'm1',
			amount_usd: 120,
			date: '2026-06-02', // normalized to date-only
			category: 'food'
		});
		expect(result.settlements[0]).toMatchObject({
			from_member_ref: 'm2',
			to_member_ref: 'm1',
			amount_usd: 60,
			date: '2026-06-03'
		});
		expect(result.goals[0].title).toBe('See art');
		expect(result.goals[0].created_by_ref).toBe('m1');
		// only this goal's votes; the unrelated gOTHER vote is excluded
		expect(result.goals[0].votes).toEqual([{ member_ref: 'm2', value: 'love' }]);
	});

	it('never leaks member email / user id in the snapshot', () => {
		const withPii: TripMember[] = [
			{
				id: 'm1',
				display_name: 'Ana',
				role: 'owner',
				user: 'usr_secret',
				placeholder_email: 'ana@example.com'
			} as unknown as TripMember
		];
		const result = buildTripExport(makeTrip(), [], [], [], null, [], [], withPii);
		const json = JSON.stringify(result.members);
		expect(json).not.toContain('usr_secret');
		expect(json).not.toContain('ana@example.com');
	});

	it('defaults the snapshot sections to empty arrays when omitted', () => {
		const result = buildTripExport(makeTrip(), [], [], [], null);
		expect(result.members).toEqual([]);
		expect(result.expenses).toEqual([]);
		expect(result.settlements).toEqual([]);
		expect(result.goals).toEqual([]);
	});
});
