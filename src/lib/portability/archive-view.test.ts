import { describe, it, expect } from 'vitest';
import { buildArchiveView, archiveBudgetSummary } from './archive-view';
import type { Trip, Phase, Day, Item, Expense } from '$lib/types';

function makeTrip(): Trip {
	return {
		id: 'trip1', collectionId: '', collectionName: 'trips', created: '', updated: '',
		slug: 't', title: 'Trip', start_date: '2026-06-01', end_date: '2026-06-07',
		timezone: 'UTC', location_summary: '', countries: [], cover_image: '', photo_album_url: '',
		archive_enabled: true, archive_publish_after_days: 7, archive_publish_at: '',
		archive_show_budget: false, public_share_token: 'tok',
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

	it('kept parking-lot ideas flow into "what we considered" once marked considered (#243)', () => {
		// The owner ideas-review step flips a kept idea unplanned→considered; it then
		// appears in consideredItems exactly like any explicitly-considered item.
		const withKept = buildArchiveView(makeTrip(), [] as Phase[], [] as Day[], [
			makeItem({ id: 'kept', status: 'considered', title: 'Kept idea' }),
			makeItem({ id: 'dropped', status: 'unplanned', title: 'Dropped idea' })
		]);
		const ids = withKept.consideredItems.map((i) => i.id);
		expect(ids).toContain('kept');
		expect(ids).not.toContain('dropped'); // a dropped (still unplanned) idea stays out
	});
});

function makeExpense(amount: number): Expense {
	return {
		id: 'e', trip: 'trip1', paid_by: 'm1', amount_usd: amount, description: '', date: '2026-06-01',
		category: 'food', linked_item: null, split_mode: 'equal', split_data: { members: [] },
		created_by: '', created: '', updated: ''
	} as Expense;
}

describe('archiveBudgetSummary (#243 — opt-in public budget, summary only)', () => {
	it('total = sum of amounts; per-person = total ÷ member count (rounded)', () => {
		const s = archiveBudgetSummary([makeExpense(100), makeExpense(50), makeExpense(30)], 4);
		expect(s.total).toBe(180);
		expect(s.perPerson).toBe(45); // 180 / 4
	});

	it('rounds per-person to whole dollars (rough)', () => {
		const s = archiveBudgetSummary([makeExpense(100)], 3);
		expect(s.total).toBe(100);
		expect(s.perPerson).toBe(33); // 100/3 = 33.33 → 33
	});

	it('zero members → no divide-by-zero (perPerson 0)', () => {
		const s = archiveBudgetSummary([makeExpense(100)], 0);
		expect(s.total).toBe(100);
		expect(s.perPerson).toBe(0);
	});

	it('no expenses → $0 summary', () => {
		expect(archiveBudgetSummary([], 4)).toEqual({ total: 0, perPerson: 0 });
	});
});

describe('buildArchiveView budget opt-in (#243)', () => {
	it('omits budgetSummary when archive_show_budget is off (default)', () => {
		const t = makeTrip();
		t.archive_show_budget = false;
		const v = buildArchiveView(t, [] as Phase[], [] as Day[], [], {
			expenses: [makeExpense(100)],
			memberCount: 2
		});
		expect(v.budgetSummary).toBeNull();
	});

	it('includes the summary (total + per-person ONLY) when opted in', () => {
		const t = makeTrip();
		t.archive_show_budget = true;
		const v = buildArchiveView(t, [] as Phase[], [] as Day[], [], {
			expenses: [makeExpense(100), makeExpense(100)],
			memberCount: 2
		});
		expect(v.budgetSummary).toEqual({ total: 200, perPerson: 100 });
		// Never leaks itemized expenses or who-owes-whom.
		const serialized = JSON.stringify(v);
		expect(serialized).not.toContain('paid_by');
		expect(serialized).not.toContain('split_data');
	});

	it('opted in but no expenses provided → no summary (null)', () => {
		const t = makeTrip();
		t.archive_show_budget = true;
		const v = buildArchiveView(t, [] as Phase[], [] as Day[], []);
		expect(v.budgetSummary).toBeNull();
	});
});
