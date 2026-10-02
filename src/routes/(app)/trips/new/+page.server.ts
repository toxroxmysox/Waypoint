import { fail, redirect, isRedirect } from '@sveltejs/kit';
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
		.replace(/^-|-$/g, '')
		// trips.slug max is 100; leave room for the hook's collision suffix.
		.slice(0, 80)
		.replace(/-$/, '');
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

		// #375 — `field` names the control the client should focus; it never
		// changes what is validated, only where the failure is reported.
		if (!title) return fail(400, { error: 'Title is required.', field: 'title' });
		// #270 / ADR-0022 — name-first create: dates are optional. Skipping both
		// creates a dateless (forming) trip; the PB hook skips phase/day seeding
		// and the promotion (first date-set) seeds them later. Both or neither.
		if ((startDate && !endDate) || (!startDate && endDate)) {
			return fail(400, { error: 'Set both dates, or leave both empty.', field: startDate ? 'end_date' : 'start_date' });
		}
		if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
			return fail(400, { error: 'Start date must be before end date.', field: 'start_date' });
		}
		if (!isValidTimeZone(timezone)) {
			return fail(400, { error: `"${timezone}" is not a valid timezone.`, field: 'timezone' });
		}

		// #395 — same-name heads-up. Two people creating "Thailand" are usually
		// starting the SAME trip, so before making a second one, say so: the
		// caller's own current trip, or a co-traveler's (never a stranger's). The
		// "Create anyway" button resubmits with confirm_duplicate=1. A failed check
		// never blocks the create.
		if (data.get('confirm_duplicate') !== '1') {
			const same = await locals.pb
				.send<{ mine: { slug: string; title: string }[]; co_travelers: { title: string; name: string }[] }>(
					'/api/trips/same-name',
					{ query: { title } }
				)
				.catch((err) => {
					console.error('[trips/new same-name] check failed:', err);
					return null;
				});
			const mine = same?.mine[0];
			const coTraveler = same?.co_travelers[0];
			if (mine || coTraveler) {
				return fail(409, {
					duplicate: mine ? { kind: 'mine' as const, ...mine } : { kind: 'co_traveler' as const, ...coTraveler! },
					values: { title, location_summary: locationSummary, start_date: startDate ?? '', end_date: endDate ?? '', timezone }
				});
			}
		}

		// Slug from the title. Collisions are resolved by the trips create hook
		// (#395): a probe from here runs under the caller's view rule and can't
		// see other people's trips, but the unique index is global.
		const slug = toSlug(title) || 'trip';

		try {
			const trip = await locals.pb.collection('trips').create({
				title,
				slug,
				start_date: startDate ? startDate + ' 00:00:00.000Z' : '',
				end_date: endDate ? endDate + ' 00:00:00.000Z' : '',
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
			// #395 — rethrow ONLY the redirect. A PB ClientResponseError also has
			// `status`, and rethrowing it turned a failed create into a 500 page.
			if (isRedirect(err)) throw err;
			console.error('[trips/new] create failed:', err);
			return fail(500, { error: 'Couldn’t create the trip. Please try again.' });
		}
	}
};
