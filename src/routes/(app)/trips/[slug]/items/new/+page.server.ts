import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Day, TripMember, Slot } from '$lib/types';
import { timeToDatetime, datetimeToTime } from '$lib/shell/format';

const VALID_SLOTS: Slot[] = ['morning', 'afternoon', 'evening', 'anytime'];
const PB_BASE = process.env.PUBLIC_PB_URL || 'http://127.0.0.1:8090';

export const load: PageServerLoad = async ({ url, locals, parent }) => {
	const { trip, membership, phases, days } = await parent();

	const dayId = url.searchParams.get('day');
	const phaseIdParam = url.searchParams.get('phase');
	const slotParam = url.searchParams.get('slot') as Slot | null;
	const suggestionId = url.searchParams.get('suggestion') || '';

	// If a day was preselected and no phase was explicitly passed, infer the
	// phase from the day's first matched phase so the form arrives filled in.
	let preselectedPhase = phaseIdParam || '';
	if (dayId && !preselectedPhase) {
		const day = (days as Day[]).find((d) => d.id === dayId);
		if (day?.phases?.length) {
			preselectedPhase = day.phases[0];
		}
	}

	// Load trip members for assigned_to selector
	const members = await locals.pb.collection('trip_members').getFullList<TripMember>({
		filter: `trip = "${trip.id}"`,
		expand: 'user'
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
				prefill = {
					...raw,
					start_time: datetimeToTime(raw.start_time ?? ''),
					end_time: datetimeToTime(raw.end_time ?? ''),
					_suggestion_id: s.id,
					_author_name: s.author_name
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
		preselectedDay: dayId || '',
		preselectedPhase,
		preselectedSlot: slotParam && VALID_SLOTS.includes(slotParam) ? slotParam : 'anytime',
		submitAsSuggestion,
		prefill
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
		const membership = await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}"`);
		const data = await request.formData();

		const type = data.get('type')?.toString() || 'activity';
		const subtype = data.get('subtype')?.toString() || '';
		const title = data.get('title')?.toString().trim();
		const description = data.get('description')?.toString() || '';
		const day = data.get('day')?.toString() || '';
		const phase = data.get('phase')?.toString() || '';
		const slot = data.get('slot')?.toString() || 'anytime';
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
		const booked = data.get('booked') === 'on';
		const reservationUrl = data.get('reservation_url')?.toString() || '';
		const freeCancellation = data.get('free_cancellation') === 'on';
		const costEstimate = parseFloat(data.get('cost_estimate_usd')?.toString() || '0') || 0;
		const costActual = parseFloat(data.get('cost_actual_usd')?.toString() || '0') || 0;
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

		if (!title) return fail(400, { error: 'Title is required.' });

		// Validate: meals and notes can't be booked
		if (booked && (type === 'meal' || type === 'note')) {
			return fail(400, { error: `${type} items cannot be marked as booked.` });
		}

		const payload = {
			trip: trip.id,
			phase: phase || '',
			day: day || '',
			slot,
			type,
			subtype,
			title,
			description,
			location_name: locationName,
			location_address: locationAddress,
			location_coords: locationCoords,
			google_place_id: googlePlaceId,
			start_time: timeToDatetime(startTime),
			end_time: timeToDatetime(endTime),
			booked,
			confirmation_codes: confirmationCodes,
			reservation_url: reservationUrl,
			free_cancellation: freeCancellation,
			cost_estimate_usd: costEstimate,
			cost_actual_usd: costActual,
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

		const submitAsSuggestion = membership.role === 'traveler' && !trip.auto_approve_suggestions;

		// Suggestion path: traveler with auto-approve off.
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
			redirect(303, `/trips/${params.slug}`);
		}

		// Direct create path (owner/co_owner, or traveler with auto_approve on).
		try {
			const existingItems = await locals.pb.collection('items').getFullList({
				filter: day
					? `trip = "${trip.id}" && day = "${day}" && slot = "${slot}"`
					: `trip = "${trip.id}" && day = "" && slot = "${slot}"`,
				sort: '-rank',
				fields: 'rank'
			});
			const nextRank = existingItems.length > 0 ? Number(existingItems[0]['rank']) + 1 : 0;

			await locals.pb.collection('items').create({
				...payload,
				rank: nextRank,
				parking_lot_scope: day ? 'none' : 'trip',
				created_by: membership.id,
				status: 'planned'
			});

			// Redirect back to day view if came from a day, otherwise trip overview
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
