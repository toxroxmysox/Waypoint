import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type PocketBase from 'pocketbase';
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

type SameName = {
	mine: { slug: string; title: string }[];
	co_travelers: { trip_id: string; title: string; name: string }[];
};

/** #395 — the caller's own current trip, or a co-traveler's, with this name
 *  (never a stranger's). Null when the check itself fails: it never blocks. */
function findSameName(pb: PocketBase, title: string) {
	return pb.send<SameName>('/api/trips/same-name', { query: { title } }).catch((err) => {
		console.error('[trips/new same-name] check failed:', err);
		return null;
	});
}

function formValues(data: FormData) {
	return {
		title: data.get('title')?.toString().trim() ?? '',
		location_summary: data.get('location_summary')?.toString().trim() ?? '',
		start_date: data.get('start_date')?.toString() ?? '',
		end_date: data.get('end_date')?.toString() ?? '',
		timezone: data.get('timezone')?.toString().trim() ?? ''
	};
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
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
		// starting the SAME trip, so before making a second one, say so. "Create
		// anyway" resubmits with confirm_duplicate=1.
		if (data.get('confirm_duplicate') !== '1') {
			const same = await findSameName(locals.pb, title);
			const mine = same?.mine[0];
			const coTraveler = same?.co_travelers[0];
			if (mine || coTraveler) {
				return fail(409, {
					duplicate: mine
						? { kind: 'mine' as const, ...mine }
						: { kind: 'co_traveler' as const, ...coTraveler!, requested: false, alreadyRequested: false },
					values: formValues(data)
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
			// A PB field rejection is deterministic — name the field, don't say "try again".
			const fields = (err as { response?: { data?: Record<string, { message?: string }> } }).response?.data;
			const field = fields && Object.keys(fields)[0];
			if (field && fields[field]?.message) {
				return fail(400, { error: `${field.replace(/_/g, ' ')}: ${fields[field].message}`, field });
			}
			return fail(500, { error: 'Couldn’t create the trip. Please try again.' });
		}
	},

	// #395 — "Request an invite" from the co-traveler heads-up. Joining someone
	// else's trip is never self-serve: the PB route only notifies its owner and
	// co-owners, and re-validates the co-traveler link itself (trip_id comes from
	// the client). The heads-up stays up, now showing the request as sent.
	requestInvite: async ({ request, locals }) => {
		const data = await request.formData();
		const values = formValues(data);
		const tripId = data.get('trip_id')?.toString() ?? '';
		try {
			const res = await locals.pb.send<{ sent: number; title: string; name: string }>(
				'/api/trips/request-invite',
				{ method: 'POST', body: { trip_id: tripId } }
			);
			return {
				duplicate: {
					kind: 'co_traveler' as const,
					trip_id: tripId,
					title: res.title,
					name: res.name,
					requested: true,
					// An unread request from you is already waiting — not re-sent.
					alreadyRequested: res.sent === 0
				},
				values
			};
		} catch (err) {
			console.error('[trips/new requestInvite] failed:', err);
			return fail(400, { error: 'Couldn’t send that request. Please try again.', values });
		}
	}
};
