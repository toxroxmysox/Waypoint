<script lang="ts">
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import type { Item, Vote, TripMember } from '$lib/types';
	import { buildTimelineFlat, detectOverlaps } from '$lib/itinerary/timeline';
	import TimelineItemCard from './TimelineItemCard.svelte';

	let {
		items,
		tripSlug,
		dayId,
		dragDisabled = true,
		votesByItem = {},
		members = [],
		startDrag = () => {},
		onConsider = () => {},
		onFinalize = () => {}
	}: {
		items: Item[];
		tripSlug: string;
		dayId: string;
		dragDisabled?: boolean;
		votesByItem?: Record<string, Vote[]>;
		members?: TripMember[];
		startDrag?: () => void;
		onConsider?: (e: CustomEvent<DndEvent<Item>>) => void;
		onFinalize?: (e: CustomEvent<DndEvent<Item>>) => void;
	} = $props();

	// Per-item slot label + anchored flag, keyed for O(1) lookup. `items` already
	// arrives in display order from the orchestrator; this maps 1:1.
	const flatById = $derived(new Map(buildTimelineFlat(items).map((e) => [e.item.id, e])));
	const overlaps = $derived(detectOverlaps(items));
	const FLIP_MS = 150;
</script>

<section
	class="min-h-[3rem] space-y-2"
	use:dndzone={{ items, dragDisabled, type: 'itinerary-item', flipDurationMs: FLIP_MS, dropTargetStyle: {}, useCursorForDetection: true }}
	onconsider={onConsider}
	onfinalize={onFinalize}
>
	{#each items as item (item.id)}
		{@const meta = flatById.get(item.id)}
		<div animate:flip={{ duration: FLIP_MS }}>
			{#if meta?.slotLabel}
				<div class="flex items-center gap-3 py-1">
					<div class="border-line flex-1 border-t"></div>
					<span class="text-ink-muted text-[11px] font-medium tracking-wider uppercase">{meta.slotLabel}</span>
					<div class="border-line flex-1 border-t"></div>
				</div>
			{/if}
			<TimelineItemCard
				{item}
				{tripSlug}
				anchored={meta?.anchored ?? false}
				overlapping={overlaps.has(item.id)}
				draggable={true}
				votes={votesByItem[item.id] ?? []}
				{members}
				{startDrag}
			/>
		</div>
	{/each}
</section>

{#if items.length === 0}
	<a
		href="/trips/{tripSlug}/items/new?day={dayId}"
		class="border-line text-ink-muted hover:border-ink-muted hover:text-ink-soft mt-2 block rounded-lg border border-dashed px-3 py-2 text-xs"
	>
		Empty. Tap to add one — or drag an idea here.
	</a>
{/if}
