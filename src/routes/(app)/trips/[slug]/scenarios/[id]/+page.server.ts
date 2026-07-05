import { fail, redirect, isRedirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { TripMember } from '$lib/types';
import type { Scenario, ScenarioVote, ScenarioPoint, Decision } from '$lib/ideation/types';
import type { Item } from '$lib/itinerary/types';
import { withAvatarUrls } from '$lib/collaboration/member-avatar';
import { formatDateRange } from '$lib/shell/format';
import { nightsBetween, planPromotion, PromotionError } from '$lib/ideation/scenario-planning';
import { promoteScenario } from '$lib/ideation/scenario-promotion.server';

export const load: PageServerLoad = async ({ parent, locals, params }) => {
	const { trip, membership } = await parent();

	let scenario: Scenario;
	try {
		scenario = await locals.pb.collection('scenarios').getOne<Scenario>(params.id, {
			expand: 'champion.user,keystones,fork_of'
		});
	} catch {
		error(404, 'Scenario not found');
	}
	if (scenario.trip !== trip.id) error(404, 'Scenario not found');

	const [votes, points, membersRaw] = await Promise.all([
		locals.pb.collection('scenario_votes').getFullList<ScenarioVote>({
			filter: `scenario = "${scenario.id}"`
		}),
		locals.pb.collection('scenario_points').getFullList<ScenarioPoint>({
			filter: `scenario = "${scenario.id}"`,
			sort: 'created',
			expand: 'member.user'
		}),
		locals.pb.collection('trip_members').getFullList<TripMember>({
			filter: `trip = "${trip.id}" && removed_at = ""`,
			expand: 'user'
		})
	]);
	const members = withAvatarUrls(locals.pb, membersRaw as never);

	const myVote = votes.find((v) => v.member === membership.id) ?? null;
	const champion = scenario.expand?.champion;
	const championName =
		champion?.display_name || champion?.placeholder_name || champion?.expand?.user?.name || 'Someone';

	const isChampion = scenario.champion === membership.id;
	const isOwnerTier = membership.role === 'owner' || membership.role === 'co_owner';
	const canWeigh = membership.role !== 'viewer';
	const hasDates = !!(scenario.date_start && scenario.date_end);

	return {
		scenario: {
			id: scenario.id,
			title: scenario.title,
			pitch: scenario.pitch || '',
			championName,
			forkOfTitle: scenario.expand?.fork_of?.title || '',
			forkOfId: scenario.fork_of || '',
			status: scenario.status,
			dateRange: hasDates ? formatDateRange(scenario.date_start, scenario.date_end) : '',
			nights: hasDates ? nightsBetween(scenario.date_start, scenario.date_end) : 0,
			hasDates,
			budgetPerPerson: scenario.budget_per_person > 0 ? scenario.budget_per_person : 0,
			sketch: Array.isArray(scenario.phase_sketch) ? scenario.phase_sketch : [],
			keystoneLabels: (scenario.expand?.keystones ?? []).map((k: Item) => k.title)
		},
		votes: votes.map((v) => ({ id: v.id, member: v.member, value: v.value })),
		myVote: myVote ? { id: myVote.id, value: myVote.value } : null,
		points: points.map((p) => ({
			id: p.id,
			member: p.member,
			kind: p.kind,
			text: p.text,
			authorName:
				p.expand?.member?.display_name ||
				p.expand?.member?.placeholder_name ||
				p.expand?.member?.expand?.user?.name ||
				'Someone',
			mine: p.member === membership.id
		})),
		members,
		perms: { isChampion, isOwnerTier, canWeigh, canPromote: isOwnerTier && hasDates }
	};
};

// Resolve the trip + caller's active membership + the scenario, all trip-scoped.
async function resolve(locals: App.Locals, slug: string, id: string) {
	const trip = await locals.pb
		.collection('trips')
		.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug }));
	const membership = await locals.pb
		.collection('trip_members')
		.getFirstListItem<TripMember>(
			`trip = "${trip.id}" && user = "${locals.user!.id}" && removed_at = ""`
		);
	const scenario = await locals.pb.collection('scenarios').getOne<Scenario>(id);
	if (scenario.trip !== trip.id) throw error(404, 'Scenario not found');
	return { trip, membership, scenario };
}

export const actions: Actions = {
	// Upsert the caller's vote (unique (scenario, member) → a re-vote is an update).
	vote: async ({ request, params, locals }) => {
		try {
			const { membership, scenario } = await resolve(locals, params.slug, params.id);
			if (membership.role === 'viewer') return fail(403, { error: 'Viewers can’t vote.' });
			const value = request ? (await request.formData()).get('value')?.toString() || '' : '';
			if (!['love', 'like', 'flexible', 'dislike'].includes(value)) {
				return fail(400, { error: 'Pick a vote.' });
			}
			const existing = await locals.pb
				.collection('scenario_votes')
				.getFirstListItem<ScenarioVote>(`scenario = "${scenario.id}" && member = "${membership.id}"`)
				.catch(() => null);
			if (existing) {
				await locals.pb.collection('scenario_votes').update(existing.id, { value });
			} else {
				await locals.pb
					.collection('scenario_votes')
					.create({ scenario: scenario.id, member: membership.id, value });
			}
			return { voted: true };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to vote.' });
		}
	},

	unvote: async ({ params, locals }) => {
		try {
			const { membership, scenario } = await resolve(locals, params.slug, params.id);
			const existing = await locals.pb
				.collection('scenario_votes')
				.getFirstListItem<ScenarioVote>(`scenario = "${scenario.id}" && member = "${membership.id}"`)
				.catch(() => null);
			if (existing) await locals.pb.collection('scenario_votes').delete(existing.id);
			return { voted: true };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to clear the vote.' });
		}
	},

	addPoint: async ({ request, params, locals }) => {
		try {
			const { membership, scenario } = await resolve(locals, params.slug, params.id);
			if (membership.role === 'viewer') return fail(403, { error: 'Viewers can’t add points.' });
			const data = await request.formData();
			const kind = data.get('kind')?.toString() || '';
			const text = data.get('text')?.toString().trim() || '';
			if (kind !== 'pro' && kind !== 'con') return fail(400, { error: 'Pro or con?' });
			if (!text) return fail(400, { error: 'Say something first.' });
			if (text.length > 200) return fail(400, { error: 'Keep it under 200 characters.' });
			await locals.pb
				.collection('scenario_points')
				.create({ scenario: scenario.id, member: membership.id, kind, text });
			return { pointAdded: true };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to add.' });
		}
	},

	deletePoint: async ({ request, params, locals }) => {
		try {
			await resolve(locals, params.slug, params.id);
			const pointId = (await request.formData()).get('point_id')?.toString() || '';
			if (pointId) await locals.pb.collection('scenario_points').delete(pointId);
			return { pointDeleted: true };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to delete.' });
		}
	},

	// Champion-only delete (scenarios.pb.js re-enforces). Redirects home.
	deleteScenario: async ({ params, locals }) => {
		try {
			const { scenario } = await resolve(locals, params.slug, params.id);
			await locals.pb.collection('scenarios').delete(scenario.id);
		} catch (err: unknown) {
			if (isRedirect(err)) throw err;
			return fail(403, { error: err instanceof Error ? err.message : 'Only the champion can delete this.' });
		}
		redirect(303, `/trips/${params.slug}`);
	},

	// Owner/co_owner "Go with this one" — the promotion cascade (M5).
	promote: async ({ params, locals }) => {
		try {
			const { trip, membership, scenario } = await resolve(locals, params.slug, params.id);
			if (membership.role !== 'owner' && membership.role !== 'co_owner') {
				return fail(403, { error: 'Only an owner or co-owner can choose a scenario.' });
			}
			// Gate: both dates (planPromotion throws a PromotionError otherwise). The
			// server-side cascade re-checks, but failing fast here gives a clean message.
			try {
				planPromotion(scenario);
			} catch (e) {
				if (e instanceof PromotionError) return fail(400, { error: e.message });
				throw e;
			}
			await promoteScenario(locals.pb, trip.id, scenario.id);
		} catch (err: unknown) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to promote.' });
		}
		// Promoted → the trip is dated; home is the normal overview now.
		redirect(303, `/trips/${params.slug}`);
	}
};
