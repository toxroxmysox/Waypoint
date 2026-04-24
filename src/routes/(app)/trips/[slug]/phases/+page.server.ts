import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { trip, phases } = await parent();
	return { trip, phases };
};

export const actions: Actions = {
	create: async ({ request, locals, params }) => {
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
		const data = await request.formData();
		const name = data.get('name')?.toString().trim();
		const location = data.get('location')?.toString().trim() || '';
		const countryCode = data.get('country_code')?.toString().trim() || '';
		const startDate = data.get('start_date')?.toString();
		const endDate = data.get('end_date')?.toString();
		const color = data.get('color')?.toString() || '#6b7280';

		if (!name) return fail(400, { error: 'Phase name is required.' });
		if (!startDate || !endDate) return fail(400, { error: 'Start and end dates are required.' });
		if (new Date(startDate) > new Date(endDate)) {
			return fail(400, { error: 'Start date must be before end date.' });
		}

		const tripStart = (trip['start_date'] as string).split('T')[0].split(' ')[0];
		const tripEnd = (trip['end_date'] as string).split('T')[0].split(' ')[0];
		if (startDate < tripStart || endDate > tripEnd) {
			return fail(400, {
				error: `Phase dates must fall within the trip (${tripStart} to ${tripEnd}). Edit the trip dates first if you need a wider range.`
			});
		}

		try {
			const existing = await locals.pb.collection('phases').getFullList({
				filter: `trip = "${trip.id}"`,
				sort: '-order',
				fields: 'order'
			});
			const nextOrder = existing.length > 0 ? Number(existing[0]['order']) + 1 : 0;

			await locals.pb.collection('phases').create({
				trip: trip.id,
				name,
				location,
				country_code: countryCode,
				start_date: startDate + ' 00:00:00.000Z',
				end_date: endDate + ' 00:00:00.000Z',
				color,
				order: nextOrder
			});

			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to create phase.';
			return fail(500, { error: message });
		}
	},

	reorder: async ({ request, locals, params }) => {
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
		const data = await request.formData();
		const phaseId = data.get('phase_id')?.toString();
		const direction = data.get('direction')?.toString();

		if (!phaseId || !direction) return fail(400, { error: 'Missing parameters.' });

		try {
			const phases = await locals.pb.collection('phases').getFullList({
				filter: `trip = "${trip.id}"`,
				sort: 'order'
			});

			const idx = phases.findIndex((p) => p.id === phaseId);
			if (idx === -1) return fail(404, { error: 'Phase not found.' });

			const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
			if (swapIdx < 0 || swapIdx >= phases.length) return { success: true };

			const currentOrder = Number(phases[idx]['order']);
			const swapOrder = Number(phases[swapIdx]['order']);

			await Promise.all([
				locals.pb.collection('phases').update(phases[idx].id, { order: swapOrder }),
				locals.pb.collection('phases').update(phases[swapIdx].id, { order: currentOrder })
			]);

			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to reorder.';
			return fail(500, { error: message });
		}
	},

	delete: async ({ request, locals }) => {
		const data = await request.formData();
		const phaseId = data.get('phase_id')?.toString();

		if (!phaseId) return fail(400, { error: 'Missing phase ID.' });

		try {
			await locals.pb.collection('phases').delete(phaseId);
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to delete phase.';
			return fail(500, { error: message });
		}
	}
};
