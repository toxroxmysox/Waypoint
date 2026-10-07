import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Item, TripMember } from '$lib/types';
import { canSelfAssign, goingPatch, goingStateOf, parseGoingState } from '$lib/itinerary/assignment';
import type { GoingState } from '$lib/itinerary/assignment';

// Set the CALLER's own answer to "Are you going?" on an item (#226, ADR-0011;
// three states since #402): body `{ state: 'going' | 'not_going' | 'no_answer' }`.
//
// The write touches ONLY the caller's own trip_members.id, via PocketBase's
// relation modifiers (`assigned_to+` / `not_going-` …) computed server-side —
// the client never supplies an array, so it can't answer for anyone else. The
// modifiers are NOT a concurrency guarantee: PB applies them to the record as
// loaded, so two answers landing within a few ms can lose one (accepted: rare,
// and assigning "going" already had the same race). The items.pb.js hooks
// independently enforce the self-only delta and keep going / not going
// exclusive (this endpoint is convenience, not the boundary).
//
// Re-sending the state you already have (a double tap) returns it with no
// write: PB refuses a traveler's update that changes nothing.
//
// No `state` (an empty body) keeps the legacy "+ Me" toggle — going ↔ no answer —
// for AssigneeStacks until #440's "Are you going?" retires it.
export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) error(401, 'Unauthorized');

	let body: unknown = null;
	try {
		body = await request.json();
	} catch {
		body = null; // empty / non-JSON body → legacy toggle
	}
	if (body !== null && (typeof body !== 'object' || Array.isArray(body))) {
		error(400, 'Body must be a JSON object');
	}
	const rawState =
		body && typeof body === 'object' && 'state' in body ? (body as { state: unknown }).state : undefined;
	const requested = rawState === undefined ? null : parseGoingState(rawState);
	if (rawState !== undefined && !requested) {
		error(400, 'state must be going, not_going or no_answer');
	}

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
		error(403, "Viewers can't answer whether they're going.");
	}

	const state: GoingState =
		requested ?? (goingStateOf(item, membership.id) === 'going' ? 'no_answer' : 'going');

	let updated: Item = item;
	if (goingStateOf(item, membership.id) !== state) {
		try {
			updated = await locals.pb
				.collection('items')
				.update<Item>(params.itemId, goingPatch(state, membership.id));
		} catch (err) {
			const status = (err as { status?: number } | null)?.status;
			const message = err instanceof Error ? err.message : 'Failed to save your answer.';
			error(typeof status === 'number' && status >= 400 && status < 600 ? status : 500, message);
		}
	}

	return json({
		ok: true,
		state: goingStateOf(updated, membership.id),
		assigned_to: updated.assigned_to ?? [],
		not_going: updated.not_going ?? [],
		member_id: membership.id
	});
};
