import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Item, Phase, Day, TripMember } from '$lib/types';
import { rowContent } from '$lib/itinerary/row';

// Booking Smart List (ADR-0003 / PRD §4): a derived, read-only lens — never a
// stored checklist. Rows are projected from Items (planned + requires_booking +
// !booked). Checking a row writes booked=true to the source Item, dropping it
// from the projection. Mirrors the `needsBooking` predicate (unit-tested).


export const load: PageServerLoad = async ({ parent, locals }) => {
	const { trip, phases, days } = await parent();

	const items = await locals.pb.collection('items').getFullList<Item>({
		filter: `trip = "${trip.id}" && status = "planned" && requires_booking = true && booked = false`,
		sort: 'sort_order'
	});

	const rows = items.map((item) => {
		const phaseName = item.phase
			? (phases.find((p: Phase) => p.id === item.phase)?.name ?? '')
			: '';
		const dayDate = item.day ? (days.find((d: Day) => d.id === item.day)?.date ?? '') : '';

		// The Row's sub-line (#433): date · time · place in the text grammar; a
		// flight also hands over its parts so the Row can fit them to its width.
		const { sub, flight } = rowContent(item, { dayDate, phaseName });

		return {
			id: item.id,
			type: item.type,
			subtype: item.subtype,
			title: item.title,
			sub,
			flight
		};
	});

	return { rows };
};

export const actions: Actions = {
	book: async ({ request, params, locals }) => {
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

		const membership = await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}" && removed_at = ""`);
		if (membership.role === 'viewer') return fail(403, { error: 'Viewers cannot book items.' });

		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		if (!itemId) return fail(400, { error: 'Missing item.' });

		try {
			const item = await locals.pb.collection('items').getOne<Item>(itemId);
			if (item.trip !== trip.id) return fail(403, { error: 'Not authorized.' });
			await locals.pb.collection('items').update(itemId, {
				booked: true,
				booked_by: membership.id
			});
			return { success: true };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to mark booked.' });
		}
	}
};
