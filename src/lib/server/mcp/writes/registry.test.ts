import { describe, it, expect } from 'vitest';
import { WRITABLE, BLOCKED_COLLECTIONS, blockedReason } from './registry';
import type { Trip } from '$lib/types';

const dated = {
	start_date: '2026-11-01 00:00:00.000Z',
	end_date: '2026-11-08 00:00:00.000Z'
} as Trip;
const dateless = { start_date: '', end_date: '' } as Trip;

describe("blockedReason — the can't-list", () => {
	it('blocks members and invitations', () => {
		expect(blockedReason('trip_members')).not.toBeNull();
		expect(blockedReason('pending_invites')).not.toBeNull();
	});
	it('blocks authorship fields', () => {
		expect(blockedReason('items', 'created_by')).not.toBeNull();
	});
	it('blocks AI settings', () => {
		expect(blockedReason('trips', 'ai_write')).not.toBeNull();
		expect(blockedReason('trips', 'ai_access')).not.toBeNull();
	});
	it('blocks file fields (upload deferred)', () => {
		expect(blockedReason('memories', 'photo')).not.toBeNull();
	});
	it('allows an ordinary field', () => {
		expect(blockedReason('items', 'title')).toBeNull();
	});
	it('blocks a collection nobody classified', () => {
		expect(blockedReason('brand_new_thing')).not.toBeNull();
	});
	it('blocks a per-collection field (scenario status is set by choosing)', () => {
		expect(blockedReason('scenarios', 'status')).not.toBeNull();
	});
	it('no collection is both writable and blocked', () => {
		for (const name of BLOCKED_COLLECTIONS) expect(WRITABLE[name]).toBeUndefined();
	});
});

describe('registry validate — rules the app checked only in its forms', () => {
	it('refuses an unknown timezone', () => {
		expect(
			WRITABLE.trips.validate!({ timezone: 'Mars/Olympus' }, { action: 'update', trip: dated })
		).toMatch(/timezone/i);
		expect(
			WRITABLE.trips.validate!({ timezone: 'Europe/Lisbon' }, { action: 'update', trip: dated })
		).toBeNull();
	});
	it('closes scenarios once the trip has dates', () => {
		expect(WRITABLE.scenarios.validate!({ title: 'x' }, { action: 'create', trip: dated })).toMatch(
			/already has dates/
		);
		expect(
			WRITABLE.scenarios.validate!({ title: 'x' }, { action: 'create', trip: dateless })
		).toBeNull();
	});
	it('wants scenario dates both-or-neither and in order', () => {
		const ctx = { action: 'create' as const, trip: dateless };
		expect(WRITABLE.scenarios.validate!({ date_start: '2027-01-01' }, ctx)).toMatch(/both dates/);
		expect(
			WRITABLE.scenarios.validate!({ date_start: '2027-01-05', date_end: '2027-01-01' }, ctx)
		).toMatch(/before/);
	});
	it('refuses negative budgets', () => {
		expect(
			WRITABLE.money_units.validate!({ budget_usd: -5 }, { action: 'create', trip: dated })
		).toMatch(/budget/i);
		expect(
			WRITABLE.scenarios.validate!({ budget_per_person: -1 }, { action: 'create', trip: dateless })
		).toMatch(/budget/i);
	});
	it('closes the availability poll once the trip has dates', () => {
		expect(
			WRITABLE.availability.validate!({ value: 'available' }, { action: 'create', trip: dated })
		).toMatch(/already has dates/);
	});
	it('only takes code documents (file upload deferred)', () => {
		expect(
			WRITABLE.documents.validate!({ kind: 'file' }, { action: 'create', trip: dated })
		).toMatch(/upload/i);
		expect(
			WRITABLE.documents.validate!(
				{ kind: 'code', code_value: 'X' },
				{ action: 'create', trip: dated }
			)
		).toBeNull();
	});
});
