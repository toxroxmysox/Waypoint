import { error, fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Item, TripGoal, TripMember } from '$lib/types';
import { datetimeToTime } from '$lib/shell/format';
import { combineDateTime } from '$lib/shell/trip-time';
import { syncGoalLinks } from '$lib/itinerary/goal-links';
import type { Document } from '$lib/types';
import { codesForItem } from '$lib/documents/codes';
import { reconcileItemCodes } from '$lib/documents/reconcile-codes';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { trip, membership, phases, days } = await parent();

	let item: Item;
	try {
		item = await locals.pb.collection('items').getOne<Item>(params.itemId);
	} catch {
		error(404, 'Item not found');
	}

	if (item.trip !== trip.id) {
		error(404, 'Item not found');
	}

	// #219 — gate the edit form to who can actually save: owner/co_owner, OR the
	// member who created this item (created_by holds a trip_members.id). Matches
	// the items.pb.js update hook so a traveler can reach + submit edits to their
	// OWN item, but a direct nav to another member's item returns 403 here rather
	// than rendering a form whose submit would 403.
	const canEdit =
		membership.role === 'owner' ||
		membership.role === 'co_owner' ||
		(!!item.created_by && item.created_by === membership.id);
	if (!canEdit) {
		error(403, 'Only an owner, co-owner, or the item’s creator can edit this item.');
	}

	const members = await locals.pb.collection('trip_members').getFullList<TripMember>({
		filter: `trip = "${trip.id}" && removed_at = ""`,
		expand: 'user'
	});

	// #78 — goals for the "Addresses goal(s)" multi-select, plus which of them
	// currently link this item (the link is stored goal-side on trip_goals.items).
	const goals = await locals.pb.collection('trip_goals').getFullList<TripGoal>({
		filter: `trip = "${trip.id}"`,
		sort: 'sort_order',
		fields: 'id,title,items'
	});
	const linkedGoalIds = goals.filter((g) => (g.items ?? []).includes(item.id)).map((g) => g.id);

	// #268 / ADR-0016 — reshape the item's `kind: 'code'` Documents back into the
	// `{ label, value }[]` the inline editor expects (oldest-first → creation order),
	// so the form populates from the canonical home, not the inert legacy json field.
	const codeDocs = await locals.pb.collection('documents').getFullList<Document>({
		filter: `item = "${item.id}" && kind = "code"`,
		sort: 'created'
	});

	return {
		item: {
			...item,
			start_time: datetimeToTime(item.start_time ?? ''),
			end_time: datetimeToTime(item.end_time ?? ''),
			end_date: String(item.end_date ?? '').split(/[T ]/)[0],
			confirmation_codes: codesForItem(codeDocs, item.id),
			linked_goal_ids: linkedGoalIds
		},
		members,
		goals: goals.map((g) => ({ id: g.id, title: g.title })),
		phases,
		days,
		tripStartDate: String(trip.start_date || '').split(/[T ]/)[0],
		tripEndDate: String(trip.end_date || '').split(/[T ]/)[0]
	};
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		const data = await request.formData();

		const type = data.get('type')?.toString() || '';
		const subtype = data.get('subtype')?.toString() || '';
		const title = data.get('title')?.toString().trim();
		const description = data.get('description')?.toString() || '';
		const day = data.get('day')?.toString() || '';
		const phase = data.get('phase')?.toString() || '';
		const locationName = data.get('location_name')?.toString() || '';
		const locationAddress = data.get('location_address')?.toString() || '';
		const locationCoordsRaw = data.get('location_coords')?.toString() || '';
		let locationCoords = null;
		if (locationCoordsRaw) {
			try {
				locationCoords = JSON.parse(locationCoordsRaw);
			} catch {
				return fail(400, { error: 'Invalid location data.' });
			}
		}
		const googlePlaceId = data.get('google_place_id')?.toString() || '';
		const startTime = data.get('start_time')?.toString() || '';
		const endTime = data.get('end_time')?.toString() || '';
		const endDateRaw = (data.get('end_date')?.toString() || '').split(/[T ]/)[0];
		// #130 — flight timezones: stored-not-shown. Gated to flights below so
		// non-flight items stay untouched.
		const startTzRaw = data.get('start_tz')?.toString() || '';
		const endTzRaw = data.get('end_tz')?.toString() || '';
		const booked = data.get('booked') === 'on';
		const requiresBooking = data.get('requires_booking') === 'on';
		const reservationUrl = data.get('reservation_url')?.toString() || '';
		const freeCancellation = data.get('free_cancellation') === 'on';
		const costEstimate = parseFloat(data.get('cost_estimate_usd')?.toString() || '0') || 0;
		const status = data.get('status')?.toString() || 'planned';

		const codeLabels = data.getAll('confirmation_code_label');
		const codeValues = data.getAll('confirmation_code_value');
		const confirmationCodes = codeLabels
			.map((label, i) => ({
				label: label.toString().trim(),
				value: codeValues[i]?.toString().trim() || ''
			}))
			.filter((c) => c.label || c.value);

		const assignedTo = data.getAll('assigned_to').map((v) => v.toString());
		// #78 — goals this item addresses (reconciled goal-side after the update).
		const goalIds = data.getAll('goals').map((v) => v.toString());

		if (!title) return fail(400, { error: 'Title is required.' });

		try {
			const item = await locals.pb.collection('items').getOne(params.itemId);
			// Type is now editable in the form (parity with create). Fall back to the
			// stored type if the form somehow omits it.
			const resolvedType = type || (item['type'] as string);

			if (booked && (resolvedType === 'meal' || resolvedType === 'note')) {
				return fail(400, { error: `${resolvedType} items cannot be marked as booked.` });
			}

			// Status logic: only override to planned/unplanned based on day presence;
			// preserve 'done' and 'considered' statuses unless the item is being un-scheduled.
			let resolvedStatus = status;
			if (!day && status !== 'done' && status !== 'considered') {
				resolvedStatus = 'unplanned';
			} else if (day && status === 'unplanned') {
				resolvedStatus = 'planned';
			}

			// #196 — phase-required invariant: an unplanned item must keep a phase,
			// or it falls into the phase-less limbo that renders on no surface.
			// (done/considered items are day-anchored or archival and phase-optional.)
			// Only enforce when the trip has phases to assign to.
			if (resolvedStatus === 'unplanned' && !phase) {
				const phaseCount = await locals.pb.collection('phases').getList(1, 1, {
					filter: `trip = "${item['trip']}"`,
					fields: 'id'
				});
				if (phaseCount.totalItems > 0) {
					return fail(400, { error: 'Pick a phase for an unscheduled item, or assign it to a day.' });
				}
			}

			// Resolve the owning day's date so item times carry the real calendar
			// date (naive trip-local), not a 1970 placeholder. No day = no anchor.
			let dayDate = '';
			if (day) {
				try {
					const dayRec = await locals.pb.collection('days').getOne(day);
					dayDate = String(dayRec.date || '').split(/[T ]/)[0];
				} catch {
					dayDate = '';
				}
			}

			// Multi-day span: cleared when unscheduled; else must be after the
			// start day and within the trip.
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
			const tripEnd = String(trip.end_date || '').split(/[T ]/)[0];
			let endDate = '';
			if (resolvedStatus !== 'unplanned' && day && dayDate && endDateRaw && endDateRaw > dayDate) {
				if (tripEnd && endDateRaw > tripEnd) {
					return fail(400, { error: 'End date is after the trip ends.' });
				}
				endDate = endDateRaw;
			}

			await locals.pb.collection('items').update(params.itemId, {
				type: resolvedType,
				subtype,
				title,
				description,
				day: day || '',
				phase: phase || '',
				location_name: locationName,
				location_address: locationAddress,
				location_coords: locationCoords,
				google_place_id: googlePlaceId,
				start_time: combineDateTime(dayDate, startTime),
				end_time: combineDateTime(endDate || dayDate, endTime),
				end_date: endDate ? `${endDate} 00:00:00.000Z` : '',
				start_tz: resolvedType === 'flight' ? startTzRaw : '',
				end_tz: resolvedType === 'flight' ? endTzRaw : '',
				booked,
				requires_booking: requiresBooking,
				// #268 / ADR-0016 — codes no longer persist on the item; they reconcile
				// into `kind: 'code'` Documents below. The legacy json field is left inert.
				reservation_url: reservationUrl,
				free_cancellation: freeCancellation,
				cost_estimate_usd: costEstimate,
				assigned_to: assignedTo,
				status: resolvedStatus
			});

			// #268 / ADR-0016 — reconcile the item's code Documents against the
			// submitted list: upsert by (label, value), delete the removed. Touches
			// only this item's code docs; goes through locals.pb so rules + the
			// file-XOR-code hook apply.
			await reconcileItemCodes(locals.pb, item['trip'] as string, params.itemId, confirmationCodes);

			// Reconcile goal links (add to newly-selected goals, remove from de-selected).
			await syncGoalLinks(locals.pb, trip.id, params.itemId, goalIds);

			redirect(303, `/trips/${params.slug}/items/${params.itemId}`);
		} catch (err: unknown) {
			if (isRedirect(err)) throw err;
			const message = err instanceof Error ? err.message : 'Failed to update item.';
			return fail(500, { error: message });
		}
	},

	delete: async ({ params, locals }) => {
		try {
			const item = await locals.pb.collection('items').getOne(params.itemId);
			const dayId = item['day'] as string;
			await locals.pb.collection('items').delete(params.itemId);

			if (dayId) {
				redirect(303, `/trips/${params.slug}/days/${dayId}`);
			}
			redirect(303, `/trips/${params.slug}`);
		} catch (err: unknown) {
			if (isRedirect(err)) throw err;
			const message = err instanceof Error ? err.message : 'Failed to delete item.';
			return fail(500, { error: message });
		}
	}
};
