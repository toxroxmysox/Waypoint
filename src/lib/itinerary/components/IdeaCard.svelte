<script lang="ts">
	// The idea card (#424; spec §Ideas grouping, D2/D7): title, then a `place · cost`
	// sub-line, then the four tap-to-vote pills (#425). NO type icon: the group
	// heading above carries the type. Navigation is a stretched <a> (a button can't
	// nest in an anchor); the pills and assignee footer ride above it (relative z-10). The host supplies the drag wrapper and any
	// pull-up beside the card.
	import { withOrigin } from '$lib/shell/back-nav';
	import { page } from '$app/state';
	import type { Item, TripMember } from '$lib/types';
	import type { DisplayVote } from '$lib/collaboration/voting';
	import Card from '$lib/ui/Card.svelte';
	import VotePills from '$lib/collaboration/components/VotePills.svelte';
	import AssigneeStacks from '$lib/itinerary/components/AssigneeStacks.svelte';
	import { ideaSub } from '$lib/itinerary/idea-groups';

	let {
		item,
		tripSlug,
		votes = [],
		members = [],
		myMemberId = '',
		canVote = false,
		class: klass = ''
	}: {
		item: Item;
		tripSlug: string;
		votes?: DisplayVote[];
		members?: TripMember[];
		/** The viewer's trip_members.id (their pill is filled). */
		myMemberId?: string;
		/** False for viewers: the pills show counts only. */
		canVote?: boolean;
		class?: string;
	} = $props();

	const sub = $derived(ideaSub(item));
</script>

<Card class="no-callout group-hover:shadow-card-strong group-active:bg-surface-2 {klass}">
	<div class="relative min-h-[44px] px-3 py-2">
		<a
			href={withOrigin(`/trips/${tripSlug}/items/${item.id}`, page.url.pathname)}
			class="absolute inset-0 rounded-lg after:absolute after:inset-0"
			aria-label={item.title}
		></a>
		<p class="text-ink truncate text-sm font-semibold" title={item.title}>{item.title}</p>
		{#if sub}
			<p class="text-ink-muted mt-0.5 truncate text-xs" data-idea-sub>{sub}</p>
		{/if}
		<div class="relative z-10 mt-1.5 w-fit">
			<VotePills
				{votes}
				{members}
				{myMemberId}
				{canVote}
				voteAction="/trips/{tripSlug}/items/{item.id}?/vote"
				unvoteAction="/trips/{tripSlug}/items/{item.id}?/unvote"
			/>
		</div>
	</div>
	<!-- Going bubbles + struck not-going (ADR-0011 / #440) — child of the bordered
	     card (#231); padding on the row collapses it when empty. -->
	<AssigneeStacks itemTitle={item.title} assignedTo={item.assigned_to} notGoing={item.not_going ?? []} {members} size={18} class="relative z-10 mb-2 px-3" />
</Card>
