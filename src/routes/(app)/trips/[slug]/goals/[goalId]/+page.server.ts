import { error, fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Item, ItemStatus, TripGoal, TripMember } from '$lib/types';
import { deriveGoalStatus } from '$lib/itinerary/goal-status';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { trip, membership } = await parent();

	let goal: TripGoal;
	try {
		goal = await locals.pb
			.collection('trip_goals')
			.getOne<TripGoal>(params.goalId, { expand: 'created_by.user' });
	} catch {
		error(404, 'Goal not found');
	}
	if (goal.trip !== trip.id) error(404, 'Goal not found');

	// Linked items — the traceability list. Loaded by id so we keep the goal's
	// own ordering and can show each item's own status.
	const linkedIds = goal.items ?? [];
	let linkedItems: Item[] = [];
	if (linkedIds.length > 0) {
		const idFilter = linkedIds.map((id) => `id = "${id}"`).join(' || ');
		linkedItems = await locals.pb.collection('items').getFullList<Item>({
			filter: `trip = "${trip.id}" && (${idFilter})`,
			sort: 'sort_order'
		});
	}

	// Candidates for the "Link an item" picker — every trip item not already
	// linked to this goal.
	const allItems = await locals.pb.collection('items').getFullList<Item>({
		filter: `trip = "${trip.id}"`,
		sort: 'sort_order',
		fields: 'id,title,type,status,phase,day'
	});
	const linkedSet = new Set(linkedIds);
	const linkCandidates = allItems.filter((i) => !linkedSet.has(i.id));

	const derivedStatus = deriveGoalStatus(
		linkedItems.map((i) => i.status as ItemStatus),
		goal.manual_status
	);

	// Delete rule (matches trip_goals.pb.js, #77): (creator AND zero goal_votes) OR owner/co_owner.
	const isOwner = membership.role === 'owner' || membership.role === 'co_owner';
	let canDelete = isOwner;
	if (!canDelete && goal.created_by === membership.id) {
		// Creator may delete only while the goal has no votes.
		const votes = await locals.pb
			.collection('goal_votes')
			.getList(1, 1, { filter: `goal = "${goal.id}"` });
		canDelete = votes.totalItems === 0;
	}

	return {
		goal,
		linkedItems,
		linkCandidates,
		derivedStatus,
		isDerived: linkedItems.length > 0,
		canDelete,
		canEdit: membership.role !== 'viewer'
	};
};

export const actions: Actions = {
	// Link an item to the goal (goal-side write — the item record is untouched).
	link: async ({ request, params, locals }) => {
		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		if (!itemId) return fail(400, { error: 'No item selected.' });
		try {
			await locals.pb.collection('trip_goals').update(params.goalId, { 'items+': itemId });
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to link item.';
			return fail(500, { error: message });
		}
		return { success: true };
	},

	// Unlink an item from the goal.
	unlink: async ({ request, params, locals }) => {
		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		if (!itemId) return fail(400, { error: 'No item specified.' });
		try {
			await locals.pb.collection('trip_goals').update(params.goalId, { 'items-': itemId });
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to unlink item.';
			return fail(500, { error: message });
		}
		return { success: true };
	},

	// Manual status — only authoritative when the goal has zero links. Ignored
	// server-side if links exist (the derived status wins).
	setStatus: async ({ request, params, locals }) => {
		const data = await request.formData();
		const status = data.get('manual_status')?.toString() || '';
		const valid = ['unplanned', 'planned', 'done', 'considered'];
		if (!valid.includes(status)) return fail(400, { error: 'Invalid status.' });
		try {
			const goal = await locals.pb.collection('trip_goals').getOne<TripGoal>(params.goalId);
			if ((goal.items ?? []).length > 0) {
				return fail(400, { error: 'This goal tracks its linked plans automatically.' });
			}
			await locals.pb.collection('trip_goals').update(params.goalId, { manual_status: status });
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to set status.';
			return fail(500, { error: message });
		}
		return { success: true };
	},

	delete: async ({ params, locals }) => {
		try {
			// The item↔goal links live on this goal record, so deleting it drops
			// them automatically; the linked items themselves are untouched
			// (trip_goals.items has cascadeDelete: false).
			await locals.pb.collection('trip_goals').delete(params.goalId);
			redirect(303, `/trips/${params.slug}/goals`);
		} catch (err: unknown) {
			if (isRedirect(err)) throw err;
			const message = err instanceof Error ? err.message : 'Failed to delete goal.';
			return fail(500, { error: message });
		}
	}
};
