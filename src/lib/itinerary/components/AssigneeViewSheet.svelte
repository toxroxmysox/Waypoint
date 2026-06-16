<script lang="ts">
	// Read-only "who's on this item" sheet (#224, ADR-0011). Reuses the
	// AssignMemberSheet row pattern (avatar + name) but is a plain roster view —
	// no radio, no write. Tapping the card's assignee bubbles opens it.
	// Slice 2 (#226) adds the optional "+ Me" / remove-me control via the
	// `selfAssign` snippet, so this sheet stays the single home for assignment.
	import BottomSheet from '$lib/ui/BottomSheet.svelte';
	import Avatar from '$lib/ui/Avatar.svelte';
	import { memberDisplayName, memberInitial } from '$lib/itinerary/member-name';
	import type { TripMember } from '$lib/types';
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		itemTitle,
		assignees,
		selfAssign
	}: {
		open?: boolean;
		itemTitle: string;
		/** The resolved assignee members, in `assigned_to` order. */
		assignees: Array<TripMember & { avatarUrl?: string }>;
		/** #226 hook: optional "+ Me" / remove-me control rendered under the list. */
		selfAssign?: Snippet;
	} = $props();
</script>

<BottomSheet bind:open title="Who's on this">
	<p class="text-ink-muted mb-3 text-[12.5px]">{itemTitle}</p>

	{#if assignees.length > 0}
		<ul class="flex flex-col gap-0.5" aria-label="Assignees">
			{#each assignees as m (m.id)}
				<li class="flex items-center gap-3 rounded-[10px] px-2.5 py-2.5">
					<Avatar
						img={m.avatarUrl}
						initial={memberInitial(m)}
						alt={memberDisplayName(m)}
						placeholder={!m.user}
						departed={!!m.removed_at}
						size={32}
					/>
					<span class="text-ink flex-1 text-sm font-semibold">{memberDisplayName(m)}</span>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-ink-muted px-2.5 py-2 text-sm italic">No one is assigned yet.</p>
	{/if}

	{#if selfAssign}
		<div class="border-line mt-3 border-t pt-3">
			{@render selfAssign()}
		</div>
	{/if}
</BottomSheet>
