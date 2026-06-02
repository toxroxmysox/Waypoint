<script lang="ts">
	import type { Item } from '$lib/types';
	import { buildTimeline, detectOverlaps } from '$lib/itinerary/timeline';
	import TimelineItemCard from './TimelineItemCard.svelte';

	let {
		items,
		tripSlug,
		dayId,
		draggedItemId = null,
		onDragStart = () => {},
		onDragOver = () => {},
		onDropTimeline = () => {},
		onDragEnd = () => {},
	}: {
		items: Item[];
		tripSlug: string;
		dayId: string;
		draggedItemId?: string | null;
		onDragStart?: (itemId: string) => void;
		onDragOver?: (before: number | null, after: number | null) => void;
		onDropTimeline?: () => void;
		onDragEnd?: () => void;
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
		{#each timeline as entry, i}
			{#if entry.kind === 'divider'}
				<div class="flex items-center gap-3 py-1">
					<div class="border-line flex-1 border-t"></div>
					<span class="text-ink-muted text-[11px] font-medium uppercase tracking-wider">{entry.label}</span>
					<div class="border-line flex-1 border-t"></div>
				</div>
			{:else if entry.kind === 'item'}
				{@const prevEntry = i > 0 ? timeline[i - 1] : null}
				{@const prevOrder = prevEntry?.kind === 'item' ? prevEntry.item.sort_order : null}
				<!-- Drop zone before this item (only when dragging an untimed item) -->
				{#if draggedItemId && !entry.anchored}
					<div
						class="rounded transition-all"
						class:h-1={draggedItemId === entry.item.id}
						class:h-8={draggedItemId !== entry.item.id}
						class:bg-moss-tint={draggedItemId !== entry.item.id}
						role="none"
						ondragover={(e) => { e.preventDefault(); onDragOver(prevOrder, entry.item.sort_order); }}
						ondrop={() => onDropTimeline()}
					></div>
				{/if}
				<div
					role="listitem"
					draggable={!entry.anchored}
					ondragstart={() => !entry.anchored && onDragStart(entry.item.id)}
					ondragend={() => onDragEnd()}
					class:opacity-50={draggedItemId === entry.item.id}
				>
					<TimelineItemCard
						item={entry.item}
						{tripSlug}
						anchored={entry.anchored}
						overlapping={overlaps.has(entry.item.id)}
						draggable={!entry.anchored}
					/>
				</div>
			{/if}
		{/each}

		<!-- Drop zone after last item -->
		{#if draggedItemId}
			{@const lastItem = [...timeline].reverse().find(e => e.kind === 'item' && !e.anchored)}
			{#if lastItem?.kind === 'item'}
				<div
					class="h-8 rounded bg-moss-tint transition-all"
					role="none"
					ondragover={(e) => { e.preventDefault(); onDragOver(lastItem.item.sort_order, null); }}
					ondrop={() => onDropTimeline()}
				></div>
			{/if}
		{/if}
	</div>
{/if}
