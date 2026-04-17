import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Day, TripMember } from '$lib/types';

export const load: PageServerLoad = async ({ url, locals, parent }) => {
	const { trip, phases, days } = await parent();

	const dayId = url.searchParams.get('day');
	const phaseId = url.searchParams.get('phase');

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
		preselectedPhase: phaseId || ''
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		const trip = await locals.pb.collection('trips').getFirstListItem(`slug = "${params.slug}"`);
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
			const nextRank = existingItems.length > 0 ? existingItems[0].getInt('rank') + 1 : 0;

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
				created_by: locals.user!.id,
				status: 'planned'
			});

			// Redirect back to day view if came from a day, otherwise trip overview
			if (day) {
				redirect(303, `/trips/${trip.getString('slug')}/days/${day}`);
			}
			redirect(303, `/trips/${trip.getString('slug')}`);
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'status' in err && err.status === 303) throw err;
			const message = err instanceof Error ? err.message : 'Failed to create item.';
			return fail(500, { error: message });
		}
	}
};
