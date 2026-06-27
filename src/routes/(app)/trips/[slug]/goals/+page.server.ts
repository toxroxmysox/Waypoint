import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { TripGoal, TripMember, GoalVote, Item, Phase, Vote } from '$lib/types';
import { withAvatarUrls } from '$lib/collaboration/member-avatar';
import { firstVotablePhase } from '$lib/collaboration/swipe-deck';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { trip, membership, phases } = await parent();

	// Swipe-deck launch-card data (#207). Mirrors the Phases-tab card: how many
	// items the member hasn't rated, and the first phase (in order) with unrated
	// cards to kick the deck off from. Goals is a contribution surface a
	// contributor actually visits, so the deck gets an additional door here.
	const deckItems = await locals.pb.collection('items').getFullList<Item>({
		filter: `trip = "${trip.id}" && (status = "planned" || status = "unplanned")`,
		fields: 'id,phase,status'
	});
	const myVotes = await locals.pb.collection('votes').getFullList<Vote>({
		filter: `trip = "${trip.id}" && member = "${membership.id}"`,
		fields: 'item'
	});

	// First phase with unrated cards + the count — shared with the overview's
	// adaptive CTA (#275). The PB filter above already scopes to planned|unplanned;
	// the helper re-checks status so it stays correct for any caller.
	const { phaseId: launchPhaseId, unratedTotal } = firstVotablePhase(
		deckItems,
		myVotes,
		(phases as Phase[]).map((p) => p.id)
	);

	// Phase-less, trip-scoped. created_by is expanded for author avatar/name.
	const goals = await locals.pb.collection('trip_goals').getFullList<TripGoal>({
		filter: `trip = "${trip.id}"`,
		sort: 'sort_order',
		expand: 'created_by.user'
	});

	const goalIds = goals.map((g) => g.id);
	const [goalVotes, members] = await Promise.all([
		goalIds.length > 0
			? locals.pb.collection('goal_votes').getFullList<GoalVote>({
					filter: goalIds.map((id) => `goal = "${id}"`).join(' || ')
				})
			: Promise.resolve([] as GoalVote[]),
		locals.pb.collection('trip_members').getFullList<TripMember>({
			filter: `trip = "${trip.id}" && removed_at = ""`,
			expand: 'user'
		})
	]);

	const votesByGoal: Record<string, GoalVote[]> = {};
	for (const v of goalVotes) (votesByGoal[v.goal] ??= []).push(v);

	// #77 — rank the Goals tab by ATTENTION: vote quantity (not weighted score)
	// desc, ties and zero-vote goals by creation time oldest-first (Resolution 8).
	const sortedGoals = [...goals].sort((a, b) => {
		const diff = (votesByGoal[b.id]?.length ?? 0) - (votesByGoal[a.id]?.length ?? 0);
		if (diff !== 0) return diff;
		return (a.created ?? '').localeCompare(b.created ?? '');
	});

	return {
		goals: sortedGoals,
		votesByGoal,
		members: withAvatarUrls(locals.pb, members),
		unratedTotal,
		launchPhaseId
	};
};

export const actions: Actions = {
	create: async ({ request, locals, params }) => {
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

		const membership = await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}" && removed_at = ""`);
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
