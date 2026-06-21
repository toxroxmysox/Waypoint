import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Item, TripMember } from '$lib/types';
import { getTripLifecycle } from '$lib/trip-mode/trip-lifecycle';

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

	return { trip, membership, days, phases, items, canCurate };
};

export const actions: Actions = {
	markDone: async ({ request, locals }) => {
		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		if (!itemId) return fail(400, { error: 'Missing item ID.' });

		try {
			await locals.pb.collection('items').update(itemId, { status: 'done' });
			return { success: true };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to update item.' });
		}
	},

	markDoneAll: async ({ request, locals }) => {
		const data = await request.formData();
		const itemIds = data.getAll('item_ids').map((id) => id.toString());
		if (itemIds.length === 0) return fail(400, { error: 'No items to mark.' });

		try {
			await Promise.all(
				itemIds.map((id) => locals.pb.collection('items').update(id, { status: 'done' }))
			);
			return { bulkSuccess: true, count: itemIds.length };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to bulk update.' });
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

	trimEnd: async ({ request, locals }) => {
		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		const endDate = (data.get('end_date')?.toString() || '').split(/[T ]/)[0];
		if (!itemId) return fail(400, { error: 'Missing item ID.' });
		try {
			await locals.pb.collection('items').update(itemId, {
				end_date: endDate ? `${endDate} 00:00:00.000Z` : ''
			});
			return { success: true };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to update end date.' });
		}
	},

	addReplacement: async ({ request, locals }) => {
		const data = await request.formData();
		const tripId = data.get('trip_id')?.toString();
		const originalItemId = data.get('original_item_id')?.toString();
		const dayId = data.get('day_id')?.toString() || '';
		const phaseId = data.get('phase_id')?.toString() || '';
		const title = data.get('title')?.toString().trim();
		const type = data.get('type')?.toString() || 'activity';

		if (!tripId || !title) return fail(400, { error: 'Trip ID and title are required.' });

		try {
			if (originalItemId) {
				await locals.pb.collection('items').update(originalItemId, { status: 'considered' });
			}

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
			return { replacementAdded: true };
		} catch (err: unknown) {
			return fail(500, {
				error: err instanceof Error ? err.message : 'Failed to create replacement.'
			});
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
					const rawDate = (data.get('publish_date')?.toString() || '').split(/[T ]/)[0];
					const today = new Date().toISOString().split('T')[0];
					const day = rawDate || today;
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
