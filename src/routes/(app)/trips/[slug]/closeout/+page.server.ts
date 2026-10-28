import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Item, TripMember } from '$lib/types';
import { getTripLifecycle } from '$lib/trip-mode/trip-lifecycle';
import { resolvePublishDay } from '$lib/portability/archive-visibility';
import { handleSaveMemory } from '$lib/memory/save-memory.server';
import type { Memory } from '$lib/memory/types';
import { withAvatarUrls } from '$lib/group-input/member-avatar';
import { outcomeUpdate, parseOutcome, parseRating } from '$lib/itinerary/closeout-outcome';

// Closeout wizard loader (#240/#195 — Slice 2).
//
// Two gates, both server-side:
//  1. Lifecycle gate: the wizard runs ONLY when the trip is `wrap-up` (past its end
//     date, not archived) or `closed` (archived — re-review). A planning/active trip
//     can't reach closeout, so an owner can never mark items "done" or archive a LIVE
//     trip during planning (kills the WP-A-007 / WP-B-018 premature-entry bug).
//  2. Role gate: relaxed from owner/co_owner to owner/co_owner/**traveler** (deliberate
//     SPEC §4 change). Viewers get the read-only record (the trip Overview's closed/
//     wrap-up view), never the wizard.
//
// Travelers walk the done/considered of PLANNED items only — they never review or even
// see the unplanned [[Parking Lot]] ideas (that curation is owner-only, Slice 5). The
// day-by-day walk is already day-scoped (unplanned ideas carry an empty `day` and never
// appear), so `canCurate` simply gates the owner-only ideas step the UI adds in Slice 5.
// Role for the caller on this trip, resolved server-side (never trust the client).
// Used by the resolve/rate actions: viewers and non-members are refused.
async function closeoutCaller(
	locals: App.Locals,
	slug: string
): Promise<{ trip: { id: string }; canEdit: boolean; archived: boolean } | null> {
	try {
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug }));
		const membership = await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(
				`trip = "${trip.id}" && user = "${locals.user!.id}" && removed_at = ""`
			);
		const r = membership.role;
		return {
			trip,
			canEdit: r === 'owner' || r === 'co_owner' || r === 'traveler',
			archived: !!trip.archived
		};
	} catch {
		return null;
	}
}

function isNotFound(err: unknown): boolean {
	return typeof err === 'object' && err !== null && (err as { status?: number }).status === 404;
}

// #576 — a PB refusal (400/403) surfaces as that failure with its message, never a 500.
function pbFailure(err: unknown, fallback: string) {
	const status =
		typeof err === 'object' && err !== null ? (err as { status?: number }).status : undefined;
	const message = err instanceof Error && err.message ? err.message : fallback;
	if (status === 400 || status === 403) return fail(status, { error: message });
	return fail(500, { error: message });
}

export const load: PageServerLoad = async ({ parent, locals, params }) => {
	const { trip, membership, days, phases } = await parent();

	// Viewers never reach the wizard — bounce them to the read-only record (Overview).
	if (membership.role === 'viewer') {
		redirect(303, `/trips/${params.slug}`);
	}
	if (
		membership.role !== 'owner' &&
		membership.role !== 'co_owner' &&
		membership.role !== 'traveler'
	) {
		redirect(303, `/trips/${params.slug}`);
	}

	// Lifecycle gate — closeout is reachable only after the trip is actually over
	// (wrap-up) or already closed (re-review). Mirror the home router's derivation.
	const lifecycle = getTripLifecycle(trip);
	if (lifecycle !== 'wrap-up' && lifecycle !== 'closed') {
		redirect(303, `/trips/${params.slug}`);
	}

	const items = await locals.pb.collection('items').getFullList<Item>({
		filter: `trip = "${trip.id}"`,
		sort: 'day,sort_order'
	});

	// owner/co_owner curate the public record (the optional ideas-review step is theirs,
	// Slice 5); travelers do the item walk only and never see the parking-lot ideas.
	const canCurate = membership.role === 'owner' || membership.role === 'co_owner';

	// #269 Trip Memory — day-by-day reminiscence: ALL travelers' memories surface
	// alongside the items being reviewed. Capture (add/edit your own, retroactive
	// per-day) is open during wrap-up; a CLOSED trip's closeout stays openable
	// with memories read-only (PRD §Surfaces). Viewers never reach this loader.
	const memories = await locals.pb.collection('memories').getFullList<Memory>({
		filter: `trip = "${trip.id}"`,
		sort: 'created'
	});
	const canCaptureMemories = lifecycle === 'wrap-up';

	// Roster (with avatars) for the memory cards' author names. Includes
	// tombstones deliberately: a departed member's memories stay attributed
	// ("Former member" renders when the author row is gone entirely).
	const members = await locals.pb.collection('trip_members').getFullList<TripMember>({
		filter: `trip = "${trip.id}"`,
		expand: 'user'
	});

	return {
		trip,
		membership,
		days,
		phases,
		items,
		canCurate,
		memories,
		canCaptureMemories,
		// #576 — 'rate' = a closed trip's rating walk (re-rate only); 'walk' = the
		// wrap-up resolve walk.
		mode: (lifecycle === 'closed' ? 'rate' : 'walk') as 'walk' | 'rate',
		members: withAvatarUrls(locals.pb, members)
	};
};

export const actions: Actions = {
	// #269 — retroactive per-day memory add/edit from the closeout walk. Shared
	// composer handler; PB rules (author-only) + memories.pb.js enforce.
	saveMemory: handleSaveMemory,

	// #576 — resolve one item: Recommend / Don't recommend (done + rating) or
	// Didn't do (considered, unrated). Replaces the old Done/Swap/Skip row buttons.
	resolve: async ({ request, locals, params }) => {
		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		const outcome = parseOutcome(data.get('outcome')?.toString());
		if (!itemId) return fail(400, { error: 'Missing item ID.' });
		if (!outcome) return fail(400, { error: 'Invalid outcome.' });

		const caller = await closeoutCaller(locals, params.slug);
		if (!caller?.canEdit) return fail(403, { error: "Viewers can't close out items." });
		// Rate mode (a closed trip) is ratings-only.
		if (caller.archived) return fail(400, { error: 'This trip is already closed.' });

		try {
			const item = await locals.pb.collection('items').getOne<Item>(itemId, { fields: 'id,trip' });
			if (item.trip !== caller.trip.id) return fail(400, { error: 'Item is not on this trip.' });
			await locals.pb.collection('items').update(itemId, outcomeUpdate(outcome));
			return { success: true };
		} catch (err: unknown) {
			if (isNotFound(err)) return fail(400, { error: 'Item not found.' });
			return pbFailure(err, 'Failed to update item.');
		}
	},

	// #576 — set/clear the rating on a done item ('' clears). Rating only; status
	// is untouched.
	rate: async ({ request, locals, params }) => {
		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		const rating = parseRating(data.get('rating')?.toString());
		if (!itemId) return fail(400, { error: 'Missing item ID.' });
		if (rating === null) return fail(400, { error: 'Invalid rating.' });

		const caller = await closeoutCaller(locals, params.slug);
		if (!caller?.canEdit) return fail(403, { error: "Viewers can't rate items." });

		try {
			const item = await locals.pb
				.collection('items')
				.getOne<Item>(itemId, { fields: 'id,trip,status' });
			if (item.trip !== caller.trip.id) return fail(400, { error: 'Item is not on this trip.' });
			if (item.status !== 'done') return fail(400, { error: 'Only done items can be rated.' });
			await locals.pb.collection('items').update(itemId, { rating });
			return { success: true };
		} catch (err: unknown) {
			if (isNotFound(err)) return fail(400, { error: 'Item not found.' });
			return pbFailure(err, 'Failed to rate item.');
		}
	},

	markDoneAll: async ({ request, locals, params }) => {
		const data = await request.formData();
		const itemIds = data.getAll('item_ids').map((id) => id.toString());
		if (itemIds.length === 0) return fail(400, { error: 'No items to mark.' });
		const caller = await closeoutCaller(locals, params.slug);
		if (!caller?.canEdit) return fail(403, { error: "Viewers can't close out items." });
		// Rate mode (a closed trip) is ratings-only.
		if (caller.archived) return fail(400, { error: 'This trip is already closed.' });

		try {
			await Promise.all(
				itemIds.map((id) => locals.pb.collection('items').update(id, { status: 'done' }))
			);
			return { bulkSuccess: true, count: itemIds.length };
		} catch (err: unknown) {
			return pbFailure(err, 'Failed to bulk update.');
		}
	},

	// Ideas-review (#243) — owner/co_owner only (server-enforced). Keep a parking-lot
	// idea for the public record → status:considered (it becomes a "what we considered"
	// recommendation). Dropping an idea needs NO write: unplanned items are already
	// excluded from the record, so "drop" is a client-side dismissal only.
	keepIdea: async ({ request, locals, params }) => {
		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		if (!itemId) return fail(400, { error: 'Missing item ID.' });
		try {
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
			const membership = await locals.pb
				.collection('trip_members')
				.getFirstListItem<TripMember>(
					`trip = "${trip.id}" && user = "${locals.user!.id}" && removed_at = ""`
				);
			if (membership.role !== 'owner' && membership.role !== 'co_owner') {
				return fail(403, { error: 'Only owners or co-owners can curate the record.' });
			}
			await locals.pb.collection('items').update(itemId, { status: 'considered' });
			return { ideaKept: true };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to keep idea.' });
		}
	},

	keepAllIdeas: async ({ request, locals, params }) => {
		const data = await request.formData();
		const itemIds = data.getAll('item_ids').map((id) => id.toString());
		if (itemIds.length === 0) return fail(400, { error: 'No ideas to keep.' });
		try {
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
			const membership = await locals.pb
				.collection('trip_members')
				.getFirstListItem<TripMember>(
					`trip = "${trip.id}" && user = "${locals.user!.id}" && removed_at = ""`
				);
			if (membership.role !== 'owner' && membership.role !== 'co_owner') {
				return fail(403, { error: 'Only owners or co-owners can curate the record.' });
			}
			await Promise.all(
				itemIds.map((id) => locals.pb.collection('items').update(id, { status: 'considered' }))
			);
			return { ideasKept: itemIds.length };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to keep ideas.' });
		}
	},

	trimEnd: async ({ request, locals, params }) => {
		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		const endDate = (data.get('end_date')?.toString() || '').split(/[T ]/)[0];
		if (!itemId) return fail(400, { error: 'Missing item ID.' });
		const caller = await closeoutCaller(locals, params.slug);
		if (!caller?.canEdit) return fail(403, { error: "Viewers can't close out items." });
		// Rate mode (a closed trip) is ratings-only.
		if (caller.archived) return fail(400, { error: 'This trip is already closed.' });
		try {
			// #411: trimmed to its start day = a one-day item, which has no span
			// (items.pb.js refuses an end_date on or before the start day).
			const item = await locals.pb
				.collection('items')
				.getOne(itemId, { expand: 'day', fields: 'expand.day.date' });
			const startDay = String(
				(item.expand?.day as { date?: string } | undefined)?.date || ''
			).slice(0, 10);
			const keep = endDate && !(startDay && endDate <= startDay);
			await locals.pb.collection('items').update(itemId, {
				end_date: keep ? `${endDate} 00:00:00.000Z` : ''
			});
			return { success: true };
		} catch (err: unknown) {
			return pbFailure(err, 'Failed to update end date.');
		}
	},

	addReplacement: async ({ request, locals, params }) => {
		const caller = await closeoutCaller(locals, params.slug);
		if (!caller?.canEdit) return fail(403, { error: "Viewers can't close out items." });
		// Rate mode (a closed trip) is ratings-only.
		if (caller.archived) return fail(400, { error: 'This trip is already closed.' });
		const data = await request.formData();
		const tripId = data.get('trip_id')?.toString();
		const originalItemId = data.get('original_item_id')?.toString();
		const dayId = data.get('day_id')?.toString() || '';
		const phaseId = data.get('phase_id')?.toString() || '';
		const title = data.get('title')?.toString().trim();
		const type = data.get('type')?.toString() || 'activity';

		if (!tripId || !title) return fail(400, { error: 'Trip ID and title are required.' });
		if (tripId !== caller.trip.id) return fail(400, { error: 'Item is not on this trip.' });

		try {
			// The walk posts Didn't do first, so the original is usually already
			// considered: re-writing it is a no-op the traveler closeout exception
			// refuses (C1). Check it belongs here, and skip the write when done already.
			let markOriginal = false;
			if (originalItemId) {
				const original = await locals.pb
					.collection('items')
					.getOne<Item>(originalItemId, { fields: 'id,trip,status' });
				if (original.trip !== caller.trip.id)
					return fail(400, { error: 'Item is not on this trip.' });
				markOriginal = original.status !== 'considered';
			}
			// Create first: if it fails, the original must not be left considered with
			// no replacement.
			await locals.pb.collection('items').create({
				trip: tripId,
				day: dayId,
				phase: phaseId,
				type,
				title,
				status: 'done',
				booked: false,
				sort_order: 999
			});
			if (originalItemId && markOriginal) {
				await locals.pb.collection('items').update(originalItemId, { status: 'considered' });
			}
			return { replacementAdded: true };
		} catch (err: unknown) {
			if (isNotFound(err)) return fail(400, { error: 'Item not found.' });
			return pbFailure(err, 'Failed to create replacement.');
		}
	},

	finishCloseout: async ({ request, locals, params }) => {
		try {
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

			const membership = await locals.pb
				.collection('trip_members')
				.getFirstListItem<TripMember>(
					`trip = "${trip.id}" && user = "${locals.user!.id}" && removed_at = ""`
				);
			// Closeout (the walk + the `archived: true` transition) is open to anyone who
			// traveled — owner/co_owner/traveler. Viewers can't get here (loader bounces
			// them); guard the write too so a hand-crafted POST is rejected.
			if (membership.role === 'viewer') {
				return fail(403, { error: 'Viewers cannot close out a trip.' });
			}
			// #576 — a closed trip is rating-only; re-running Finish would rewrite the
			// publish choice.
			if (trip.archived) {
				return fail(400, { error: 'This trip is already closed.' });
			}
			const canPublish = membership.role === 'owner' || membership.role === 'co_owner';

			// Done-leak guard (#240): finishing the walk must leave NO planned item silently
			// unmarked — every still-`planned` itinerary item is resolved to `done` so the
			// record's done-set is real, and the "considered" set stays explicitly-considered
			// only (the inverse planned-leak guard lives in buildArchiveView). Unplanned
			// parking-lot ideas are untouched (they were never part of the walk).
			const planned = await locals.pb.collection('items').getFullList<Item>({
				filter: `trip = "${trip.id}" && status = "planned"`,
				fields: 'id'
			});
			await Promise.all(
				planned.map((i) => locals.pb.collection('items').update(i.id, { status: 'done' }))
			);

			const updates: Record<string, unknown> = { archived: true };

			// Publish choice (#241) — the owner's final closeout step. SERVER-ENFORCED to
			// owner/co_owner only: a traveler's finish ignores any publish form fields
			// entirely (their wizard has no publish step). Binary: Keep private (default)
			// clears archive_publish_at; Publish sets it to the chosen date (inline date
			// defaults to today → "publish now"; a future date schedules). Sharing is
			// enabled + a token minted only when actually publishing.
			if (canPublish) {
				const data = await request.formData();
				const publish = data.get('publish')?.toString() === 'on';
				const showBudget = data.get('show_budget')?.toString() === 'on';
				if (publish) {
					// #301: default "publish now" to the trip-LOCAL today (matching the
					// visibility gate), never the UTC date — a blank/today value must read
					// live, not schedule to tomorrow, evening in a behind-UTC zone.
					const day = resolvePublishDay(data.get('publish_date')?.toString() || '', {
						timezone: trip.timezone
					});
					updates.archive_publish_at = `${day} 00:00:00.000Z`;
					updates.archive_enabled = true;
					updates.archive_show_budget = showBudget;
					if (!trip.public_share_token) {
						const { generateArchiveToken } = await import('$lib/portability/archive-token');
						updates.public_share_token = generateArchiveToken();
					}
				} else {
					// Keep private (the default + a real terminal state): no publish date.
					updates.archive_publish_at = '';
				}
			}

			await locals.pb.collection('trips').update(trip.id, updates);
			redirect(303, `/trips/${params.slug}`);
		} catch (err: unknown) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to archive.' });
		}
	}
};
