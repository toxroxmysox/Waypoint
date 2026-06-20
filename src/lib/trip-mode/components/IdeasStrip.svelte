<script lang="ts">
	// #245 Door 1 — the inline "ideas for now" strip. Surfaces the CURRENT PHASE's
	// parked ideas (the per-phase parking zone, #87) at a free-time / nothing-else
	// Focus, vote-score ordered, so a fallen-through evening finds a replacement
	// without leaving Trip Mode. #246 reuses this verbatim at a just-skipped gap.
	//
	// Roles (SPEC §4): the strip + read-only vote stacks render for EVERYONE;
	// one-tap Promote shows only for owner/co_owner (`canPromote`) — travelers
	// advocate via their votes (cast on item detail), viewers are inert. Voting is
	// NOT cast here: the strip is a glance + commit affordance, not a vote surface.
	import { enhance } from '$app/forms';
	import type { Item, Vote } from '$lib/types';
	import type { MemberWithAvatar } from '$lib/collaboration/member-avatar';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import VoteStacks from '$lib/collaboration/components/VoteStacks.svelte';
	import VoteCountPill from '$lib/collaboration/components/VoteCountPill.svelte';

	let {
		ideas = [],
		members = [],
		slug = '',
		canPromote = false,
		heading = 'Ideas for now',
		subheading = 'Backup plans from this part of the trip'
	}: {
		/** Current-phase parked ideas, vote-score ordered (loader-supplied). */
		ideas?: { item: Item; score: number; votes: Vote[] }[];
		/** Trip members (with resolved avatars) for the read-only vote stacks. */
		members?: MemberWithAvatar[];
		slug?: string;
		/** True for owner/co_owner — shows the one-tap Promote affordance. */
		canPromote?: boolean;
		heading?: string;
		subheading?: string;
	} = $props();

	// A pending promote keyed by item id → disables just that row's button.
	let promoting = $state<string | null>(null);
</script>

{#if ideas.length > 0}
	<section class="space-y-2" aria-label="Ideas for now">
		<div class="px-1">
			<p class="text-ink-soft text-sm font-semibold">{heading}</p>
			<p class="text-ink-muted text-xs">{subheading}</p>
		</div>

		<ul class="space-y-2">
			{#each ideas as { item, votes } (item.id)}
				<li class="border-line bg-paper rounded-lg border">
					<div class="flex items-start gap-3 px-3 py-2.5">
						<a
							href="/trips/{slug}/items/{item.id}?from=trip"
							class="flex min-w-0 flex-1 items-start gap-3"
						>
							<TypeIcon type={item.type} sub={item.subtype} size={20} />
							<div class="min-w-0 flex-1">
								<p class="text-ink truncate text-sm font-medium" title={item.title}>{item.title}</p>
								{#if item.location_name}
									<p class="text-ink-muted mt-0.5 truncate text-[11px]">{item.location_name}</p>
								{/if}
								{#if votes.length}
									<div class="mt-1.5">
										<VoteStacks {votes} {members} size={18} />
									</div>
								{/if}
							</div>
						</a>

						<div class="flex shrink-0 flex-col items-end gap-2">
							{#if votes.length}
								<VoteCountPill {votes} />
							{/if}
							{#if canPromote}
								<form
									method="POST"
									action="?/promoteIdea"
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
										class="bg-clay text-paper hover:bg-clay/90 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap disabled:opacity-50"
									>
										{promoting === item.id ? 'Adding…' : 'Do this'}
									</button>
								</form>
							{/if}
						</div>
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}
