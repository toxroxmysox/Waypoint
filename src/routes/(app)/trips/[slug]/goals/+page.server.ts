import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { TripGoal, TripMember } from '$lib/types';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { trip } = await parent();

	// Phase-less, trip-scoped. Ordered by sort_order for now (vote-score ordering
	// lands with goal_votes in #77). created_by is expanded for author avatar/name.
	const goals = await locals.pb.collection('trip_goals').getFullList<TripGoal>({
		filter: `trip = "${trip.id}"`,
		sort: 'sort_order',
		expand: 'created_by.user'
	});

	return { goals };
};

export const actions: Actions = {
	create: async ({ request, locals, params }) => {
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

		const membership = await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}"`);
		if (membership.role === 'viewer') return fail(403, { error: 'Viewers cannot add goals.' });

		const data = await request.formData();
		const title = data.get('title')?.toString().trim();
		const description = data.get('description')?.toString().trim() || '';
		if (!title) return fail(400, { error: 'A goal needs a title.' });

		try {
			// Append to the end of the trip's goal list.
			const existing = await locals.pb.collection('trip_goals').getFullList({
				filter: `trip = "${trip.id}"`,
				sort: '-sort_order',
				fields: 'sort_order'
			});
			const nextOrder = existing.length > 0 ? Number(existing[0]['sort_order']) + 1 : 0;

			const created = await locals.pb.collection('trip_goals').create<TripGoal>({
				trip: trip.id,
				title,
				description,
				created_by: membership.id,
				manual_status: 'unplanned',
				sort_order: nextOrder
			});

			return { success: true, goalId: created.id };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to add goal.';
			return fail(500, { error: message });
		}
	}
};
