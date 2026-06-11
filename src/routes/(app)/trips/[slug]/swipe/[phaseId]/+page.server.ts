import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Item, Phase, Day, Vote, TripMember } from '$lib/types';
import { VOTE_OPTIONS, type VoteValue } from '$lib/collaboration/voting';
import { buildDeck, type DeckCandidate } from '$lib/collaboration/swipe-deck';
import { withAvatarUrls } from '$lib/collaboration/member-avatar';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { trip, membership, phases, days } = await parent();

	const phase = (phases as Phase[]).find((p) => p.id === params.phaseId);
	if (!phase) error(404, 'Phase not found');

	// Trip-wide eligible items (the builder scopes to this phase but needs the
	// whole trip to compute the next-phase hand-off). planned|unplanned only —
	// done/considered are closeout-only.
	const items = await locals.pb.collection('items').getFullList<Item>({
		filter: `trip = "${trip.id}" && (status = "planned" || status = "unplanned")`,
		sort: 'created'
	});

	const itemIds = items.map((i) => i.id);
	const [allVotes, members] = await Promise.all([
		itemIds.length > 0
			? locals.pb.collection('votes').getFullList<Vote>({
					filter: itemIds.map((id) => `item = "${id}"`).join(' || ')
				})
			: Promise.resolve([] as Vote[]),
		locals.pb.collection('trip_members').getFullList<TripMember>({
			filter: `trip = "${trip.id}" && removed_at = ""`,
			expand: 'user'
		})
	]);

	// Vote counts (all members) + my votes (the unvoted filter).
	const voteCountByItem: Record<string, number> = {};
	const votesByItem: Record<string, Vote[]> = {};
	const myVotes: { item: string }[] = [];
	for (const v of allVotes) {
		voteCountByItem[v.item] = (voteCountByItem[v.item] ?? 0) + 1;
		(votesByItem[v.item] ??= []).push(v);
		if (v.member === membership.id) myVotes.push({ item: v.item });
	}

	// Owning day's date for itinerary-ordering the planned head (#120). "" when
	// the item has no day (PB stores empty, never null) → sorts after dated days.
	const dateByDay: Record<string, string> = {};
	for (const d of days as Day[]) dateByDay[d.id] = d.date;

	const candidates: DeckCandidate[] = items.map((i) => ({
		id: i.id,
		phase: i.phase,
		status: i.status,
		created: i.created,
		voteCount: voteCountByItem[i.id] ?? 0,
		dayDate: dateByDay[i.day] ?? '',
		start_time: i.start_time,
		sort_order: i.sort_order
	}));

	const phaseOrder = (phases as Phase[]).map((p) => p.id);
	const { queue, nextPhaseId } = buildDeck(candidates, myVotes, {
		phaseId: params.phaseId,
		phaseOrder
	});

	// Map ordered candidate ids back to full items for the card face.
	const byId = new Map(items.map((i) => [i.id, i]));
	const cards = queue.map((c) => byId.get(c.id)!).filter(Boolean);

	// Day labels for the card ("Day 3 · Wed" or null). Days are trip-ordered.
	const sortedDays = (days as Day[]).slice().sort((a, b) => a.date.localeCompare(b.date));
	const dayLabel: Record<string, string> = {};
	sortedDays.forEach((d, n) => {
		const wd = new Date(d.date.replace(' ', 'T')).toLocaleDateString('en-US', {
			weekday: 'short',
			timeZone: 'UTC'
		});
		dayLabel[d.id] = `Day ${n + 1} · ${wd}`;
	});

	// created_by (user id) → member initial, for "added by".
	const initialByUser: Record<string, string> = {};
	for (const m of members) {
		const name = m.display_name || m.placeholder_name || '?';
		if (m.user) initialByUser[m.user] = name.slice(0, 1).toUpperCase();
	}

	const nextPhase = nextPhaseId
		? { id: nextPhaseId, name: (phases as Phase[]).find((p) => p.id === nextPhaseId)?.name ?? '' }
		: null;

	return {
		trip,
		phase,
		cards,
		votesByItem,
		members: withAvatarUrls(locals.pb, members),
		dayLabel,
		initialByUser,
		nextPhase,
		// Phase Detail is the parking-lot home (#86 retired the trip-wide page);
		// the button label says "phase parking lot", so point at this phase.
		parkingLotHref: `/trips/${trip.slug}/phases/${phase.id}`
	};
};

export const actions: Actions = {
	// Upsert the caller's vote on an item — mirrors the item-detail vote action so
	// the deck writes the same `votes` records (one source of truth).
	vote: async ({ request, locals }) => {
		const data = await request.formData();
		const itemId = data.get('item')?.toString() ?? '';
		const value = data.get('value')?.toString() ?? '';
		if (!VOTE_OPTIONS.includes(value as VoteValue)) return fail(400, { error: 'Invalid vote.' });

		try {
			const item = await locals.pb.collection('items').getOne<Item>(itemId);
			const membership = await locals.pb
				.collection('trip_members')
				.getFirstListItem<TripMember>(`trip = "${item.trip}" && user = "${locals.user!.id}" && removed_at = ""`);

			const existing = await locals.pb
				.collection('votes')
				.getFirstListItem<Vote>(`item = "${item.id}" && member = "${membership.id}"`)
				.catch(() => null);

			if (existing) {
				await locals.pb.collection('votes').update(existing.id, { value });
			} else {
				await locals.pb
					.collection('votes')
					.create({ trip: item.trip, item: item.id, member: membership.id, value });
			}
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to vote.';
			return fail(400, { error: message });
		}
	},

	// Rewind — delete the caller's vote on an item (by item, not vote id, since the
	// deck advances optimistically and never tracks the created id client-side).
	unvote: async ({ request, locals }) => {
		const data = await request.formData();
		const itemId = data.get('item')?.toString() ?? '';
		if (!itemId) return fail(400, { error: 'Missing item.' });

		try {
			const item = await locals.pb.collection('items').getOne<Item>(itemId);
			const membership = await locals.pb
				.collection('trip_members')
				.getFirstListItem<TripMember>(`trip = "${item.trip}" && user = "${locals.user!.id}" && removed_at = ""`);
			const existing = await locals.pb
				.collection('votes')
				.getFirstListItem<Vote>(`item = "${item.id}" && member = "${membership.id}"`)
				.catch(() => null);
			if (existing) await locals.pb.collection('votes').delete(existing.id);
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to remove vote.';
			return fail(400, { error: message });
		}
	}
};
