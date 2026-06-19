import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Phase, Day, Item, TripMember, Suggestion, SuggestionVote } from '$lib/types';
import { nextSortOrder, insertBetween, reorderUpdates } from '$lib/itinerary/sort-order';
import { summarizeDays } from '$lib/itinerary/day-card';
import { withAvatarUrls } from '$lib/collaboration/member-avatar';
import { parkingLotCards } from '$lib/itinerary/parking-lot-cards';

const IDEA_TYPES = ['activity', 'meal', 'lodging', 'transportation', 'flight', 'note'] as const;

// Raw `suggestions` record (the collection stores `author` as a trip_members.id;
// the app-facing Suggestion shape uses `author_id`/`author_name`).
type SuggestionRecord = Omit<Suggestion, 'author_id' | 'author_name' | 'author_role'> & {
	author: string;
};

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
	const [allDays, items, pendingRaw, members] = await Promise.all([
		locals.pb.collection('days').getFullList<Day>({
			filter: `trip = "${trip.id}"`,
			sort: 'date'
		}),
		locals.pb.collection('items').getFullList<Item>({
			filter: `trip = "${trip.id}" && phase = "${phase.id}"`,
			sort: 'sort_order'
		}),
		// #248 — pending suggestions become Ghost Cards. Fetch the trip's pending
		// suggestions; the pure module scopes them to this phase via payload.phase.
		locals.pb.collection('suggestions').getFullList<SuggestionRecord>({
			filter: `trip = "${trip.id}" && status = "pending" && target_type = "new_item"`,
			sort: 'created'
		}),
		locals.pb.collection('trip_members').getFullList<TripMember>({
			filter: `trip = "${trip.id}" && removed_at = ""`,
			expand: 'user'
		})
	]);

	const days = allDays.filter((d) => (d.phases ?? []).includes(phase.id));

	// Same day-card summaries as the overview (#65), from the items already
	// loaded for this phase — count + booked + budget + stay chip, one source.
	const daySummaries = summarizeDays(items, days);

	// Resolve the viewer's own membership (id + role) — drives the ghost vote
	// affordance (viewers read-only; the author can't vote their own).
	const me = members.find((m) => m.user === locals.user?.id);
	const myMemberId = me?.id ?? '';
	const viewerRole = me?.role ?? 'viewer';

	// Hydrate pending suggestions into the app Suggestion shape (author → author_id
	// + resolved name/role) so the pure module + GhostCard read a consistent record.
	const memberById = new Map(members.map((m) => [m.id, m]));
	const pendingSuggestions: Suggestion[] = pendingRaw.map((s) => {
		const author = memberById.get(s.author);
		return {
			...s,
			author_id: s.author,
			author_name: author?.display_name || author?.placeholder_name || '',
			author_role: author?.role ?? 'traveler'
		};
	});

	// Load votes for this phase's pending suggestions (the Ghost Cards' vote stacks).
	const phaseGhostIds = pendingSuggestions
		.filter((s) => (s.payload?.phase as string | undefined) === phase.id)
		.map((s) => s.id);
	const suggestionVotes =
		phaseGhostIds.length > 0
			? await locals.pb.collection('suggestion_votes').getFullList<SuggestionVote>({
					filter: phaseGhostIds.map((id) => `suggestion = "${id}"`).join(' || ')
				})
			: [];
	const votesBySuggestion: Record<string, SuggestionVote[]> = {};
	for (const v of suggestionVotes) (votesBySuggestion[v.suggestion] ??= []).push(v);

	// The single ordered, vote-tagged card list every parking-lot surface renders.
	const parkingCards = parkingLotCards(
		items.filter((it) => it.status === 'unplanned'),
		pendingSuggestions,
		{ phaseId: phase.id, viewerRole, votesBySuggestion }
	);

	return {
		phase,
		phaseDays: days,
		phaseItems: items,
		daySummaries,
		parkingCards,
		members: withAvatarUrls(locals.pb, members),
		myMemberId,
		viewerRole
	};
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
				end_date: endDate + ' 00:00:00.000Z'
			});
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to update phase.';
			return fail(500, { error: message });
		}

		throw redirect(303, `/trips/${params.slug}/phases`);
	},

	// #57 — capture an idea straight into this phase's parking lot: an unplanned,
	// phase-scoped, day-less item. No day is ever required or implied (status =
	// day ? planned : unplanned — here there is no day, so unplanned).
	addIdea: async ({ request, params, locals }) => {
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

		const phase = await locals.pb.collection('phases').getOne<Phase>(params.phaseId);
		if (phase.trip !== trip.id) return fail(404, { ideaError: 'Phase not found.' });

		const membership = await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}" && removed_at = ""`);

		const data = await request.formData();
		const title = data.get('title')?.toString().trim();
		const typeRaw = data.get('type')?.toString() || 'activity';
		const type = (IDEA_TYPES as readonly string[]).includes(typeRaw) ? typeRaw : 'activity';

		if (!title) return fail(400, { ideaError: 'Give the idea a title.' });

		try {
			// Order among this phase's existing ideas (day-less unplanned items).
			const existing = await locals.pb.collection('items').getFullList({
				filter: `trip = "${trip.id}" && phase = "${phase.id}" && status = "unplanned"`,
				fields: 'sort_order'
			});
			const sort_order = nextSortOrder(existing.map((i) => Number(i.sort_order)));

			await locals.pb.collection('items').create({
				trip: trip.id,
				phase: phase.id,
				day: '',
				type,
				title,
				status: 'unplanned',
				requires_booking: type === 'lodging' || type === 'flight' || type === 'transportation',
				sort_order,
				created_by: membership.id
			});
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to add idea.';
			return fail(500, { ideaError: message });
		}

		// Success: no redirect — progressive enhancement re-runs load, so the idea
		// shows in the parking lot immediately on the same screen.
		return { ideaAdded: true };
	},

	// #88 — persist drag-reorder of ideas within THIS phase's parking lot. Phase
	// Detail is the canonical idea-reorder home (#60 left parking→parking visual-
	// only on the day page). Only `sort_order` changes: status, phase, and day are
	// untouched. Neighbor orders come from the client's drop position via
	// neighborsForMove; the action consumes the shared insertBetween/reorderUpdates.
	reorder: async ({ request, params, locals }) => {
		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		if (!itemId) return fail(400, { error: 'Missing item ID.' });

		const beforeRaw = data.get('before_order')?.toString();
		const afterRaw = data.get('after_order')?.toString();
		const before = beforeRaw && !isNaN(Number(beforeRaw)) ? Number(beforeRaw) : null;
		const after = afterRaw && !isNaN(Number(afterRaw)) ? Number(afterRaw) : null;

		try {
			// Guard: only an unplanned, day-less idea in this phase may be reordered
			// here. Anything else (a planned item, another phase) is rejected so a
			// reorder can never quietly re-home an item.
			const moved = await locals.pb.collection('items').getOne<Item>(itemId);
			if (moved.phase !== params.phaseId || moved.status !== 'unplanned' || moved.day !== '') {
				return fail(400, { error: 'Only this phase’s ideas can be reordered.' });
			}

			// Fast path: a gap is available → a single sort_order update.
			const direct = insertBetween(before, after);
			if (direct !== null) {
				await locals.pb.collection('items').update(itemId, { sort_order: direct });
				return { success: true };
			}

			// Gap collapsed → rebalance this phase's unplanned ideas as one block.
			const ideas = await locals.pb.collection('items').getFullList<Item>({
				filter: `phase = "${params.phaseId}" && status = "unplanned" && day = ""`,
				sort: 'sort_order',
				fields: 'id,sort_order'
			});
			const updates = reorderUpdates(
				ideas.map((i) => ({ id: i.id, sort_order: Number(i.sort_order) })),
				itemId,
				before,
				after
			);
			await Promise.all(
				updates.map((u) => locals.pb.collection('items').update(u.id, { sort_order: u.sort_order }))
			);
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to reorder.';
			return fail(500, { error: message });
		}
	},

	// #248 — cast (or change) my vote on a pending Ghost Card. Writes a
	// suggestion_votes row; PB rules (migration 0049) enforce member-only,
	// non-viewer, can't-vote-your-own-suggestion, and self-as-member. An existing
	// vote by this member is updated (change of mind), else a new one is created.
	voteGhost: async ({ request, params, locals }) => {
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

		const data = await request.formData();
		const suggestionId = data.get('suggestion_id')?.toString();
		const value = data.get('value')?.toString();
		if (!suggestionId) return fail(400, { error: 'Missing suggestion.' });
		if (!value || !['love', 'like', 'flexible', 'dislike'].includes(value)) {
			return fail(400, { error: 'Invalid vote.' });
		}

		let membership: TripMember;
		try {
			membership = await locals.pb
				.collection('trip_members')
				.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}" && removed_at = ""`);
		} catch {
			return fail(403, { error: 'Not a member of this trip.' });
		}

		try {
			// Upsert: change an existing vote, else create one. The unique
			// (suggestion, member) index forbids duplicates either way.
			const existing = await locals.pb.collection('suggestion_votes').getFullList({
				filter: `suggestion = "${suggestionId}" && member = "${membership.id}"`,
				fields: 'id'
			});
			if (existing.length > 0) {
				await locals.pb.collection('suggestion_votes').update(existing[0].id, { value });
			} else {
				await locals.pb
					.collection('suggestion_votes')
					.create({ suggestion: suggestionId, member: membership.id, value });
			}
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to vote.';
			return fail(500, { error: message });
		}
	},

	// #248 — clear my vote on a Ghost Card. Deletes my suggestion_votes row; the
	// delete rule is SELF_ONLY (member.user = auth), so I can only clear my own.
	unvoteGhost: async ({ request, locals }) => {
		const data = await request.formData();
		const voteId = data.get('vote_id')?.toString();
		if (!voteId) return fail(400, { error: 'Missing vote.' });
		try {
			await locals.pb.collection('suggestion_votes').delete(voteId);
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to clear vote.';
			return fail(500, { error: message });
		}
	}
};
