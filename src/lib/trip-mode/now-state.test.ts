import { describe, it, expect } from 'vitest';
import { getNowViewState } from './now-state';
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

		it('picks the ongoing item with the latest end_time when several overlap', () => {
			const items = [
				makeItem({ id: 'a', start_time: '2026-10-15 12:00:00.000Z', end_time: '2026-10-15 14:00:00.000Z' }),
				makeItem({ id: 'b', start_time: '2026-10-15 13:00:00.000Z', end_time: '2026-10-15 15:00:00.000Z' })
			];
			const state = getNowViewState(items, new Date('2026-10-15T13:30:00Z'), true);
			if (state.focus.kind === 'mid-event') {
				expect(state.focus.currentItem.id).toBe('b');
			}
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
