import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isValidTimeZone } from '$lib/shell/trip-time';

export const load: PageServerLoad = async () => {
	return {};
};

function toSlug(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const data = await request.formData();
		const title = data.get('title')?.toString().trim();
		const startDate = data.get('start_date')?.toString();
		const endDate = data.get('end_date')?.toString();
		const timezone =
			data.get('timezone')?.toString().trim() ||
			Intl.DateTimeFormat().resolvedOptions().timeZone;
		const locationSummary = data.get('location_summary')?.toString().trim() || '';

		if (!title) return fail(400, { error: 'Title is required.' });
		if (!startDate || !endDate) return fail(400, { error: 'Start and end dates are required.' });
		if (new Date(startDate) > new Date(endDate)) {
			return fail(400, { error: 'Start date must be before end date.' });
		}
		if (!isValidTimeZone(timezone)) {
			return fail(400, { error: `"${timezone}" is not a valid timezone.` });
		}

		// Generate slug from title, append suffix on collision
		const base = toSlug(title) || 'trip';
		let slug = base;
		for (let i = 1; i <= 10; i++) {
			const existing = await locals.pb
				.collection('trips')
				.getFirstListItem(`slug = "${slug}"`)
				.catch(() => null);
			if (!existing) break;
			slug = `${base}-${i}`;
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

			redirect(303, `/trips/${trip.slug}`);
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'status' in err) throw err;
			const message = (err as { message?: string }).message ?? 'Failed to create trip.';
			return fail(500, { error: message });
		}
	}
};
