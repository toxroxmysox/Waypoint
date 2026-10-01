<script lang="ts">
	import { withOrigin } from '$lib/shell/back-nav';
	import { page } from '$app/state';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import type { Item, Vote, TripMember } from '$lib/types';
	import { buildTimelineFlat, detectOverlaps } from '$lib/itinerary/timeline';
	import TimelineItemCard from './TimelineItemCard.svelte';

	let {
		items,
		tripSlug,
		dayId,
		votesByItem = {},
		members = [],
		onConsider = () => {},
		onFinalize = () => {}
	}: {
		items: Item[];
		tripSlug: string;
		dayId: string;
		votesByItem?: Record<string, Vote[]>;
		members?: TripMember[];
		onConsider?: (e: CustomEvent<DndEvent<Item>>) => void;
		onFinalize?: (e: CustomEvent<DndEvent<Item>>) => void;
	} = $props();

	// Per-item slot label + anchored flag, keyed for O(1) lookup. `items` already
	// arrives in display order from the orchestrator; this maps 1:1.
	const flatById = $derived(new Map(buildTimelineFlat(items).map((e) => [e.item.id, e])));
	const overlaps = $derived(detectOverlaps(items));
	const FLIP_MS = 150;

	// #353: hold this long before a press becomes a drag (Scott, 2026-09-17).
	// Below it the press stays a tap (the card's link opens) and any movement
	// cancels the drag outright, so a swipe that starts on a card still scrolls
	// the page — which is why movement-threshold arming was rejected.
	const LONG_PRESS_MS = 250;
</script>

<div class="relative">
	<!-- #353: the rail's continuous line. It is a SIBLING of the dndzone, never a
	     child — svelte-dnd-action maps `node.children` 1:1 onto `items`, so any
	     extra child desyncs its index map. The per-item markers (time / hollow
	     dot) are drawn into the same gutter by TimelineItemCard. -->
	{#if items.length > 0}
		<div
			class="bg-line pointer-events-none absolute top-2 bottom-2 left-[2.875rem] w-px"
			aria-hidden="true"
		></div>
	{/if}

	<section
		data-day-timeline
		class="min-h-[3rem] space-y-2"
		use:dndzone={{ items, dragDisabled: false, type: 'itinerary-item', flipDurationMs: FLIP_MS, dropTargetStyle: {}, useCursorForDetection: true, delayTouchStart: LONG_PRESS_MS }}
		onconsider={onConsider}
		onfinalize={onFinalize}
	>
		{#each items as item (item.id)}
			{@const meta = flatById.get(item.id)}
			<!-- This wrapper IS the drag target (whole-card drag, #353) and the one
			     svelte-dnd-action makes focusable for the keyboard path, so the
			     item's name has to live here: the library reads `aria-label` off
			     THIS element for its "started dragging <item>" announcements. -->
			<div animate:flip={{ duration: FLIP_MS }} class="rounded-lg" aria-label={item.title}>
				{#if meta?.slotLabel}
					<!-- Daypart divider, indented past the gutter so the rail runs behind it. -->
					<div class="flex items-center gap-3 py-1 pl-[3.25rem]">
						<span class="text-ink-muted text-[11px] font-medium tracking-wider uppercase">{meta.slotLabel}</span>
						<div class="border-line flex-1 border-t"></div>
					</div>
				{/if}
				<TimelineItemCard
					{item}
					{tripSlug}
					anchored={meta?.anchored ?? false}
					overlapping={overlaps.has(item.id)}
					votes={votesByItem[item.id] ?? []}
					{members}
				/>
			</div>
		{/each}
	</section>
</div>

{#if items.length === 0}
	<a
		href={withOrigin(`/trips/${tripSlug}/items/new?day=${dayId}`, page.url.pathname)}
		class="border-line text-ink-muted hover:border-ink-muted active:border-ink-muted hover:text-ink-soft active:text-ink-soft mt-2 block rounded-lg border border-dashed px-3 py-2 text-xs"
	>
		Empty. Tap to add one — or drag an idea here.
	</a>
{/if}
