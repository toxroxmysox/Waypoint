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
			{ id: 'p1', trip: 'trip1', name: 'Barcelona', location: 'Barcelona', country_code: 'ES', start_date: '2026-06-01', end_date: '2026-06-03', color: '#ff0000', order: 0, collectionId: '', collectionName: 'phases', created: '', updated: '' }
		];
		const days: Day[] = [
			{ id: 'd1', trip: 'trip1', phases: ['p1'], date: '2026-06-01', notes: '', collectionId: '', collectionName: 'days', created: '', updated: '' }
		];
		const items: Item[] = [
			{ id: 'i1', trip: 'trip1', phase: 'p1', day: 'd1', slot: 'morning', type: 'activity', subtype: '', title: 'Sagrada Familia', description: '', location_name: '', location_address: '', location_coords: null, google_place_id: '', start_time: '', end_time: '', start_tz: '', end_tz: '', status: 'done', booked: true, booked_by: '', paid_by: '', confirmation_codes: [], reservation_url: '', free_cancellation: false, cost_estimate_usd: 0, cost_actual_usd: 0, assigned_to: [], rank: 0, parking_lot_scope: 'none', parent_item: '', created_by: '', collectionId: '', collectionName: 'items', created: '', updated: '' } as Item
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

	it('includes budget when provided', () => {
		const budget = {
			categories: [{ category: 'food', mode: 'total', daily_amount: null, total: 1500 }]
		};
		const result = buildTripExport(makeTrip(), [], [], [], budget);
		expect(result.budget).toEqual(budget);
	});
});
