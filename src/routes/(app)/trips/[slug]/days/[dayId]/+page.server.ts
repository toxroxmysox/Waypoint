import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Day, Item, Vote } from '$lib/types';
import { phasesForDay } from '$lib/itinerary/phases';
import { rebalance, insertBetween, GAP } from '$lib/itinerary/sort-order';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { trip, phases } = await parent();

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
		filter: `day = "${day.id}"`,
		sort: 'sort_order'
	});

	const itemIds = items.map((i) => i.id);
	const votes =
		itemIds.length > 0
			? await locals.pb.collection('votes').getFullList<Vote>({
					filter: itemIds.map((id) => `item = "${id}"`).join(' || ')
				})
			: [];

	const voteCounts: Record<string, number> = {};
	for (const v of votes) {
		voteCounts[v.item] = (voteCounts[v.item] ?? 0) + 1;
	}

	const dayPhases = phasesForDay(day, phases);

	const phaseIds = dayPhases.map((p) => p.id);
	const parkingLotItems =
		phaseIds.length > 0
			? await locals.pb.collection('items').getFullList<Item>({
					filter: `trip = "${trip.id}" && status = "unplanned" && (${phaseIds.map((id) => `phase = "${id}"`).join(' || ')})`,
					sort: 'sort_order'
				})
			: [];

	return { day, dayItems: items, dayPhases, voteCounts, parkingLotItems };
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

		const before = beforeOrder ? Number(beforeOrder) : null;
		const after = afterOrder ? Number(afterOrder) : null;

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

		const dayItems = await locals.pb.collection('items').getFullList({
			filter: `day = "${params.dayId}"`,
			sort: '-sort_order',
			fields: 'sort_order'
		});
		const newOrder = dayItems.length > 0 ? Number(dayItems[0].sort_order) + GAP : GAP;

		try {
			await locals.pb.collection('items').update(itemId, {
				day: params.dayId,
				status: 'planned',
				sort_order: newOrder
			});
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
			await locals.pb.collection('items').update(itemId, {
				day: '',
				status: 'unplanned',
				sort_order: 0
			});
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to remove item from day.';
			return fail(500, { error: message });
		}
	}
};
