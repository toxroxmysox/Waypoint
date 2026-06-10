import type { PageServerLoad } from './$types';
import type { Item, Phase, Vote, TripMember } from '$lib/types';
import { scoreVotes, sortByVoteScore } from '$lib/collaboration/voting';
import { withAvatarUrls } from '$lib/collaboration/member-avatar';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { trip, phases } = await parent();

	const items = await locals.pb.collection('items').getFullList<Item>({
		filter: `trip = "${trip.id}" && status = "unplanned"`,
		sort: 'sort_order'
	});

	const itemIds = items.map((i) => i.id);
	const [votes, members] = await Promise.all([
		itemIds.length > 0
			? locals.pb.collection('votes').getFullList<Vote>({
					filter: itemIds.map((id) => `item = "${id}"`).join(' || ')
				})
			: Promise.resolve([] as Vote[]),
		locals.pb.collection('trip_members').getFullList<TripMember>({
			filter: `trip = "${trip.id}"`,
			expand: 'user'
		})
	]);

	// Group votes by item, then sort by aggregate weighted score (sort_order tiebreak).
	const votesByItem: Record<string, Vote[]> = {};
	for (const v of votes) (votesByItem[v.item] ??= []).push(v);

	const scoreByItem: Record<string, number> = {};
	for (const id of itemIds) scoreByItem[id] = scoreVotes(votesByItem[id] ?? []);

	const sortedItems = sortByVoteScore(items, scoreByItem);

	return {
		parkingLotItems: sortedItems,
		votesByItem,
		members: withAvatarUrls(locals.pb, members),
		phases: phases as Phase[]
	};
};
