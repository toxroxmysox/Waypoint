<script lang="ts">
	// Phase Detail's parking list (#424; spec §Ideas grouping): the phase's ideas
	// (real items and pending Ghost Cards) under type headings, Lodging · Flights ·
	// Transportation · Activities · Meals · Notes, each group sorted by the weighted
	// vote score. Idea cards carry no type icon. No drag here: dragging among ideas
	// changes nothing (drag only plans), and Phase Detail has no day to drop on.
	// Replaces PhaseParkingReorder (#88).
	import type { Card as ParkingCard } from '$lib/itinerary/parking-lot-cards';
	import type { MemberWithAvatar } from '$lib/collaboration/member-avatar';
	import { scoreVotes } from '$lib/collaboration/voting';
	import IdeaCard from './IdeaCard.svelte';
	import IdeaGroupHeading from './IdeaGroupHeading.svelte';
	import GhostCard from './GhostCard.svelte';
	import { ideaGroups } from '$lib/itinerary/idea-groups';

	let {
		cards,
		tripSlug,
		members = [],
		myMemberId = '',
		canVoteGhosts = false,
		canReviewGhosts = false,
		place = ''
	}: {
		/** The merged, vote-tagged cards from `parkingLotCards` (items + ghosts). */
		cards: ParkingCard[];
		tripSlug: string;
		members?: MemberWithAvatar[];
		myMemberId?: string;
		canVoteGhosts?: boolean;
		canReviewGhosts?: boolean;
		/** The trip's place, for a ghost's "What is this?" search (#406). */
		place?: string;
	} = $props();

	const typeOf = (c: ParkingCard) =>
		c.kind === 'item' ? c.item.type : String(c.suggestion.payload?.type ?? 'activity');
	const scores = $derived(Object.fromEntries(cards.map((c) => [c.id, scoreVotes(c.votes)])));
	const groups = $derived(ideaGroups(cards, typeOf, scores));
</script>

<div class="space-y-3" data-phase-ideas>
	{#each groups as group (group.type)}
		<section class="space-y-1.5" aria-label={group.label}>
			<IdeaGroupHeading type={group.type} />
			{#each group.items as card (card.id)}
				{#if card.kind === 'item'}
					<IdeaCard item={card.item} {tripSlug} votes={card.votes} {members} {myMemberId} canVote={canVoteGhosts} />
				{:else}
					<!-- #248 — a pending suggestion: dotted, votable, in its type group. -->
					<GhostCard suggestion={card.suggestion} votes={card.votes} {members} {myMemberId} canVote={canVoteGhosts} canReview={canReviewGhosts} {place} />
				{/if}
			{/each}
		</section>
	{/each}
</div>
