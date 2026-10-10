<script lang="ts">
	// #245 Door 1 — the inline "ideas for now" strip. Surfaces the CURRENT PHASE's
	// parked ideas (the per-phase parking zone, #87) at a free-time / nothing-else
	// Focus so a fallen-through evening finds a replacement without leaving Trip
	// Mode. #246 reuses this verbatim at a just-skipped gap.
	//
	// #432 (spec: "Trip mode's Ideas for now", approved 2026-10-06): the same grouped
	// idea cards as the day page's Parking Lot — type headings (Lodging · Flights ·
	// Transportation · Activities · Meals · Notes), `IdeaCard` with tap-to-vote pills,
	// sorted by the weighted vote score inside each group. Not forked: this reuses
	// `ideaGroups`, `IdeaGroupHeading` and `IdeaCard`.
	//
	// Roles (SPEC §4): the strip renders for EVERYONE; travelers and owners cast
	// votes on the pills, viewers see counts only (`canVote`). "Do this" (Light
	// Replanning, one-tap Promote) is a quiet outlined pill (Scott, 2026-10-10) and shows only for
	// owner/co_owner (`canPromote`).
	import { enhance } from '$app/forms';
	import type { Item, Vote } from '$lib/types';
	import type { MemberWithAvatar } from '$lib/collaboration/member-avatar';
	import IdeaCard from '$lib/itinerary/components/IdeaCard.svelte';
	import IdeaGroupHeading from '$lib/itinerary/components/IdeaGroupHeading.svelte';
	import { ideaGroups, ideaScores } from '$lib/itinerary/idea-groups';

	let {
		ideas = [],
		members = [],
		slug = '',
		canPromote = false,
		myMemberId = '',
		canVote = false,
		heading = 'Ideas for now',
		subheading = 'Backup plans from this part of the trip',
		collapsible = false,
		open = false
	}: {
		/** Current-phase parked ideas (loader-supplied). */
		ideas?: { item: Item; score: number; votes: Vote[] }[];
		/** Trip members (with resolved avatars) for the vote tooltips + assignee bubbles. */
		members?: MemberWithAvatar[];
		slug?: string;
		/** True for owner/co_owner — shows the one-tap "Do this" affordance. */
		canPromote?: boolean;
		/** The viewer's trip_members.id (their vote pill is filled). */
		myMemberId?: string;
		/** False for viewers: the pills show counts only. */
		canVote?: boolean;
		heading?: string;
		subheading?: string;
		/** Phone Now (Scott 2026-10-10): a tap-to-expand row under today's timeline,
		 *  so the next thing in the day is never below a scroll of ideas. */
		collapsible?: boolean;
		/** Starts expanded (Door 2: a just-skipped slot to refill). */
		open?: boolean;
	} = $props();

	// A pending promote keyed by item id → disables just that row's button.
	let promoting = $state<string | null>(null);

	const votesById = $derived(Object.fromEntries(ideas.map((i) => [i.item.id, i.votes])));
	const groups = $derived(
		ideaGroups(
			ideas.map((i) => i.item),
			(it) => it.type,
			ideaScores(votesById)
		)
	);
</script>

{#if ideas.length > 0}
	<section class="space-y-2" aria-label="Ideas for now">
		{#if collapsible}
			<details class="group" {open}>
				<summary
					class="border-line bg-surface flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border px-4 py-2.5 [&::-webkit-details-marker]:hidden"
					data-ideas-toggle
				>
					<span>
						<span class="text-ink-soft block text-sm font-semibold">{heading} · <span class="font-mono">{ideas.length}</span></span>
						<span class="text-ink-muted block text-xs">{subheading}</span>
					</span>
					<svg class="text-ink-muted shrink-0 transition-transform group-open:rotate-180" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
				</summary>
				<div class="mt-3">{@render body()}</div>
			</details>
		{:else}
			<div class="px-1">
				<p class="text-ink-soft text-sm font-semibold">{heading}</p>
				<p class="text-ink-muted text-xs">{subheading}</p>
			</div>
			{@render body()}
		{/if}
	</section>
{/if}

{#snippet body()}
		<div class="space-y-3">
			{#each groups as group (group.type)}
				<section class="space-y-1.5" aria-label={group.label}>
					<IdeaGroupHeading type={group.type} />
					{#each group.items as item (item.id)}
						<div class="flex items-center gap-2">
							<div class="min-w-0 flex-1">
								<IdeaCard {item} tripSlug={slug} votes={votesById[item.id] ?? []} {members} {myMemberId} {canVote} />
							</div>
							{#if canPromote}
								<form
									method="POST"
									action="?/promoteIdea"
									class="shrink-0"
									use:enhance={() => {
										promoting = item.id;
										return async ({ update }) => {
											// reset:false re-runs load() (ideas/feed re-derive) WITHOUT
											// remounting the page — never window.location.reload (wipes $state).
											await update({ reset: false });
											promoting = null;
										};
									}}
								>
									<input type="hidden" name="item_id" value={item.id} />
									<button
										type="submit"
										disabled={promoting === item.id}
										class="border-line bg-surface text-ink hover:bg-surface-2 active:bg-surface-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-4 text-xs font-semibold whitespace-nowrap disabled:opacity-40"
									>
										{promoting === item.id ? 'Adding…' : 'Do this'}
									</button>
								</form>
							{/if}
						</div>
					{/each}
				</section>
			{/each}
		</div>
{/snippet}
