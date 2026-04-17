import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return {};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const data = await request.formData();
		const title = data.get('title')?.toString().trim();
		const slug = data.get('slug')?.toString().trim().toLowerCase();
		const startDate = data.get('start_date')?.toString();
		const endDate = data.get('end_date')?.toString();
		const timezone = data.get('timezone')?.toString() || Intl.DateTimeFormat().resolvedOptions().timeZone;
		const locationSummary = data.get('location_summary')?.toString().trim() || '';

		if (!title) return fail(400, { error: 'Title is required.' });
		if (!slug) return fail(400, { error: 'URL slug is required.' });
		if (!startDate || !endDate) return fail(400, { error: 'Start and end dates are required.' });
		if (new Date(startDate) > new Date(endDate)) {
			return fail(400, { error: 'Start date must be before end date.' });
		}
		// Validate slug format
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
			return fail(400, { error: 'Slug must be lowercase letters, numbers, and hyphens only.' });
		}

		try {
			const trip = await locals.pb.collection('trips').create({
				title,
				slug,
				start_date: startDate + ' 00:00:00.000Z',
				end_date: endDate + ' 00:00:00.000Z',
				timezone,
				location_summary: locationSummary,
				created_by: locals.user!.id,
				auto_approve_suggestions: true,
				archive_enabled: false,
				archive_publish_after_days: 7,
				archived: false
			});

			redirect(303, `/trips/${trip.getString('slug')}`);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to create trip.';
			if (message.includes('slug')) {
				return fail(400, { error: 'That URL slug is already taken.' });
			}
			return fail(500, { error: message });
		}
	}
};
