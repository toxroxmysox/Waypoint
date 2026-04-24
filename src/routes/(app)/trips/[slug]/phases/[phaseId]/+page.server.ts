import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Phase, Day, Item } from '$lib/types';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { trip } = await parent();

	let phase: Phase;
	try {
		phase = await locals.pb.collection('phases').getOne<Phase>(params.phaseId);
	} catch {
		error(404, 'Phase not found');
	}

	if (phase.trip !== trip.id) {
		error(404, 'Phase not found');
	}

	// Note: filtering multi-relation `phases` via `?=` against PB's filter parser
	// returned nothing despite data being correct (Apr 2026, PB v0.27.x). Fetch
	// trip's days and filter in-memory — same pattern the trip overview uses.
	const [allDays, items] = await Promise.all([
		locals.pb.collection('days').getFullList<Day>({
			filter: `trip = "${trip.id}"`,
			sort: 'date'
		}),
		locals.pb.collection('items').getFullList<Item>({
			filter: `trip = "${trip.id}" && phase = "${phase.id}"`,
			sort: 'rank'
		})
	]);

	const days = allDays.filter((d) => (d.phases ?? []).includes(phase.id));

	return { phase, phaseDays: days, phaseItems: items };
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
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
			await locals.pb.collection('phases').update(params.phaseId, {
				name,
				location,
				country_code: countryCode,
				start_date: startDate + ' 00:00:00.000Z',
				end_date: endDate + ' 00:00:00.000Z',
				color
			});
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to update phase.';
			return fail(500, { error: message });
		}

		throw redirect(303, `/trips/${params.slug}/phases`);
	}
};
