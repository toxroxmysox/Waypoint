import { describe, it, expect } from 'vitest';
import { currentPhaseId } from './current-phase';
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

describe('currentPhaseId — active-item phase', () => {
	it('returns the phase of the ongoing item', () => {
		const todayItems = [
			makeItem({
				id: 'lunch',
				phase: 'phaseB',
				start_time: '2026-10-15 11:30:00.000Z',
				end_time: '2026-10-15 13:00:00.000Z'
			})
		];
		const got = currentPhaseId({ todayItems, now: NOON, forwardItems: [], fallbackPhaseId: 'day' });
		expect(got).toBe('phaseB');
	});

	it('picks the ongoing item with the latest end_time when several overlap', () => {
		const todayItems = [
			makeItem({
				id: 'short',
				phase: 'phaseA',
				start_time: '2026-10-15 11:00:00.000Z',
				end_time: '2026-10-15 12:30:00.000Z'
			}),
			makeItem({
				id: 'long',
				phase: 'phaseB',
				start_time: '2026-10-15 11:00:00.000Z',
				end_time: '2026-10-15 14:00:00.000Z'
			})
		];
		const got = currentPhaseId({ todayItems, now: NOON, forwardItems: [], fallbackPhaseId: 'day' });
		expect(got).toBe('phaseB');
	});

	it('prefers an active item over a more-recently-started but ended one', () => {
		const todayItems = [
			makeItem({
				id: 'morning',
				phase: 'phaseA',
				start_time: '2026-10-15 08:00:00.000Z',
				end_time: '2026-10-15 09:00:00.000Z'
			}),
			makeItem({
				id: 'now',
				phase: 'phaseB',
				start_time: '2026-10-15 11:45:00.000Z',
				end_time: '2026-10-15 12:30:00.000Z'
			})
		];
		const got = currentPhaseId({ todayItems, now: NOON, forwardItems: [], fallbackPhaseId: 'day' });
		expect(got).toBe('phaseB');
	});
});

describe('currentPhaseId — most-recent-by-time fallback (no active item)', () => {
	it('uses the latest-STARTED item at/before now, not list/sort_order position', () => {
		// `early` sits later in the array and carries a higher sort_order, but
		// `late` started more recently — time, not position, decides.
		const todayItems = [
			makeItem({
				id: 'late',
				phase: 'phaseB',
				sort_order: 100,
				start_time: '2026-10-15 10:00:00.000Z',
				end_time: '2026-10-15 11:00:00.000Z'
			}),
			makeItem({
				id: 'early',
				phase: 'phaseA',
				sort_order: 900,
				start_time: '2026-10-15 08:00:00.000Z',
				end_time: '2026-10-15 09:00:00.000Z'
			})
		];
		const got = currentPhaseId({ todayItems, now: NOON, forwardItems: [], fallbackPhaseId: 'day' });
		expect(got).toBe('phaseB');
	});

	it('ignores future items (not yet started) when choosing the most recent', () => {
		const todayItems = [
			makeItem({
				id: 'done',
				phase: 'phaseA',
				start_time: '2026-10-15 09:00:00.000Z',
				end_time: '2026-10-15 10:00:00.000Z'
			}),
			makeItem({
				id: 'future',
				phase: 'phaseB',
				start_time: '2026-10-15 18:00:00.000Z',
				end_time: '2026-10-15 19:00:00.000Z'
			})
		];
		const got = currentPhaseId({ todayItems, now: NOON, forwardItems: [], fallbackPhaseId: 'day' });
		expect(got).toBe('phaseA');
	});

	it('ignores untimed items (no clock position) for the current moment', () => {
		const todayItems = [
			makeItem({ id: 'idea', phase: 'phaseZ', start_time: '', sort_order: 50 }),
			makeItem({
				id: 'timed',
				phase: 'phaseA',
				start_time: '2026-10-15 09:00:00.000Z',
				end_time: '2026-10-15 10:00:00.000Z'
			})
		];
		const got = currentPhaseId({ todayItems, now: NOON, forwardItems: [], fallbackPhaseId: 'day' });
		expect(got).toBe('phaseA');
	});
});

describe('currentPhaseId — transport/flight transition (arriving phase)', () => {
	it('a flight in progress → the phase of the next item travelled toward today', () => {
		const todayItems = [
			makeItem({
				id: 'flight',
				type: 'flight',
				phase: 'phaseA',
				start_time: '2026-10-15 11:00:00.000Z',
				end_time: '2026-10-15 13:00:00.000Z'
			}),
			makeItem({
				id: 'dinner',
				phase: 'phaseB',
				start_time: '2026-10-15 19:00:00.000Z',
				end_time: '2026-10-15 21:00:00.000Z'
			})
		];
		const got = currentPhaseId({ todayItems, now: NOON, forwardItems: [], fallbackPhaseId: 'day' });
		// Mid-flight: phase = the ARRIVING phase, not the flight's own departing phase.
		expect(got).toBe('phaseB');
	});

	it('a just-finished transport leg → arriving phase of the next item', () => {
		const todayItems = [
			makeItem({
				id: 'train',
				type: 'transportation',
				phase: 'phaseA',
				start_time: '2026-10-15 10:00:00.000Z',
				end_time: '2026-10-15 11:30:00.000Z'
			}),
			makeItem({
				id: 'checkin',
				phase: 'phaseB',
				start_time: '2026-10-15 15:00:00.000Z',
				end_time: '2026-10-15 16:00:00.000Z'
			})
		];
		const got = currentPhaseId({ todayItems, now: NOON, forwardItems: [], fallbackPhaseId: 'day' });
		expect(got).toBe('phaseB');
	});

	it('CROSS-DAY: a late-night flight with nothing else today → next-day arriving phase', () => {
		const todayItems = [
			makeItem({
				id: 'redeye',
				type: 'flight',
				phase: 'phaseA',
				start_time: '2026-10-15 11:30:00.000Z',
				end_time: '2026-10-15 13:30:00.000Z'
			})
		];
		// The arriving item is on a LATER day — supplied via forwardItems.
		const forwardItems = [
			makeItem({
				id: 'breakfast',
				phase: 'phaseB',
				day: 'day2',
				start_time: '2026-10-16 08:00:00.000Z',
				end_time: '2026-10-16 09:00:00.000Z'
			})
		];
		const got = currentPhaseId({ todayItems, now: NOON, forwardItems, fallbackPhaseId: 'day' });
		expect(got).toBe('phaseB');
	});

	it('skips a chained connecting leg to the first real destination', () => {
		const todayItems = [
			makeItem({
				id: 'leg1',
				type: 'flight',
				phase: 'phaseA',
				start_time: '2026-10-15 11:00:00.000Z',
				end_time: '2026-10-15 12:30:00.000Z'
			}),
			makeItem({
				id: 'leg2',
				type: 'flight',
				phase: 'phaseMid',
				start_time: '2026-10-15 14:00:00.000Z',
				end_time: '2026-10-15 16:00:00.000Z'
			}),
			makeItem({
				id: 'hotel',
				phase: 'phaseC',
				start_time: '2026-10-15 18:00:00.000Z',
				end_time: '2026-10-15 19:00:00.000Z'
			})
		];
		const got = currentPhaseId({ todayItems, now: NOON, forwardItems: [], fallbackPhaseId: 'day' });
		// leg1 active → skip the connecting leg2 → arrive at the hotel's phase.
		expect(got).toBe('phaseC');
	});

	it('transit with no destination recorded → day fallback (not the departing phase)', () => {
		const todayItems = [
			makeItem({
				id: 'bus',
				type: 'transportation',
				phase: 'phaseA',
				start_time: '2026-10-15 11:00:00.000Z',
				end_time: '2026-10-15 13:00:00.000Z'
			})
		];
		const got = currentPhaseId({
			todayItems,
			now: NOON,
			forwardItems: [],
			fallbackPhaseId: 'dayPhase'
		});
		expect(got).toBe('dayPhase');
	});
});

describe('currentPhaseId — no items → primaryPhaseForDay', () => {
	it('returns the day fallback phase when there are no items at all', () => {
		const got = currentPhaseId({
			todayItems: [],
			now: NOON,
			forwardItems: [],
			fallbackPhaseId: 'dayPhase'
		});
		expect(got).toBe('dayPhase');
	});

	it('returns the day fallback when only future items exist (none started yet)', () => {
		const todayItems = [
			makeItem({
				id: 'later',
				phase: 'phaseB',
				start_time: '2026-10-15 20:00:00.000Z',
				end_time: '2026-10-15 21:00:00.000Z'
			})
		];
		const got = currentPhaseId({
			todayItems,
			now: NOON,
			forwardItems: [],
			fallbackPhaseId: 'dayPhase'
		});
		expect(got).toBe('dayPhase');
	});

	it('returns the day fallback when only untimed ideas exist', () => {
		const todayItems = [
			makeItem({ id: 'idea1', phase: 'phaseB', start_time: '' }),
			makeItem({ id: 'idea2', phase: 'phaseC', start_time: '' })
		];
		const got = currentPhaseId({
			todayItems,
			now: NOON,
			forwardItems: [],
			fallbackPhaseId: 'dayPhase'
		});
		expect(got).toBe('dayPhase');
	});
});

describe('currentPhaseId — multi-phase boundary days', () => {
	it('resolves the live phase on a 3-phase boundary day from the active item', () => {
		// A day touching phases A, B, C; we are mid-way through the phase-B item.
		const todayItems = [
			makeItem({
				id: 'a',
				phase: 'phaseA',
				start_time: '2026-10-15 08:00:00.000Z',
				end_time: '2026-10-15 09:00:00.000Z'
			}),
			makeItem({
				id: 'b',
				phase: 'phaseB',
				start_time: '2026-10-15 11:30:00.000Z',
				end_time: '2026-10-15 13:00:00.000Z'
			}),
			makeItem({
				id: 'c',
				phase: 'phaseC',
				start_time: '2026-10-15 18:00:00.000Z',
				end_time: '2026-10-15 19:00:00.000Z'
			})
		];
		const got = currentPhaseId({ todayItems, now: NOON, forwardItems: [], fallbackPhaseId: 'day' });
		expect(got).toBe('phaseB');
	});

	it('after the phase-A block ends but before phase-B starts, current = phase A (last done)', () => {
		const todayItems = [
			makeItem({
				id: 'a',
				phase: 'phaseA',
				start_time: '2026-10-15 08:00:00.000Z',
				end_time: '2026-10-15 11:00:00.000Z'
			}),
			makeItem({
				id: 'b',
				phase: 'phaseB',
				start_time: '2026-10-15 14:00:00.000Z',
				end_time: '2026-10-15 16:00:00.000Z'
			})
		];
		// Noon: A has ended, B hasn't started, neither is transit → most-recent = A.
		const got = currentPhaseId({ todayItems, now: NOON, forwardItems: [], fallbackPhaseId: 'day' });
		expect(got).toBe('phaseA');
	});
});
