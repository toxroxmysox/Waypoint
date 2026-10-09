import { describe, it, expect } from 'vitest';
import { getNowViewState, getNowFeed } from './now-state';
import { tripNow } from '$lib/shell/trip-time';
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
		created_by: '',
		collectionId: '',
		collectionName: '',
		created: '',
		updated: '',
		...overrides
	} as Item;
}

describe('getNowViewState — Focus + forward list (#153)', () => {
	describe('no-day', () => {
		it('returns no-day focus and empty forward list when hasToday is false', () => {
			const state = getNowViewState([], new Date('2026-10-15T14:00:00Z'), false);
			expect(state.focus.kind).toBe('no-day');
			expect(state.forwardItems).toEqual([]);
		});
	});

	describe('mid-event focus', () => {
		it('focuses the ongoing item with minutesRemaining to its end', () => {
			const items = [
				makeItem({
					id: 'lunch',
					start_time: '2026-10-15 12:00:00.000Z',
					end_time: '2026-10-15 14:30:00.000Z',
					title: 'Lunch'
				})
			];
			const state = getNowViewState(items, new Date('2026-10-15T13:00:00Z'), true);
			expect(state.focus.kind).toBe('mid-event');
			if (state.focus.kind === 'mid-event') {
				expect(state.focus.currentItem.id).toBe('lunch');
				expect(state.focus.minutesRemaining).toBe(90);
			}
		});

		it('#430: every ongoing item is a Hero (no longer only the one that ends last)', () => {
			const items = [
				makeItem({ id: 'a', start_time: '2026-10-15 12:00:00.000Z', end_time: '2026-10-15 14:00:00.000Z' }),
				makeItem({ id: 'b', start_time: '2026-10-15 13:00:00.000Z', end_time: '2026-10-15 15:00:00.000Z' })
			];
			const state = getNowViewState(items, new Date('2026-10-15T13:30:00Z'), true);
			expect(state.focus.kind).toBe('mid-event');
			if (state.focus.kind === 'mid-event') {
				expect(state.focus.heroes.map((i) => i.id)).toEqual(['a', 'b']);
				expect(state.focus.currentItem.id).toBe('a');
			}
		});

		it('#430: the viewer\'s items lead, then everyone else\'s, each group by start time', () => {
			const items = [
				makeItem({ id: 'other-early', start_time: '2026-10-15 09:00:00.000Z', end_time: '2026-10-15 15:00:00.000Z', assigned_to: ['m2'] }),
				makeItem({ id: 'mine-late', start_time: '2026-10-15 12:30:00.000Z', end_time: '2026-10-15 15:00:00.000Z', assigned_to: ['m2', 'me'] }),
				makeItem({ id: 'nobody', start_time: '2026-10-15 11:00:00.000Z', end_time: '2026-10-15 15:00:00.000Z' }),
				makeItem({ id: 'mine-early', start_time: '2026-10-15 10:00:00.000Z', end_time: '2026-10-15 15:00:00.000Z', assigned_to: ['me'] })
			];
			const state = getNowViewState(items, new Date('2026-10-15T13:00:00Z'), true, 'me');
			if (state.focus.kind !== 'mid-event') throw new Error('expected mid-event');
			expect(state.focus.heroes.map((i) => i.id)).toEqual(['mine-early', 'mine-late', 'other-early', 'nobody']);
		});

		it('#430: without a viewer id the order is plain start time', () => {
			const items = [
				makeItem({ id: 'b', start_time: '2026-10-15 12:30:00.000Z', end_time: '2026-10-15 15:00:00.000Z', assigned_to: ['me'] }),
				makeItem({ id: 'a', start_time: '2026-10-15 12:00:00.000Z', end_time: '2026-10-15 15:00:00.000Z' })
			];
			const state = getNowViewState(items, new Date('2026-10-15T13:00:00Z'), true);
			if (state.focus.kind !== 'mid-event') throw new Error('expected mid-event');
			expect(state.focus.heroes.map((i) => i.id)).toEqual(['a', 'b']);
		});

		it('forward list during mid-event holds only items after now, not the ongoing focus item', () => {
			const items = [
				makeItem({ id: 'now', start_time: '2026-10-15 12:00:00.000Z', end_time: '2026-10-15 14:00:00.000Z' }),
				makeItem({ id: 'later', start_time: '2026-10-15 16:00:00.000Z', end_time: '2026-10-15 18:00:00.000Z' })
			];
			const state = getNowViewState(items, new Date('2026-10-15T13:00:00Z'), true);
			expect(state.forwardItems.map((i) => i.id)).toEqual(['later']);
		});

		it('forward list is empty when the ongoing item is the last thing today', () => {
			const items = [
				makeItem({ id: 'now', start_time: '2026-10-15 12:00:00.000Z', end_time: '2026-10-15 14:00:00.000Z' })
			];
			const state = getNowViewState(items, new Date('2026-10-15T13:00:00Z'), true);
			expect(state.forwardItems).toEqual([]);
		});
	});

	describe('free-time focus', () => {
		it('focuses "Xh until next" with the next item as forwardItems[0] (normal-weight list entry)', () => {
			const items = [
				makeItem({ id: 'past', start_time: '2026-10-15 09:00:00.000Z', end_time: '2026-10-15 10:00:00.000Z' }),
				makeItem({
					id: 'dinner',
					start_time: '2026-10-15 16:00:00.000Z',
					end_time: '2026-10-15 18:00:00.000Z',
					title: 'Dinner'
				})
			];
			const state = getNowViewState(items, new Date('2026-10-15T12:00:00Z'), true);
			expect(state.focus.kind).toBe('free-time');
			if (state.focus.kind === 'free-time') {
				expect(state.focus.nextItem.id).toBe('dinner');
				expect(state.focus.minutesUntilNext).toBe(240);
			}
			// The next item is exposed as a normal list entry; the view decides weight.
			expect(state.forwardItems[0].id).toBe('dinner');
		});

		it('next item is the earliest future item and the forward list is sorted', () => {
			const items = [
				makeItem({ id: 'later', start_time: '2026-10-15 18:00:00.000Z', end_time: '2026-10-15 19:00:00.000Z' }),
				makeItem({ id: 'soon', start_time: '2026-10-15 15:00:00.000Z', end_time: '2026-10-15 16:00:00.000Z' })
			];
			const state = getNowViewState(items, new Date('2026-10-15T14:00:00Z'), true);
			if (state.focus.kind === 'free-time') {
				expect(state.focus.nextItem.id).toBe('soon');
				expect(state.focus.minutesUntilNext).toBe(60);
			}
			expect(state.forwardItems.map((i) => i.id)).toEqual(['soon', 'later']);
		});
	});

	describe('forward list hides the past', () => {
		it('excludes items that have already ended', () => {
			const items = [
				makeItem({ id: 'done', start_time: '2026-10-15 09:00:00.000Z', end_time: '2026-10-15 10:00:00.000Z' }),
				makeItem({ id: 'ahead', start_time: '2026-10-15 16:00:00.000Z', end_time: '2026-10-15 17:00:00.000Z' })
			];
			const state = getNowViewState(items, new Date('2026-10-15T12:00:00Z'), true);
			expect(state.forwardItems.map((i) => i.id)).toEqual(['ahead']);
		});
	});

	describe('nothing ahead — before 8pm cutoff', () => {
		it('reads "nothing else planned" (not wrapped) when the day is open but empty ahead', () => {
			const items = [
				makeItem({ id: 'past', start_time: '2026-10-15 09:00:00.000Z', end_time: '2026-10-15 10:00:00.000Z', status: 'done' })
			];
			const state = getNowViewState(items, new Date('2026-10-15T14:00:00Z'), true);
			expect(state.focus.kind).toBe('nothing-else-planned');
			expect(state.forwardItems).toEqual([]);
		});

		it('an empty day before 8pm is "nothing else planned", not wrapped', () => {
			const state = getNowViewState([], new Date('2026-10-15T14:00:00Z'), true);
			expect(state.focus.kind).toBe('nothing-else-planned');
		});

		it('an untimed-only day before 8pm is "nothing else planned" (no timed item to focus)', () => {
			const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
			const state = getNowViewState(items, new Date('2026-10-15T14:00:00Z'), true);
			expect(state.focus.kind).toBe('nothing-else-planned');
		});
	});

	describe('nothing ahead — at/after 8pm cutoff', () => {
		it('reads as a wrapped plan summary once empty ahead and at/after 8pm', () => {
			const items = [
				makeItem({ id: 'a', start_time: '2026-10-15 09:00:00.000Z', end_time: '2026-10-15 10:00:00.000Z', status: 'done' }),
				makeItem({ id: 'b', start_time: '2026-10-15 12:00:00.000Z', end_time: '2026-10-15 13:00:00.000Z', status: 'done' })
			];
			const state = getNowViewState(items, new Date('2026-10-15T20:00:00Z'), true);
			expect(state.focus.kind).toBe('wrapped-summary');
			if (state.focus.kind === 'wrapped-summary') {
				expect(state.focus.totalCount).toBe(2);
			}
		});

		// #199 — the summary counts what was PLANNED for today, never a done-count
		// (done is Closeout's verdict, unreachable from Trip Mode). Status is ignored.
		it('counts every planned item regardless of status — no done-count', () => {
			const items = [
				makeItem({ id: 'a', status: 'done' }),
				makeItem({ id: 'b', status: 'planned' }),
				makeItem({ id: 'c', status: 'done' })
			];
			const state = getNowViewState(items, new Date('2026-10-15T22:30:00Z'), true);
			expect(state.focus.kind).toBe('wrapped-summary');
			if (state.focus.kind === 'wrapped-summary') {
				expect(state.focus.totalCount).toBe(3);
				// completedCount no longer exists on the focus — done is not surfaced.
				expect('completedCount' in state.focus).toBe(false);
			}
		});

		it('an empty day at/after 8pm wraps with a zero plan count', () => {
			const state = getNowViewState([], new Date('2026-10-15T20:30:00Z'), true);
			expect(state.focus.kind).toBe('wrapped-summary');
			if (state.focus.kind === 'wrapped-summary') {
				expect(state.focus.totalCount).toBe(0);
			}
		});
	});

	describe('late-item-still-focused — the bug being fixed (was now-state.ts:59 isPast10pm)', () => {
		it('a 9pm dinner keeps Now focused on it at 8:30pm (does NOT wrap)', () => {
			// 8:30pm trip-local, dinner at 9pm. The old 10pm cutoff is gone and 8pm
			// must NOT hide a still-upcoming late item.
			const items = [
				makeItem({
					id: 'dinner',
					start_time: '2026-10-15 21:00:00.000Z',
					end_time: '2026-10-15 22:30:00.000Z',
					title: 'Late Dinner'
				})
			];
			const state = getNowViewState(items, new Date('2026-10-15T20:30:00Z'), true);
			expect(state.focus.kind).toBe('free-time');
			if (state.focus.kind === 'free-time') {
				expect(state.focus.nextItem.id).toBe('dinner');
				expect(state.focus.minutesUntilNext).toBe(30);
			}
		});

		it('an ongoing item past 8pm stays mid-event, never wrapped', () => {
			const items = [
				makeItem({ id: 'show', start_time: '2026-10-15 20:00:00.000Z', end_time: '2026-10-15 23:00:00.000Z' })
			];
			const state = getNowViewState(items, new Date('2026-10-15T21:00:00Z'), true);
			expect(state.focus.kind).toBe('mid-event');
		});
	});

	describe('multi-day items excluded from the Focus pick (#82 / #83)', () => {
		// Avis rental: multi-day (Jun 8 08:00 → Jun 12), running in the background.
		const now = new Date('2026-06-08T13:34:00.000Z');
		const avis = () =>
			makeItem({
				id: 'avis',
				title: 'Avis Rental Car Pickup',
				start_time: '2026-06-08 08:00:00.000Z',
				end_time: '2026-06-12 08:00:00.000Z',
				end_date: '2026-06-12'
			});
		const workMeetings = () =>
			makeItem({
				id: 'work',
				title: 'Work Meetings',
				start_time: '2026-06-08 10:00:00.000Z',
				end_time: '2026-06-08 17:00:00.000Z'
			});

		it('#82: the same-day event is the Focus, never the spanning rental', () => {
			const state = getNowViewState([avis(), workMeetings()], now, true);
			expect(state.focus.kind).toBe('mid-event');
			if (state.focus.kind === 'mid-event') {
				expect(state.focus.currentItem.id).toBe('work');
			}
		});

		it('#83: minutesRemaining counts to the same-day event end, not the Jun 12 rental return', () => {
			const state = getNowViewState([avis(), workMeetings()], now, true);
			if (state.focus.kind === 'mid-event') {
				expect(state.focus.minutesRemaining).toBe(206); // 13:34 → 17:00
			}
		});

		it('a multi-day item alone does not make the day mid-event; it yields free-time on the next same-day item', () => {
			const later = makeItem({
				id: 'dinner',
				start_time: '2026-06-08 18:30:00.000Z',
				end_time: '2026-06-08 20:00:00.000Z'
			});
			const state = getNowViewState([avis(), later], now, true);
			expect(state.focus.kind).toBe('free-time');
			if (state.focus.kind === 'free-time') {
				expect(state.focus.nextItem.id).toBe('dinner');
			}
		});

		it('a future-starting multi-day item is never the free-time nextItem nor a forward-list entry', () => {
			// A hotel check-in later today that spans into following days must not
			// become the countdown target nor a discrete forward row.
			const hotel = makeItem({
				id: 'hotel',
				title: 'Hotel Check-in',
				start_time: '2026-06-08 15:00:00.000Z',
				end_time: '2026-06-11 11:00:00.000Z',
				end_date: '2026-06-11'
			});
			const dinner = makeItem({
				id: 'dinner',
				start_time: '2026-06-08 19:00:00.000Z',
				end_time: '2026-06-08 20:30:00.000Z'
			});
			const state = getNowViewState([hotel, dinner], now, true);
			expect(state.focus.kind).toBe('free-time');
			if (state.focus.kind === 'free-time') {
				expect(state.focus.nextItem.id).toBe('dinner');
			}
			expect(state.forwardItems.map((i) => i.id)).toEqual(['dinner']);
		});

		it('multi-day items are excluded from the wrapped plan count', () => {
			// After 8pm, nothing same-day ahead; the spanning rental should not pad counts.
			const lateNow = new Date('2026-06-08T20:30:00.000Z');
			const state = getNowViewState([avis(), workMeetings()], lateNow, true);
			expect(state.focus.kind).toBe('wrapped-summary');
			if (state.focus.kind === 'wrapped-summary') {
				expect(state.focus.totalCount).toBe(1); // only work, not avis
			}
		});
	});

	describe('real stored datetimes via tripNow (regression for 1970 parse bug)', () => {
		it('reaches mid-event when an item spans the current trip-local moment', () => {
			const now = tripNow('Europe/Madrid', new Date('2026-06-08T16:00:00.000Z')); // 18:00 Madrid
			const items = [
				makeItem({ start_time: '2026-06-08 17:30:00.000Z', end_time: '2026-06-08 19:00:00.000Z' })
			];
			expect(getNowViewState(items, now, true).focus.kind).toBe('mid-event');
		});

		it('reaches free-time when the next item is later today', () => {
			const now = tripNow('Europe/Madrid', new Date('2026-06-08T16:00:00.000Z'));
			const items = [
				makeItem({ start_time: '2026-06-08 20:00:00.000Z', end_time: '2026-06-08 21:00:00.000Z' })
			];
			expect(getNowViewState(items, now, true).focus.kind).toBe('free-time');
		});
	});
});

describe('getNowFeed — merged Now: faded past / Focus / normal rest (#244)', () => {
	const NOW = new Date('2026-10-15T13:00:00Z');

	it('no-day yields the no-day focus and empty past + rest', () => {
		const feed = getNowFeed([], NOW, false);
		expect(feed.focus.kind).toBe('no-day');
		expect(feed.pastItems).toEqual([]);
		expect(feed.restItems).toEqual([]);
	});

	it('splits a day into past (ended) / Focus (ongoing) / rest (forward), earliest-first', () => {
		const items = [
			makeItem({ id: 'breakfast', start_time: '2026-10-15 08:00:00.000Z', end_time: '2026-10-15 09:00:00.000Z' }),
			makeItem({ id: 'museum', start_time: '2026-10-15 12:00:00.000Z', end_time: '2026-10-15 14:00:00.000Z' }),
			makeItem({ id: 'dinner', start_time: '2026-10-15 19:00:00.000Z', end_time: '2026-10-15 21:00:00.000Z' })
		];
		const feed = getNowFeed(items, NOW, true);
		// 13:00: breakfast ended (past), museum ongoing (Focus), dinner ahead (rest).
		expect(feed.pastItems.map((i) => i.id)).toEqual(['breakfast']);
		expect(feed.focus.kind).toBe('mid-event');
		if (feed.focus.kind === 'mid-event') expect(feed.focus.currentItem.id).toBe('museum');
		expect(feed.restItems.map((i) => i.id)).toEqual(['dinner']);
	});

	it('#429: the Earlier today / Coming up split follows the TRIP clock, not the server clock', () => {
		// 2026-10-15 21:30 UTC is 17:30 in New York (EDT) and 06:30 next day in Tokyo.
		const instant = new Date('2026-10-15T21:30:00Z');
		const items = [
			makeItem({ id: 'lunch', start_time: '2026-10-15 12:00:00.000Z', end_time: '2026-10-15 13:30:00.000Z' }),
			makeItem({ id: 'dinner', start_time: '2026-10-15 19:00:00.000Z', end_time: '2026-10-15 21:00:00.000Z' })
		];
		const ny = getNowFeed(items, tripNow('America/New_York', instant), true);
		expect(ny.pastItems.map((i) => i.id)).toEqual(['lunch']);
		expect(ny.restItems.map((i) => i.id)).toEqual(['dinner']);
		const tokyo = getNowFeed(items, tripNow('Asia/Tokyo', instant), true);
		expect(tokyo.pastItems.map((i) => i.id)).toEqual(['lunch', 'dinner']);
		expect(tokyo.restItems).toEqual([]);
	});

	it('#429: an item that ends exactly now is Earlier today, never in both lists', () => {
		const items = [makeItem({ id: 'brunch', start_time: '2026-10-15 12:00:00.000Z', end_time: '2026-10-15 13:00:00.000Z' })];
		const feed = getNowFeed(items, NOW, true);
		expect(feed.pastItems.map((i) => i.id)).toEqual(['brunch']);
		expect(feed.restItems).toEqual([]);
	});

	it('the ongoing Focus item never double-renders in the rest (mid-event)', () => {
		const items = [
			makeItem({ id: 'museum', start_time: '2026-10-15 12:00:00.000Z', end_time: '2026-10-15 14:00:00.000Z' }),
			makeItem({ id: 'dinner', start_time: '2026-10-15 19:00:00.000Z', end_time: '2026-10-15 21:00:00.000Z' })
		];
		const feed = getNowFeed(items, NOW, true);
		expect(feed.restItems.map((i) => i.id)).toEqual(['dinner']);
		expect(feed.restItems.some((i) => i.id === 'museum')).toBe(false);
	});

	it('UNTIMED items render in the rest — the whole point of the merge (old Now dropped them)', () => {
		const items = [
			makeItem({ id: 'idea', start_time: '', sort_order: 100, title: 'Promoted idea' }),
			makeItem({ id: 'dinner', start_time: '2026-10-15 19:00:00.000Z', end_time: '2026-10-15 21:00:00.000Z' })
		];
		const feed = getNowFeed(items, NOW, true);
		expect(feed.restItems.map((i) => i.id).sort()).toEqual(['dinner', 'idea']);
	});

	it('weaves untimed among forward timed by sort_order (an untimed before an anchor leads it)', () => {
		// dinner anchored sort_order 300; idea untimed sort_order 100 → idea precedes it.
		const items = [
			makeItem({ id: 'dinner', start_time: '2026-10-15 19:00:00.000Z', end_time: '2026-10-15 21:00:00.000Z', sort_order: 300 }),
			makeItem({ id: 'idea', start_time: '', sort_order: 100 })
		];
		const feed = getNowFeed(items, NOW, true);
		expect(feed.restItems.map((i) => i.id)).toEqual(['idea', 'dinner']);
	});

	it('an untimed-only day before the cutoff: nothing-else Focus, untimed in the rest, no past', () => {
		const items = [makeItem({ id: 'a', start_time: '', sort_order: 100 }), makeItem({ id: 'b', start_time: '', sort_order: 200 })];
		const feed = getNowFeed(items, NOW, true);
		expect(feed.focus.kind).toBe('nothing-else-planned');
		expect(feed.pastItems).toEqual([]);
		expect(feed.restItems.map((i) => i.id)).toEqual(['a', 'b']);
	});

	it('in free-time the next item stays as a rest row (Focus is a countdown card, not an item)', () => {
		const items = [
			makeItem({ id: 'past', start_time: '2026-10-15 09:00:00.000Z', end_time: '2026-10-15 10:00:00.000Z' }),
			makeItem({ id: 'dinner', start_time: '2026-10-15 19:00:00.000Z', end_time: '2026-10-15 21:00:00.000Z' })
		];
		const feed = getNowFeed(items, NOW, true);
		expect(feed.focus.kind).toBe('free-time');
		expect(feed.pastItems.map((i) => i.id)).toEqual(['past']);
		expect(feed.restItems.map((i) => i.id)).toEqual(['dinner']);
	});

	it('multi-day spanning items never appear in past or rest (they are banners)', () => {
		const items = [
			makeItem({ id: 'hotel', start_time: '2026-10-15 06:00:00.000Z', end_time: '2026-10-18 11:00:00.000Z', end_date: '2026-10-18' }),
			makeItem({ id: 'dinner', start_time: '2026-10-15 19:00:00.000Z', end_time: '2026-10-15 21:00:00.000Z' })
		];
		const feed = getNowFeed(items, NOW, true);
		expect(feed.pastItems.some((i) => i.id === 'hotel')).toBe(false);
		expect(feed.restItems.some((i) => i.id === 'hotel')).toBe(false);
		expect(feed.restItems.map((i) => i.id)).toEqual(['dinner']);
	});
});

describe('getNowFeed — several Heroes (#430)', () => {
	const NOW = new Date('2026-10-15T13:00:00Z');
	const ongoing = (id: string, start: string, extra: Partial<Item> = {}) =>
		makeItem({ id, start_time: `2026-10-15 ${start}:00.000Z`, end_time: '2026-10-15 15:00:00.000Z', ...extra });

	it('three ongoing items: all are Heroes, mine first, none repeated in the rest', () => {
		const items = [
			ongoing('theirs', '11:00', { assigned_to: ['m2'] }),
			ongoing('mine', '12:00', { assigned_to: ['me'] }),
			ongoing('also-theirs', '12:30'),
			makeItem({ id: 'dinner', start_time: '2026-10-15 19:00:00.000Z', end_time: '2026-10-15 21:00:00.000Z' })
		];
		const feed = getNowFeed(items, NOW, true, 'me');
		if (feed.focus.kind !== 'mid-event') throw new Error('expected mid-event');
		expect(feed.focus.heroes.map((i) => i.id)).toEqual(['mine', 'theirs', 'also-theirs']);
		expect(feed.restItems.map((i) => i.id)).toEqual(['dinner']);
		expect(feed.pastItems).toEqual([]);
	});

	it('a Multi-day Item is never a Hero, even alongside timed ongoing items', () => {
		const items = [
			ongoing('lunch', '12:00'),
			makeItem({ id: 'hotel', start_time: '2026-10-14 15:00:00.000Z', end_time: '2026-10-18 11:00:00.000Z', end_date: '2026-10-18', assigned_to: ['me'] })
		];
		const feed = getNowFeed(items, NOW, true, 'me');
		if (feed.focus.kind !== 'mid-event') throw new Error('expected mid-event');
		expect(feed.focus.heroes.map((i) => i.id)).toEqual(['lunch']);
		expect(feed.restItems.some((i) => i.id === 'hotel')).toBe(false);
	});

	it('a Multi-day Item alone is not mid-event', () => {
		const items = [
			makeItem({ id: 'hotel', start_time: '2026-10-14 15:00:00.000Z', end_time: '2026-10-18 11:00:00.000Z', end_date: '2026-10-18', assigned_to: ['me'] })
		];
		expect(getNowFeed(items, NOW, true, 'me').focus.kind).not.toBe('mid-event');
	});

	it('the free-time card shows only when nothing is ongoing for anyone', () => {
		const later = makeItem({ id: 'dinner', start_time: '2026-10-15 19:00:00.000Z', end_time: '2026-10-15 21:00:00.000Z' });
		expect(getNowFeed([later], NOW, true, 'me').focus.kind).toBe('free-time');
		// someone else's item is ongoing -> their Hero shows, not free time
		const theirs = ongoing('theirs', '12:00', { assigned_to: ['m2'] });
		expect(getNowFeed([later, theirs], NOW, true, 'me').focus.kind).toBe('mid-event');
	});

	it('an ended item is not a Hero; a start-equal item is', () => {
		const items = [
			makeItem({ id: 'ended', start_time: '2026-10-15 11:00:00.000Z', end_time: '2026-10-15 13:00:00.000Z' }),
			ongoing('starting', '13:00')
		];
		const feed = getNowFeed(items, NOW, true);
		if (feed.focus.kind !== 'mid-event') throw new Error('expected mid-event');
		expect(feed.focus.heroes.map((i) => i.id)).toEqual(['starting']);
		expect(feed.pastItems.map((i) => i.id)).toEqual(['ended']);
	});
});
