import { describe, it, expect } from 'vitest';
import { promotedDisplayOrder, promotePlacement } from './promote';
import { orderDayItems } from '$lib/itinerary/timeline';
import { computeMovePatch } from '$lib/itinerary/move-item';
import type { Item } from '$lib/types';

function makeItem(overrides: Partial<Item> = {}): Item {
	return {
		id: 'item1',
		trip: 'trip1',
		phase: '',
		day: 'day1',
		type: 'activity',
		subtype: '',
		title: 'Test Item',
		description: '',
		location_name: '',
		location_address: '',
		location_coords: null,
		google_place_id: '',
		start_time: '',
		end_time: '',
		start_tz: '',
		end_tz: '',
		end_date: '',
		status: 'planned',
		booked: false,
		booked_by: '',
		paid_by: '',
		confirmation_codes: [],
		reservation_url: '',
		free_cancellation: false,
		cost_estimate_usd: 0,
		cost_actual_usd: 0,
		assigned_to: [],
		sort_order: 0,
		parent_item: '',
		requires_booking: false,
		created_by: '',
		collectionId: '',
		collectionName: '',
		created: '',
		updated: '',
		...overrides
	} as Item;
}

const NOON = new Date('2026-10-15T12:00:00Z');

describe('promotedDisplayOrder — placement after the current moment', () => {
	it('slots the idea after items already started, before upcoming ones', () => {
		const dayItems = [
			makeItem({
				id: 'morning',
				start_time: '2026-10-15 09:00:00.000Z',
				end_time: '2026-10-15 10:00:00.000Z'
			}),
			makeItem({
				id: 'evening',
				start_time: '2026-10-15 19:00:00.000Z',
				end_time: '2026-10-15 20:00:00.000Z'
			})
		];
		const idea = makeItem({ id: 'idea', start_time: '' });
		const order = promotedDisplayOrder(dayItems, idea, NOON).map((i) => i.id);
		// morning (done) → idea → evening (upcoming).
		expect(order).toEqual(['morning', 'idea', 'evening']);
	});

	it('places the idea at the FRONT when the whole day is still ahead', () => {
		const dayItems = [
			makeItem({
				id: 'evening',
				start_time: '2026-10-15 19:00:00.000Z',
				end_time: '2026-10-15 20:00:00.000Z'
			})
		];
		const idea = makeItem({ id: 'idea', start_time: '' });
		const order = promotedDisplayOrder(dayItems, idea, NOON).map((i) => i.id);
		expect(order).toEqual(['idea', 'evening']);
	});

	it('places the idea at the END when everything has already happened', () => {
		const dayItems = [
			makeItem({
				id: 'breakfast',
				start_time: '2026-10-15 08:00:00.000Z',
				end_time: '2026-10-15 09:00:00.000Z'
			}),
			makeItem({
				id: 'lunch',
				start_time: '2026-10-15 11:00:00.000Z',
				end_time: '2026-10-15 11:45:00.000Z'
			})
		];
		const idea = makeItem({ id: 'idea', start_time: '' });
		const order = promotedDisplayOrder(dayItems, idea, NOON).map((i) => i.id);
		expect(order).toEqual(['breakfast', 'lunch', 'idea']);
	});

	it('inserts after an ONGOING item (started, not yet ended)', () => {
		const dayItems = [
			makeItem({
				id: 'ongoing',
				start_time: '2026-10-15 11:30:00.000Z',
				end_time: '2026-10-15 13:00:00.000Z'
			}),
			makeItem({
				id: 'later',
				start_time: '2026-10-15 16:00:00.000Z',
				end_time: '2026-10-15 17:00:00.000Z'
			})
		];
		const idea = makeItem({ id: 'idea', start_time: '' });
		const order = promotedDisplayOrder(dayItems, idea, NOON).map((i) => i.id);
		expect(order).toEqual(['ongoing', 'idea', 'later']);
	});

	it('is idempotent when the idea is already attached to the day array', () => {
		const idea = makeItem({ id: 'idea', start_time: '', day: 'day1', status: 'planned' });
		const dayItems = [
			makeItem({
				id: 'morning',
				start_time: '2026-10-15 09:00:00.000Z',
				end_time: '2026-10-15 10:00:00.000Z'
			}),
			idea
		];
		const order = promotedDisplayOrder(dayItems, idea, NOON).map((i) => i.id);
		// Idea isn't double-counted — appears exactly once, after the morning item.
		expect(order).toEqual(['morning', 'idea']);
	});

	it('excludes multi-day spanning banners from the placement', () => {
		const dayItems = [
			makeItem({ id: 'hotel', end_date: '2026-10-18', start_time: '' }),
			makeItem({
				id: 'morning',
				start_time: '2026-10-15 09:00:00.000Z',
				end_time: '2026-10-15 10:00:00.000Z'
			})
		];
		const idea = makeItem({ id: 'idea', start_time: '' });
		const order = promotedDisplayOrder(dayItems, idea, NOON).map((i) => i.id);
		expect(order).not.toContain('hotel');
		expect(order).toEqual(['morning', 'idea']);
	});
});

describe('promotePlacement — sort_order round-trips the placement', () => {
	it('returns monotonic gap-based orders matching the display order', () => {
		const dayItems = [
			makeItem({
				id: 'morning',
				sort_order: 100,
				start_time: '2026-10-15 09:00:00.000Z',
				end_time: '2026-10-15 10:00:00.000Z'
			}),
			makeItem({
				id: 'evening',
				sort_order: 200,
				start_time: '2026-10-15 19:00:00.000Z',
				end_time: '2026-10-15 20:00:00.000Z'
			})
		];
		const idea = makeItem({ id: 'idea', start_time: '' });
		const updates = promotePlacement(dayItems, idea, NOON);

		// Every day item + the idea gets a fresh, ascending sort_order.
		const byId = Object.fromEntries(updates.map((u) => [u.id, u.sort_order]));
		expect(updates).toHaveLength(3);
		expect(byId['morning']).toBeLessThan(byId['idea']);
		expect(byId['idea']).toBeLessThan(byId['evening']);

		// Re-deriving the day order from the new sort_orders reproduces the placement:
		// the untimed idea weaves between the timed items exactly where we put it.
		const reMaterialised = [
			{ ...dayItems[0], sort_order: byId['morning'] },
			{ ...dayItems[1], sort_order: byId['evening'] },
			{ ...idea, sort_order: byId['idea'] }
		];
		const replayed = orderDayItems(reMaterialised).map((i) => i.id);
		expect(replayed).toEqual(['morning', 'idea', 'evening']);
	});

	it('places the idea last (highest sort_order) when the day is over', () => {
		const dayItems = [
			makeItem({
				id: 'done',
				sort_order: 100,
				start_time: '2026-10-15 08:00:00.000Z',
				end_time: '2026-10-15 09:00:00.000Z'
			})
		];
		const idea = makeItem({ id: 'idea', start_time: '' });
		const updates = promotePlacement(dayItems, idea, NOON);
		const byId = Object.fromEntries(updates.map((u) => [u.id, u.sort_order]));
		expect(byId['idea']).toBeGreaterThan(byId['done']);
	});
});

// #246 Door 2 — skip semantics. Skip has NO dedicated pure module (PRD §7: reuse,
// don't fork): the server action is `computeMovePatch({ newDay: '' })`. These pin
// the contract the Door 2 actions depend on so a change to computeMovePatch that
// would break skip is caught here, next to Door 1's pure tests.
describe('skip semantics — computeMovePatch({ newDay: \'\' }) (Door 2)', () => {
	it('a planned today item → unplanned, day cleared, time stripped, sort reset', () => {
		const patch = computeMovePatch({ currentStatus: 'planned', newDay: '', newPhase: 'phaseA' });
		expect(patch.status).toBe('unplanned');
		expect(patch.day).toBe('');
		expect(patch.start_time).toBe('');
		expect(patch.end_time).toBe('');
		expect(patch.sort_order).toBe(0);
	});

	it('KEEPS the phase so the item returns to its phase parking lot (#196 invariant)', () => {
		const patch = computeMovePatch({ currentStatus: 'planned', newDay: '', newPhase: 'phaseA' });
		expect(patch.phase).toBe('phaseA');
	});

	it('a skipped item NEVER becomes considered — that verdict is Closeout\'s, not skip\'s', () => {
		const patch = computeMovePatch({ currentStatus: 'planned', newDay: '', newPhase: 'phaseA' });
		expect(patch.status).not.toBe('considered');
		expect(patch.status).toBe('unplanned');
	});
});
