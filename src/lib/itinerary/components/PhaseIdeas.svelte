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
	import PlanOnDayMenu, { type PlannedIdea } from './PlanOnDayMenu.svelte';
	import type { DayMenuRow } from '$lib/itinerary/phase-logistics';

	let {
		cards,
		tripSlug,
		members = [],
		myMemberId = '',
		canVoteGhosts = false,
		canReviewGhosts = false,
		place = '',
		planRows = [],
		canPlanIds = new Set<string>(),
		onPlanned = () => {}
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
		/** #401 — the phase's days for "On which day?". */
		planRows?: DayMenuRow[];
		/** #401 — ideas this viewer may plan (creator, or owner/co_owner). Never ghosts. */
		canPlanIds?: Set<string>;
		onPlanned?: (p: PlannedIdea) => void;
	} = $props();

	const typeOf = (c: ParkingCard) =>
		c.kind === 'item' ? c.item.type : String(c.suggestion.payload?.type ?? 'activity');
	const scores = $derived(Object.fromEntries(cards.map((c) => [c.id, scoreVotes(c.votes)])));
	const groups = $derived(ideaGroups(cards, typeOf, scores));
	let planningId = $state('');
	let planOpen = $state(false);
</script>

<div class="space-y-3" data-phase-ideas>
	{#each groups as group (group.type)}
		<section class="space-y-1.5" aria-label={group.label}>
			<IdeaGroupHeading type={group.type} />
			{#each group.items as card (card.id)}
				{#if card.kind === 'item'}
					{@const itemId = card.item.id}
					<div data-idea-id={itemId}>
						{#snippet doThis()}
							<button
								type="button"
								onclick={() => ((planningId = itemId), (planOpen = true))}
								class="hit-44 border-moss/30 text-moss hover:bg-moss-tint rounded-full border px-2.5 py-0.5 text-xs font-semibold"
							>
								Do this
							</button>
						{/snippet}
						<IdeaCard
							item={card.item}
							{tripSlug}
							votes={card.votes}
							{members}
							{myMemberId}
							canVote={canVoteGhosts}
							action={canPlanIds.has(itemId) && planRows.length > 0 ? doThis : undefined}
						/>
					</div>
				{:else}
					<!-- #248 — a pending suggestion: dotted, votable, in its type group. -->
					<GhostCard suggestion={card.suggestion} votes={card.votes} {members} {myMemberId} canVote={canVoteGhosts} canReview={canReviewGhosts} {place} />
				{/if}
			{/each}
		</section>
	{/each}
</div>

{#if planRows.length > 0}
	<PlanOnDayMenu itemId={planningId} rows={planRows} bind:open={planOpen} {onPlanned} />
{/if}
