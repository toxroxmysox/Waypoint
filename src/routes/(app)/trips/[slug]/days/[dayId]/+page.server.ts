import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Day, Item, Vote, TripMember } from '$lib/types';
import { phasesForDay } from '$lib/itinerary/phases';
import { rebalanceDayOrder, GAP } from '$lib/itinerary/sort-order';
import { spanningItemsForDate } from '$lib/itinerary/multi-day';
import { withAvatarUrls } from '$lib/collaboration/member-avatar';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { trip, phases, days } = await parent();

	let day: Day;
	try {
		day = await locals.pb.collection('days').getOne<Day>(params.dayId);
	} catch {
		error(404, 'Day not found');
	}

	if (day.trip !== trip.id) {
		error(404, 'Day not found');
	}

	const items = await locals.pb.collection('items').getFullList<Item>({
		filter: `day = "${day.id}" && end_date = ""`,
		sort: 'sort_order'
	});

	// Multi-day items that span this calendar date (rendered as banners, not timeline).
	const dayDate = day.date.split(/[T ]/)[0];
	const allMultiDay = await locals.pb.collection('items').getFullList<Item>({
		filter: `trip = "${trip.id}" && end_date != ""`,
		sort: 'day'
	});
	const spanningItems = spanningItemsForDate(allMultiDay, days as Day[], dayDate);

	const itemIds = items.map((i) => i.id);
	const [votes, members] = await Promise.all([
		itemIds.length > 0
			? locals.pb.collection('votes').getFullList<Vote>({
					filter: itemIds.map((id) => `item = "${id}"`).join(' || ')
				})
			: Promise.resolve([] as Vote[]),
		locals.pb.collection('trip_members').getFullList<TripMember>({
			filter: `trip = "${trip.id}" && removed_at = ""`,
			expand: 'user'
		})
	]);

	const votesByItem: Record<string, Vote[]> = {};
	for (const v of votes) (votesByItem[v.item] ??= []).push(v);

	const dayPhases = phasesForDay(day, phases);

	const phaseIds = dayPhases.map((p) => p.id);
	const parkingLotItems =
		phaseIds.length > 0
			? await locals.pb.collection('items').getFullList<Item>({
					filter: `trip = "${trip.id}" && status = "unplanned" && (${phaseIds.map((id) => `phase = "${id}"`).join(' || ')})`,
					sort: 'sort_order'
				})
			: [];

	return { day, dayItems: items, dayPhases, votesByItem, members: withAvatarUrls(locals.pb, members), parkingLotItems, spanningItems, allDays: days };
};

export const actions: Actions = {
	updateNotes: async ({ request, params, locals }) => {
		const data = await request.formData();
		const notes = data.get('notes')?.toString() || '';

		try {
			await locals.pb.collection('days').update(params.dayId, { notes });
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to update notes.';
			return fail(500, { error: message });
		}
	},

	reorder: async ({ request, params, locals }) => {
		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		const orderRaw = data.get('order')?.toString();

		if (!itemId) return fail(400, { error: 'Missing item ID.' });

		// #237: an untimed item must be able to land anywhere — between or below
		// timed items — and stick. A single midpoint sort_order can't encode that
		// (orderDayItems re-weaves untimed items against timed anchors whose
		// sort_order is unrelated to the clock). The client sends the full resulting
		// display order; rebalance the WHOLE day to match it so the drop round-trips.
		// Scope matches the timeline the user sees (load uses `end_date = ""`) so
		// multi-day banner items aren't renumbered — they never appear in `order`.
		const day = await locals.pb.collection('items').getFullList<Item>({
			filter: `day = "${params.dayId}" && end_date = ""`,
			fields: 'id'
		});
		const dayIds = new Set(day.map((i) => i.id));

		const requested = (orderRaw ?? '').split(',').filter(Boolean);
		// Only trust ids that actually live on this day (drop stray/foreign ids), and
		// append any day items the client omitted so none lose their sort_order.
		const seen = new Set<string>();
		const orderedIds: string[] = [];
		for (const id of requested) {
			if (dayIds.has(id) && !seen.has(id)) {
				orderedIds.push(id);
				seen.add(id);
			}
		}
		for (const i of day) if (!seen.has(i.id)) orderedIds.push(i.id);

		const updates = rebalanceDayOrder(orderedIds.map((id) => ({ id })));
		try {
			await Promise.all(
				updates.map((u) => locals.pb.collection('items').update(u.id, { sort_order: u.sort_order }))
			);
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to reorder.';
			return fail(500, { error: message });
		}
	},

	pullToPlan: async ({ request, params, locals }) => {
		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		if (!itemId) return fail(400, { error: 'Missing item ID.' });

		// An idea pulled in via tap-to-plan has no drop position → append to the tail.
		// A drag carries the full resulting display order; rebalance the whole day so
		// the pulled item sticks where it landed — including between/below timed items
		// (#237), the same whole-day rebalance the timeline reorder uses.
		const orderRaw = data.get('order')?.toString();

		try {
			if (!orderRaw) {
				// Append to the end of the day (tap-to-plan, no drop position).
				const tail = await locals.pb.collection('items').getFullList({
					filter: `day = "${params.dayId}"`,
					sort: '-sort_order',
					fields: 'sort_order'
				});
				await locals.pb.collection('items').update(itemId, {
					day: params.dayId,
					status: 'planned',
					sort_order: tail.length > 0 ? Number(tail[0].sort_order) + GAP : GAP
				});
				return { success: true };
			}

			// Attach the pulled item to the day FIRST so it's part of the day set the
			// whole-day rebalance renumbers.
			await locals.pb.collection('items').update(itemId, { day: params.dayId, status: 'planned' });

			// Scope matches the visible timeline (load uses `end_date = ""`).
			const day = await locals.pb.collection('items').getFullList<Item>({
				filter: `day = "${params.dayId}" && end_date = ""`,
				fields: 'id'
			});
			const dayIds = new Set(day.map((i) => i.id));

			const requested = orderRaw.split(',').filter(Boolean);
			const seen = new Set<string>();
			const orderedIds: string[] = [];
			for (const id of requested) {
				if (dayIds.has(id) && !seen.has(id)) {
					orderedIds.push(id);
					seen.add(id);
				}
			}
			for (const i of day) if (!seen.has(i.id)) orderedIds.push(i.id);

			const updates = rebalanceDayOrder(orderedIds.map((id) => ({ id })));
			await Promise.all(
				updates.map((u) => locals.pb.collection('items').update(u.id, { sort_order: u.sort_order }))
			);
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to add item to day.';
			return fail(500, { error: message });
		}
	},

	pushToParking: async ({ request, locals }) => {
		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		if (!itemId) return fail(400, { error: 'Missing item ID.' });

		try {
			// Eject → unschedule (#60): drop the day, mark unplanned, and STRIP the
			// time so "unscheduled" means unscheduled (no silent re-anchor later).
			await locals.pb.collection('items').update(itemId, {
				day: '',
				status: 'unplanned',
				sort_order: 0,
				start_time: '',
				end_time: ''
			});
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to remove item from day.';
			return fail(500, { error: message });
		}
	}
};
