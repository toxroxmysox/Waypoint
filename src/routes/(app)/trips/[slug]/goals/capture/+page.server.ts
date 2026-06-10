import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { TripGoal, GoalVote, TripMember } from '$lib/types';
import { VOTE_OPTIONS, type VoteValue } from '$lib/collaboration/voting';
import { buildCaptureDeck, type ReactionCandidate } from '$lib/collaboration/swipe-deck';
import { buildGoalPrompts } from '$lib/itinerary/goal-prompts';

/** Fisher–Yates — prompts are "shown once per session, shuffled" (per page load). */
function shuffle<T>(arr: T[]): T[] {
	const out = [...arr];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

export type WizardCard =
	| { id: string; kind: 'reaction'; goal: TripGoal }
	| { id: string; kind: 'prompt'; promptId: string; text: string };

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { trip, membership } = await parent();

	// All trip goals (author expanded for the reaction-card byline).
	const goals = await locals.pb.collection('trip_goals').getFullList<TripGoal>({
		filter: `trip = "${trip.id}"`,
		sort: 'created',
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
			filter: `trip = "${trip.id}"`
		})
	]);

	// All-members vote counts + my votes (the unvoted filter) + peek stacks.
	const voteCountByGoal: Record<string, number> = {};
	const votesByGoal: Record<string, GoalVote[]> = {};
	const myVotedGoals = new Set<string>();
	for (const v of goalVotes) {
		voteCountByGoal[v.goal] = (voteCountByGoal[v.goal] ?? 0) + 1;
		(votesByGoal[v.goal] ??= []).push(v);
		if (v.member === membership.id) myVotedGoals.add(v.goal);
	}

	// Reaction eligibility: a goal I didn't create and haven't voted on yet.
	const reactions: ReactionCandidate[] = goals
		.filter((g) => g.created_by !== membership.id && !myVotedGoals.has(g.id))
		.map((g) => ({ id: g.id, voteCount: voteCountByGoal[g.id] ?? 0, created: g.created }));

	// Curated prompts, location-injected (→ generic when blank), shuffled per session.
	const prompts = shuffle(buildGoalPrompts(trip.location_summary, trip.countries));
	const promptText = new Map(prompts.map((p) => [p.id, p.text]));

	const plan = buildCaptureDeck(reactions, prompts.map((p) => p.id));
	const goalById = new Map(goals.map((g) => [g.id, g]));

	const cards: WizardCard[] = plan.map((c) =>
		c.kind === 'reaction'
			? { id: c.id, kind: 'reaction', goal: goalById.get(c.id)! }
			: { id: `prompt:${c.id}`, kind: 'prompt', promptId: c.id, text: promptText.get(c.id) ?? '' }
	);

	return { cards, votesByGoal, members };
};

export const actions: Actions = {
	// Per-add goal persistence (Resolution 4): a typed goal becomes a trip_goal
	// immediately, authored by the caller. Mirrors the Goals-tab create action.
	addGoal: async ({ request, locals, params }) => {
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

		const membership = await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}"`);
		if (membership.role === 'viewer') return fail(403, { error: 'Viewers cannot add goals.' });

		const data = await request.formData();
		const title = data.get('title')?.toString().trim();
		if (!title) return fail(400, { error: 'A goal needs a title.' });

		try {
			const existing = await locals.pb.collection('trip_goals').getFullList({
				filter: `trip = "${trip.id}"`,
				sort: '-sort_order',
				fields: 'sort_order'
			});
			const nextOrder = existing.length > 0 ? Number(existing[0]['sort_order']) + 1 : 0;

			const created = await locals.pb.collection('trip_goals').create<TripGoal>({
				trip: trip.id,
				title,
				description: '',
				created_by: membership.id,
				manual_status: 'unplanned',
				sort_order: nextOrder
			});
			return { success: true, goalId: created.id };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to add goal.';
			return fail(500, { error: message });
		}
	},

	// Rewind across a created goal DELETES it (Resolution 4 — allowed: creator +
	// zero votes; PB rules enforce). Deleted by id, optimistically client-tracked.
	deleteGoal: async ({ request, locals }) => {
		const data = await request.formData();
		// Comma-separated: rewinding one prompt card can undo several goals at once.
		const ids = (data.get('goals')?.toString() ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		if (ids.length === 0) return fail(400, { error: 'Missing goal.' });
		try {
			for (const id of ids) await locals.pb.collection('trip_goals').delete(id);
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to undo goal.';
			return fail(400, { error: message });
		}
	},

	// Reaction-card vote → goal_votes (parallel to the harvest deck's votes write).
	// Reaction cards only ever surface unvoted goals, so this creates; upsert anyway.
	vote: async ({ request, locals }) => {
		const data = await request.formData();
		const goalId = data.get('goal')?.toString() ?? '';
		const value = data.get('value')?.toString() ?? '';
		if (!VOTE_OPTIONS.includes(value as VoteValue)) return fail(400, { error: 'Invalid vote.' });

		try {
			const goal = await locals.pb.collection('trip_goals').getOne<TripGoal>(goalId);
			const membership = await locals.pb
				.collection('trip_members')
				.getFirstListItem<TripMember>(`trip = "${goal.trip}" && user = "${locals.user!.id}"`);

			const existing = await locals.pb
				.collection('goal_votes')
				.getFirstListItem<GoalVote>(`goal = "${goal.id}" && member = "${membership.id}"`)
				.catch(() => null);

			if (existing) {
				await locals.pb.collection('goal_votes').update(existing.id, { value });
			} else {
				await locals.pb
					.collection('goal_votes')
					.create({ goal: goal.id, member: membership.id, value });
			}
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to vote.';
			return fail(400, { error: message });
		}
	},

	// Rewind a reaction vote — delete the caller's goal_vote (by goal + member).
	unvote: async ({ request, locals }) => {
		const data = await request.formData();
		const goalId = data.get('goal')?.toString() ?? '';
		if (!goalId) return fail(400, { error: 'Missing goal.' });
		try {
			const goal = await locals.pb.collection('trip_goals').getOne<TripGoal>(goalId);
			const membership = await locals.pb
				.collection('trip_members')
				.getFirstListItem<TripMember>(`trip = "${goal.trip}" && user = "${locals.user!.id}"`);
			const existing = await locals.pb
				.collection('goal_votes')
				.getFirstListItem<GoalVote>(`goal = "${goal.id}" && member = "${membership.id}"`)
				.catch(() => null);
			if (existing) await locals.pb.collection('goal_votes').delete(existing.id);
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to remove vote.';
			return fail(400, { error: message });
		}
	}
};
