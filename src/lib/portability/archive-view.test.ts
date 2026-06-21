import { describe, it, expect } from 'vitest';
import { buildArchiveView } from './archive-view';
import type { Trip, Phase, Day, Item } from '$lib/types';

function makeTrip(): Trip {
	return {
		id: 'trip1', collectionId: '', collectionName: 'trips', created: '', updated: '',
		slug: 't', title: 'Trip', start_date: '2026-06-01', end_date: '2026-06-07',
		timezone: 'UTC', location_summary: '', countries: [], cover_image: '', photo_album_url: '',
		archive_enabled: true, archive_publish_after_days: 7, public_share_token: 'tok',
		auto_approve_suggestions: true, created_by: 'u', archived: true
	} as Trip;
}

function makeItem(o: Partial<Item>): Item {
	return {
		id: 'i', trip: 'trip1', phase: '', day: 'd1', type: 'lodging', subtype: '', title: 'Hotel',
		description: '', location_name: '', location_address: '', location_coords: null, google_place_id: '',
		start_time: '', end_time: '', start_tz: '', end_tz: '', end_date: '', status: 'done',
		booked: true, booked_by: 'mem1', paid_by: '', confirmation_codes: [{ label: 'PNR', value: 'ABC' }],
		reservation_url: 'https://secret', free_cancellation: false, cost_estimate_usd: 999, cost_actual_usd: 999,
		assigned_to: ['mem1'], sort_order: 0, parent_item: '', requires_booking: true, created_by: '',
		collectionId: '', collectionName: 'items', created: '', updated: '', ...o
	} as Item;
}

describe('buildArchiveView (#53 — Public Archive excludes checklists)', () => {
	const view = buildArchiveView(makeTrip(), [] as Phase[], [] as Day[], [makeItem({})]);

	it('output contains no checklist or task data', () => {
		expect(view).not.toHaveProperty('checklists');
		expect(view).not.toHaveProperty('tasks');
		const serialized = JSON.stringify(view);
		expect(serialized).not.toContain('checklist');
		expect(serialized).not.toContain('"task"');
	});

	it('sanitizes items to display fields only — no booked/assignee/cost/PII', () => {
		const item = view.doneItems[0];
		expect(item).not.toHaveProperty('booked');
		expect(item).not.toHaveProperty('booked_by');
		expect(item).not.toHaveProperty('assigned_to');
		expect(item).not.toHaveProperty('cost_estimate_usd');
		expect(item).not.toHaveProperty('reservation_url');
		expect(item).not.toHaveProperty('confirmation_codes');
		const serialized = JSON.stringify(view);
		expect(serialized).not.toContain('mem1');
		expect(serialized).not.toContain('secret');
	});

	it('does not leak the share token', () => {
		expect(view.trip).not.toHaveProperty('public_share_token');
	});
});

describe('buildArchiveView planned-leak guard (#240 — Grill Resolution #16)', () => {
	const items = [
		makeItem({ id: 'done1', status: 'done', title: 'Visited the museum' }),
		makeItem({ id: 'cons1', status: 'considered', title: 'Considered the hike' }),
		makeItem({ id: 'plan1', status: 'planned', title: 'Never-walked plan' }),
		makeItem({ id: 'unpl1', status: 'unplanned', title: 'Parking-lot idea' })
	];
	const view = buildArchiveView(makeTrip(), [] as Phase[], [] as Day[], items);

	it('"what we considered" = explicitly-considered only, never stray planned', () => {
		const ids = view.consideredItems.map((i) => i.id);
		expect(ids).toEqual(['cons1']);
		expect(ids).not.toContain('plan1'); // a planned item must not masquerade as considered
		expect(ids).not.toContain('done1');
		expect(ids).not.toContain('unpl1');
	});

	it('done set = done items only', () => {
		expect(view.doneItems.map((i) => i.id)).toEqual(['done1']);
	});
});
