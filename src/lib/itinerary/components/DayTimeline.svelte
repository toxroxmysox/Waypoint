<script lang="ts">
	import type { Item } from '$lib/types';
	import { buildTimeline, detectOverlaps } from '$lib/itinerary/timeline';
	import TimelineItemCard from './TimelineItemCard.svelte';

	let {
		items,
		tripSlug,
		dayId,
	}: {
		items: Item[];
		tripSlug: string;
		dayId: string;
	} = $props();

	const timeline = $derived(buildTimeline(items));
	const overlaps = $derived(detectOverlaps(items));
</script>

{#if timeline.length === 0}
	<a
		href="/trips/{tripSlug}/items/new?day={dayId}"
		class="border-line text-ink-muted hover:border-ink-muted hover:text-ink-soft block rounded-lg border border-dashed px-3 py-2 text-xs"
	>
		Empty. Tap to add one.
	</a>
{:else}
	<div class="space-y-2">
		{#each timeline as entry}
			{#if entry.kind === 'divider'}
				<div class="flex items-center gap-3 py-1">
					<div class="border-line flex-1 border-t"></div>
					<span class="text-ink-muted text-[11px] font-medium uppercase tracking-wider">{entry.label}</span>
					<div class="border-line flex-1 border-t"></div>
				</div>
			{:else if entry.kind === 'item'}
				<TimelineItemCard
					item={entry.item}
					{tripSlug}
					anchored={entry.anchored}
					overlapping={overlaps.has(entry.item.id)}
					draggable={true}
				/>
			{/if}
		{/each}
	</div>
{/if}
