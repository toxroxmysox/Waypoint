import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Day, Item, Vote, TripMember } from '$lib/types';
import { phasesForDay } from '$lib/itinerary/phases';
import { rebalance, insertBetween, GAP } from '$lib/itinerary/sort-order';
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
		const beforeOrder = data.get('before_order')?.toString();
		const afterOrder = data.get('after_order')?.toString();

		if (!itemId) return fail(400, { error: 'Missing item ID.' });

		const before = beforeOrder && !isNaN(Number(beforeOrder)) ? Number(beforeOrder) : null;
		const after = afterOrder && !isNaN(Number(afterOrder)) ? Number(afterOrder) : null;

		let newOrder = insertBetween(before, after);

		if (newOrder === null) {
			// Gap too small — rebalance all items on this day
			const dayItems = await locals.pb.collection('items').getFullList<Item>({
				filter: `day = "${params.dayId}"`,
				sort: 'sort_order',
				fields: 'id,sort_order'
			});

			const orderedIds = dayItems.filter((i) => i.id !== itemId).map((i) => i.id);
			let insertIdx = orderedIds.length;
			if (after !== null) {
				const afterIdx = orderedIds.findIndex(
					(id) => dayItems.find((i) => i.id === id)?.sort_order === after
				);
				if (afterIdx >= 0) insertIdx = afterIdx;
			} else if (before !== null) {
				const beforeIdx = orderedIds.findIndex(
					(id) => dayItems.find((i) => i.id === id)?.sort_order === before
				);
				if (beforeIdx >= 0) insertIdx = beforeIdx + 1;
			}
			orderedIds.splice(insertIdx, 0, itemId);

			const updates = rebalance(orderedIds);
			try {
				await Promise.all(
					updates.map((u) => locals.pb.collection('items').update(u.id, { sort_order: u.sort_order }))
				);
				return { success: true };
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : 'Failed to reorder.';
				return fail(500, { error: message });
			}
		}

		try {
			await locals.pb.collection('items').update(itemId, { sort_order: newOrder });
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

		// Position-aware pull (#60): drop neighbors come from the dnd flat list.
		// No neighbors → append to the day's tail (legacy behavior).
		const beforeRaw = data.get('before_order')?.toString();
		const afterRaw = data.get('after_order')?.toString();
		const before = beforeRaw && !isNaN(Number(beforeRaw)) ? Number(beforeRaw) : null;
		const after = afterRaw && !isNaN(Number(afterRaw)) ? Number(afterRaw) : null;

		const newOrder = before === null && after === null ? null : insertBetween(before, after);

		try {
			if (before === null && after === null) {
				// Append to the end of the day.
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
			} else if (newOrder === null) {
				// Gap collapsed — rebalance the day with the pulled item spliced in.
				const dayItems = await locals.pb.collection('items').getFullList<Item>({
					filter: `day = "${params.dayId}"`,
					sort: 'sort_order',
					fields: 'id,sort_order'
				});
				const orderedIds = dayItems.map((i) => i.id);
				let insertIdx = orderedIds.length;
				if (after !== null) {
					const afterIdx = dayItems.findIndex((i) => i.sort_order === after);
					if (afterIdx >= 0) insertIdx = afterIdx;
				} else if (before !== null) {
					const beforeIdx = dayItems.findIndex((i) => i.sort_order === before);
					if (beforeIdx >= 0) insertIdx = beforeIdx + 1;
				}
				orderedIds.splice(insertIdx, 0, itemId);
				const updates = rebalance(orderedIds);
				await Promise.all(
					updates.map((u) =>
						locals.pb.collection('items').update(u.id, { sort_order: u.sort_order })
					)
				);
				await locals.pb.collection('items').update(itemId, { day: params.dayId, status: 'planned' });
			} else {
				await locals.pb.collection('items').update(itemId, {
					day: params.dayId,
					status: 'planned',
					sort_order: newOrder
				});
			}
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
