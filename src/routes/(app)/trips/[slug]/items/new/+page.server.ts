import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Day, TripGoal, TripMember } from '$lib/types';
import { datetimeToTime } from '$lib/shell/format';
import { combineDateTime } from '$lib/shell/trip-time';
import { nextSortOrder } from '$lib/itinerary/sort-order';
import { syncGoalLinks } from '$lib/itinerary/goal-links';

const PB_BASE = process.env.PUBLIC_PB_URL || 'http://127.0.0.1:8090';

export const load: PageServerLoad = async ({ url, locals, parent }) => {
	const { trip, membership, phases, days } = await parent();

	const dayId = url.searchParams.get('day');
	const phaseIdParam = url.searchParams.get('phase');
	const suggestionId = url.searchParams.get('suggestion') || '';

	// If a day was preselected and no phase was explicitly passed, infer the
	// phase from the day's first matched phase so the form arrives filled in.
	// (#177 may later override both from a suggestion's proposed payload.)
	let preselectedDay = dayId || '';
	let preselectedPhase = phaseIdParam || '';
	if (preselectedDay && !preselectedPhase) {
		const day = (days as Day[]).find((d) => d.id === preselectedDay);
		if (day?.phases?.length) {
			preselectedPhase = day.phases[0];
		}
	}

	// Load trip members for assigned_to selector
	const members = await locals.pb.collection('trip_members').getFullList<TripMember>({
		filter: `trip = "${trip.id}" && removed_at = ""`,
		expand: 'user'
	});

	// #78 — goals for the "Addresses goal(s)" multi-select. The link is written
	// goal-side on create; viewers never reach this form.
	const goals = await locals.pb.collection('trip_goals').getFullList<TripGoal>({
		filter: `trip = "${trip.id}"`,
		sort: 'sort_order',
		fields: 'id,title'
	});

	// Pre-fill from suggestion if editing for approval.
	let prefill: Record<string, unknown> | null = null;
	if (suggestionId) {
		try {
			const token = locals.pb.authStore.token;
			const res = await fetch(
				`${PB_BASE}/api/suggestions/list?trip_id=${trip.id}&status=pending`,
				{ headers: { Authorization: `Bearer ${token}` } }
			);
			const resData = await res.json();
			const s = (resData.items ?? []).find((item: { id: string }) => item.id === suggestionId);
			if (s) {
				const raw = s.payload ?? {};
				// #177 — the traveler's proposed day/phase live in the suggestion
				// payload, not the URL. Seed the create-mode preselect from them so
				// Edit & Approve keeps the scheduling intent (day flows through
				// context.preselectedDay; phase through context.preselectedPhase).
				if (raw.day) preselectedDay = String(raw.day);
				if (raw.phase) preselectedPhase = String(raw.phase);
				else if (preselectedDay && !preselectedPhase) {
					const proposedDay = (days as Day[]).find((d) => d.id === preselectedDay);
					if (proposedDay?.phases?.length) preselectedPhase = proposedDay.phases[0];
				}
				// Human-readable proposed-day label for the "Proposed by … for …" line.
				let proposedDayLabel = 'Unscheduled';
				const proposedDayRec = (days as Day[]).find((d) => d.id === String(raw.day ?? ''));
				if (proposedDayRec?.date) {
					proposedDayLabel = new Date(proposedDayRec.date.replace(' ', 'T')).toLocaleDateString(
						'en-US',
						{ weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }
					);
				}
				prefill = {
					...raw,
					start_time: datetimeToTime(raw.start_time ?? ''),
					end_time: datetimeToTime(raw.end_time ?? ''),
					end_date: String(raw.end_date ?? '').split(/[T ]/)[0],
					cost_estimate_usd: Number(raw.cost_estimate_usd) || 0,
					assigned_to: Array.isArray(raw.assigned_to) ? raw.assigned_to : [],
					_suggestion_id: s.id,
					_author_name: s.author_name,
					_proposed_day_label: proposedDayLabel
				};
			}
		} catch (_) {
			// If load fails, render empty form.
		}
	}

	// Traveler with auto-approve off submits to suggestions endpoint instead.
	const submitAsSuggestion =
		membership.role === 'traveler' && !trip.auto_approve_suggestions;

	return {
		trip,
		membership,
		phases,
		days,
		members,
		goals,
		preselectedDay,
		preselectedPhase,
		tripStartDate: String(trip.start_date || '').split(/[T ]/)[0],
		tripEndDate: String(trip.end_date || '').split(/[T ]/)[0],
		submitAsSuggestion,
		prefill
	};
};

export const actions: Actions = {
	default: async ({ request, url, locals, params }) => {
		// Trip-Mode quick-add (AddSheet sends ?from=trip): keep the user in Trip
		// Mode on save instead of ejecting to the Planning day view (#169).
		const cameFromTrip = url.searchParams.get('from') === 'trip';
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
		const membership = await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}" && removed_at = ""`);
		const data = await request.formData();

		const type = data.get('type')?.toString() || 'activity';
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
		// #130 — flight timezones: stored-not-shown. Only flights submit these
		// (hidden inputs render flight-only); non-flight items stay untouched.
		const startTz = type === 'flight' ? data.get('start_tz')?.toString() || '' : '';
		const endTz = type === 'flight' ? data.get('end_tz')?.toString() || '' : '';
		const booked = data.get('booked') === 'on';
		const requiresBooking = data.get('requires_booking') === 'on';
		const reservationUrl = data.get('reservation_url')?.toString() || '';
		const freeCancellation = data.get('free_cancellation') === 'on';
		const costEstimate = parseFloat(data.get('cost_estimate_usd')?.toString() || '0') || 0;
		const parentItem = data.get('parent_item')?.toString() || '';
		const suggestionId = data.get('suggestion_id')?.toString() || '';

		// Parse confirmation codes from repeated fields
		const codeLabels = data.getAll('confirmation_code_label');
		const codeValues = data.getAll('confirmation_code_value');
		const confirmationCodes = codeLabels
			.map((label, i) => ({
				label: label.toString().trim(),
				value: codeValues[i]?.toString().trim() || ''
			}))
			.filter((c) => c.label || c.value);

		// Parse assigned_to
		const assignedTo = data.getAll('assigned_to').map((v) => v.toString());

		// #78 — goals this item addresses (written goal-side, after the item exists).
		const goalIds = data.getAll('goals').map((v) => v.toString());

		if (!title) return fail(400, { error: 'Title is required.' });

		// #196 — enforce the phase-required invariant at the source: an unscheduled
		// (no-day) item becomes status=unplanned, and every parking surface is
		// phase-scoped, so a phase-less unplanned item renders nowhere. Require a
		// phase whenever no day is set — but only if the trip actually has phases
		// to assign to (a zero-phase trip can't satisfy it and has no parking lot
		// yet). Skipped when a day IS set (planned items are day-anchored).
		if (!day && !phase) {
			const phaseCount = await locals.pb.collection('phases').getList(1, 1, {
				filter: `trip = "${trip.id}"`,
				fields: 'id'
			});
			if (phaseCount.totalItems > 0) {
				return fail(400, { error: 'Pick a phase for an unscheduled item, or assign it to a day.' });
			}
		}

		// Validate: meals and notes can't be booked
		if (booked && (type === 'meal' || type === 'note')) {
			return fail(400, { error: `${type} items cannot be marked as booked.` });
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

		// Multi-day span: only valid when a day is set and end is strictly after
		// the start day and within the trip. Otherwise the field is inert/cleared.
		const tripEnd = String(trip.end_date || '').split(/[T ]/)[0];
		let endDate = '';
		if (day && dayDate && endDateRaw && endDateRaw > dayDate) {
			if (tripEnd && endDateRaw > tripEnd) {
				return fail(400, { error: 'End date is after the trip ends.' });
			}
			endDate = endDateRaw;
		}

		const payload = {
			trip: trip.id,
			phase: phase || '',
			day: day || '',
			type,
			subtype,
			title,
			description,
			location_name: locationName,
			location_address: locationAddress,
			location_coords: locationCoords,
			google_place_id: googlePlaceId,
			start_time: combineDateTime(dayDate, startTime),
			end_time: combineDateTime(endDate || dayDate, endTime),
			end_date: endDate ? `${endDate} 00:00:00.000Z` : '',
			start_tz: startTz,
			end_tz: endTz,
			booked,
			requires_booking: requiresBooking,
			confirmation_codes: confirmationCodes,
			reservation_url: reservationUrl,
			free_cancellation: freeCancellation,
			cost_estimate_usd: costEstimate,
			assigned_to: assignedTo,
			parent_item: parentItem || ''
		};

		const token = locals.pb.authStore.token;

		// Edit-and-approve path: owner approving a suggestion with possible edits.
		if (suggestionId) {
			try {
				const reviewRes = await fetch(`${PB_BASE}/api/suggestions/review`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`
					},
					body: JSON.stringify({ suggestion_id: suggestionId, action: 'approve', payload })
				});
				if (!reviewRes.ok) {
					const err = await reviewRes.json().catch(() => ({}));
					return fail(reviewRes.status, { error: (err as { message?: string }).message || 'Failed to approve suggestion.' });
				}
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : 'Failed to approve suggestion.';
				return fail(500, { error: message });
			}
			redirect(303, `/trips/${params.slug}/inbox`);
		}

		// #175: travelers always route through the suggestions endpoint, never a
		// direct items.create. The endpoint runs in admin context and auto-approves
		// (creating the item immediately) when the trip has auto_approve_suggestions
		// on, or queues it for review when off — matching SPEC §4 (traveler = suggest
		// only*, with the asterisk = auto-approvable). A direct create is now blocked
		// for travelers by the items.pb.js role hook, so this reroute is required to
		// keep the traveler add-item flow working.
		const submitAsSuggestion = membership.role === 'traveler';

		if (submitAsSuggestion) {
			try {
				const suggestRes = await fetch(`${PB_BASE}/api/suggestions/create`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`
					},
					body: JSON.stringify({ trip_id: trip.id, payload })
				});
				if (!suggestRes.ok) {
					const err = await suggestRes.json().catch(() => ({}));
					return fail(suggestRes.status, { error: (err as { message?: string }).message || 'Failed to submit suggestion.' });
				}
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : 'Failed to submit suggestion.';
				return fail(500, { error: message });
			}
			// Trip-Mode quick-add keeps the user in Trip Mode on save (#169); else
			// the trip overview (an auto-approved item shows there; a queued one
			// surfaces in the owner's inbox). #244: Now absorbed Today.
			if (cameFromTrip) {
				redirect(303, `/trips/${params.slug}/now`);
			}
			redirect(303, `/trips/${params.slug}`);
		}

		// Direct create path (owner/co_owner only — travelers are handled above).
		try {
			const existingItems = await locals.pb.collection('items').getFullList({
				filter: `trip = "${trip.id}" && day = "${day}"`,
				fields: 'sort_order'
			});
			const nextOrder = nextSortOrder(existingItems.map((i) => Number(i.sort_order)));

			const created = await locals.pb.collection('items').create<{ id: string }>({
				...payload,
				sort_order: nextOrder,
				created_by: membership.id,
				status: day ? 'planned' : 'unplanned'
			});

			// Link the new item to the goals it addresses (goal-side write).
			if (goalIds.length > 0) {
				await syncGoalLinks(locals.pb, trip.id, created.id, goalIds);
			}

			// Trip-Mode quick-add lands back on the merged Now view (the new item shows
			// there — #244); planning-entry returns to the day view, else the trip
			// overview (#169).
			if (cameFromTrip) {
				redirect(303, `/trips/${params.slug}/now`);
			}
			if (day) {
				redirect(303, `/trips/${params.slug}/days/${day}`);
			}
			redirect(303, `/trips/${params.slug}`);
		} catch (err: unknown) {
			if (isRedirect(err)) throw err;
			const e = err as { message?: string; response?: { data?: Record<string, { message: string }> } };
			const fieldErrors = e.response?.data
				? Object.entries(e.response.data)
						.map(([f, v]) => `${f}: ${v.message}`)
						.join('; ')
				: '';
			const message = fieldErrors || e.message || 'Failed to create item.';
			return fail(500, { error: message });
		}
	}
};
