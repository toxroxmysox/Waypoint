<script lang="ts">
	// Read-only "who's on this item" sheet (#224, ADR-0011): the people going, then
	// (struck) the people who said they're not going. No answer is never listed.
	// Answering is the item page's job (#440), not this sheet's.
	import BottomSheet from '$lib/ui/BottomSheet.svelte';
	import PersonBubble from '$lib/ui/PersonBubble.svelte';
	import { memberDisplayName } from '$lib/itinerary/member-name';
	import type { TripMember } from '$lib/types';

	type M = TripMember & { avatarUrl?: string };

	let {
		open = $bindable(false),
		itemTitle,
		going,
		notGoing = []
	}: {
		open?: boolean;
		itemTitle: string;
		/** The members going, in `assigned_to` order. */
		going: M[];
		/** The members who said they're not going, in `not_going` order. */
		notGoing?: M[];
	} = $props();
</script>

<BottomSheet bind:open title="Who's on this">
	<p class="text-ink-muted mb-3 text-[12.5px]">{itemTitle}</p>

	<ul class="flex flex-col gap-0.5" aria-label="Going">
		{#each going as m (m.id)}
			<li class="flex items-center gap-3 rounded-[10px] px-2.5 py-2.5">
				<PersonBubble name={memberDisplayName(m)} img={m.avatarUrl} placeholder={!m.user} departed={!!m.removed_at} size={32} />
				<span class="text-ink flex-1 text-sm font-semibold">{memberDisplayName(m)}</span>
			</li>
		{/each}
		{#each notGoing as m (m.id)}
			<li class="flex items-center gap-3 rounded-[10px] px-2.5 py-2.5">
				<PersonBubble name={memberDisplayName(m)} img={m.avatarUrl} notGoing placeholder={!m.user} departed={!!m.removed_at} size={32} />
				<span class="text-ink-muted flex-1 text-sm font-semibold line-through">{memberDisplayName(m)}</span>
				<span class="text-ink-muted text-xs">Not going</span>
			</li>
		{/each}
	</ul>
</BottomSheet>
