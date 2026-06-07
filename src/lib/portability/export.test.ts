import { describe, it, expect } from 'vitest';
import { buildTripExport } from './export';
import type { Trip, Phase, Day, Item } from '$lib/types';

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
		vault_password_hash: '',
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
			makeTrip({ vault_password_hash: 'secret:hash', public_share_token: 'tok123' }),
			[], [], [], null
		);
		expect(result.trip).not.toHaveProperty('vault_password_hash');
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
