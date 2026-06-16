import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Item, TripMember } from '$lib/types';
import { canSelfAssign, toggleAssignee } from '$lib/itinerary/assignment';

// Self-assign "+ Me" / remove-me (#226, ADR-0011). Toggles ONLY the caller's own
// trip_members.id in the item's `assigned_to`. The toggled array is computed
// SERVER-SIDE from the stored record — the client never supplies it, so it can't
// add anyone else. The items.pb.js update hook independently enforces the
// self-only delta (this endpoint is convenience + optimism, not the boundary).
export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');

	let item: Item;
	try {
		item = await locals.pb.collection('items').getOne<Item>(params.itemId);
	} catch {
		error(404, 'Item not found');
	}

	// Resolve the caller's ACTIVE membership on this item's trip.
	let membership: TripMember;
	try {
		membership = await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(
				`trip = "${item.trip}" && user = "${locals.user.id}" && removed_at = ""`
			);
	} catch {
		error(403, 'You are not a member of this trip');
	}

	if (!canSelfAssign(membership.role)) {
		error(403, 'Viewers cannot assign themselves.');
	}

	// Compute the new array from STORED state + the caller's own id only.
	const assigned_to = toggleAssignee(item.assigned_to ?? [], membership.id);

	let updated: Item;
	try {
		updated = await locals.pb.collection('items').update<Item>(params.itemId, { assigned_to });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to update assignment.';
		error(500, message);
	}

	return json({ ok: true, assigned_to: updated.assigned_to, member_id: membership.id });
};
