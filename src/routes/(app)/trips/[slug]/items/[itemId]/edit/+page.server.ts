import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Item, ChecklistItem, TripMember } from '$lib/types';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { trip, phases, days } = await parent();

	let item: Item;
	try {
		item = await locals.pb.collection('items').getOne<Item>(params.itemId);
	} catch {
		error(404, 'Item not found');
	}

	if (item.trip !== trip.id) {
		error(404, 'Item not found');
	}

	const [checklistItems, members] = await Promise.all([
		item.type === 'checklist'
			? locals.pb.collection('checklist_items').getFullList<ChecklistItem>({
					filter: `item = "${item.id}"`,
					sort: 'order'
				})
			: Promise.resolve([]),
		locals.pb.collection('trip_members').getFullList<TripMember>({
			filter: `trip = "${trip.id}"`,
			expand: 'user'
		})
	]);

	return { item, checklistItems, members, phases, days };
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		const data = await request.formData();

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

		if (!title) return fail(400, { error: 'Title is required.' });

		try {
			const item = await locals.pb.collection('items').getOne(params.itemId);
			const type = item.getString('type');

			if (booked && (type === 'meal' || type === 'note')) {
				return fail(400, { error: `${type} items cannot be marked as booked.` });
			}

			await locals.pb.collection('items').update(params.itemId, {
				subtype,
				title,
				description,
				day: day || '',
				phase: phase || '',
				slot,
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
				status,
				parking_lot_scope: day ? 'none' : 'trip'
			});

			redirect(303, `/trips/${params.slug}/items/${params.itemId}`);
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'status' in err && err.status === 303) throw err;
			const message = err instanceof Error ? err.message : 'Failed to update item.';
			return fail(500, { error: message });
		}
	},

	delete: async ({ params, locals }) => {
		try {
			const item = await locals.pb.collection('items').getOne(params.itemId);
			const dayId = item.getString('day');
			await locals.pb.collection('items').delete(params.itemId);

			if (dayId) {
				redirect(303, `/trips/${params.slug}/days/${dayId}`);
			}
			redirect(303, `/trips/${params.slug}`);
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'status' in err && err.status === 303) throw err;
			const message = err instanceof Error ? err.message : 'Failed to delete item.';
			return fail(500, { error: message });
		}
	}
};
