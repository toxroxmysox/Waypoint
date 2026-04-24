import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Day, Phase, TripMember, Slot } from '$lib/types';

const VALID_SLOTS: Slot[] = ['morning', 'afternoon', 'evening', 'anytime'];

export const load: PageServerLoad = async ({ url, locals, parent }) => {
	const { trip, phases, days } = await parent();

	const dayId = url.searchParams.get('day');
	const phaseIdParam = url.searchParams.get('phase');
	const slotParam = url.searchParams.get('slot') as Slot | null;

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

	return {
		trip,
		phases,
		days,
		members,
		preselectedDay: dayId || '',
		preselectedPhase,
		preselectedSlot: slotParam && VALID_SLOTS.includes(slotParam) ? slotParam : 'anytime'
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
		const membership = await locals.pb
			.collection('trip_members')
			.getFirstListItem(`trip = "${trip.id}" && user = "${locals.user!.id}"`);
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
		const startTime = data.get('start_time')?.toString() || '';
		const endTime = data.get('end_time')?.toString() || '';
		const booked = data.get('booked') === 'on';
		const reservationUrl = data.get('reservation_url')?.toString() || '';
		const freeCancellation = data.get('free_cancellation') === 'on';
		const costEstimate = parseFloat(data.get('cost_estimate_usd')?.toString() || '0') || 0;
		const costActual = parseFloat(data.get('cost_actual_usd')?.toString() || '0') || 0;
		const parentItem = data.get('parent_item')?.toString() || '';

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

		try {
			// Get next rank for the day/slot
			const existingItems = await locals.pb.collection('items').getFullList({
				filter: day
					? `trip = "${trip.id}" && day = "${day}" && slot = "${slot}"`
					: `trip = "${trip.id}" && day = "" && slot = "${slot}"`,
				sort: '-rank',
				fields: 'rank'
			});
			const nextRank = existingItems.length > 0 ? Number(existingItems[0]['rank']) + 1 : 0;

			const item = await locals.pb.collection('items').create({
				trip: trip.id,
				day: day || '',
				phase: phase || '',
				slot,
				type,
				subtype,
				title,
				description,
				location_name: locationName,
				location_address: locationAddress,
				start_time: startTime,
				end_time: endTime,
				booked,
				confirmation_codes: confirmationCodes,
				reservation_url: reservationUrl,
				free_cancellation: freeCancellation,
				cost_estimate_usd: costEstimate,
				cost_actual_usd: costActual,
				assigned_to: assignedTo,
				rank: nextRank,
				parent_item: parentItem || '',
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
			// PocketBase ClientResponseError has a .response.data with per-field validation errors.
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
