<script lang="ts">
	import { withOrigin } from '$lib/shell/back-nav';
	import { page } from '$app/state';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import type { Item, TripMember } from '$lib/types';
	import { buildTimelineFlat } from '$lib/itinerary/timeline';
	import { freeTimeGaps, overlapPairs } from '$lib/itinerary/card-anatomy';
	import ItemCard from './ItemCard.svelte';
	import TimeSlotDivider from './TimeSlotDivider.svelte';
	import FreeTimeLabel from './FreeTimeLabel.svelte';

	let {
		items,
		tripSlug,
		dayId,
		docCountByItem = {},
		members = [],
		onConsider = () => {},
		onFinalize = () => {}
	}: {
		items: Item[];
		tripSlug: string;
		dayId: string;
		/** Attached documents per item id (the strip's count). */
		docCountByItem?: Record<string, number>;
		members?: TripMember[];
		onConsider?: (e: CustomEvent<DndEvent<Item>>) => void;
		onFinalize?: (e: CustomEvent<DndEvent<Item>>) => void;
	} = $props();

	// Per-item slot label, keyed for O(1) lookup. `items` already arrives in
	// display order from the orchestrator; this maps 1:1.
	const flatById = $derived(new Map(buildTimelineFlat(items).map((e) => [e.item.id, e])));
	const overlaps = $derived(overlapPairs(items));
	const gaps = $derived(freeTimeGaps(items));
	const FLIP_MS = 150;

	// #353: hold this long before a press becomes a drag (Scott, 2026-09-17).
	// Below it the press stays a tap (the card's link opens) and any movement
	// cancels the drag outright, so a swipe that starts on a card still scrolls
	// the page — which is why movement-threshold arming was rejected.
	const LONG_PRESS_MS = 250;
</script>

<!-- #420: the rail is per card (RailStack inside ItemCard) — there is no
     continuous line and nothing between cards. Every child of the dndzone is an
     item wrapper (svelte-dnd-action maps `node.children` 1:1 onto `items`); the
     slot divider and free-time label live INSIDE the wrapper of the item that
     follows them. -->
<section
	data-day-timeline
	class="min-h-[3rem] space-y-2"
	use:dndzone={{ items, dragDisabled: false, type: 'itinerary-item', flipDurationMs: FLIP_MS, dropTargetStyle: {}, useCursorForDetection: true, delayTouchStart: LONG_PRESS_MS }}
	onconsider={onConsider}
	onfinalize={onFinalize}
>
	{#each items as item (item.id)}
		{@const meta = flatById.get(item.id)}
		{@const gap = gaps.get(item.id)}
		<!-- This wrapper IS the drag target (whole-card drag, #353) and the one
		     svelte-dnd-action makes focusable for the keyboard path, so the
		     item's name has to live here: the library reads `aria-label` off
		     THIS element for its "started dragging <item>" announcements. The
		     card's own link carries the full accessible name (#420). -->
		<div animate:flip={{ duration: FLIP_MS }} class="rounded-lg" aria-label={item.title}>
			{#if meta?.slotLabel}
				<TimeSlotDivider label={meta.slotLabel} />
			{/if}
			{#if gap}
				<FreeTimeLabel {gap} />
			{/if}
			<ItemCard {item} {tripSlug} {members} overlap={overlaps.get(item.id)} docCount={docCountByItem[item.id] ?? 0} />
		</div>
	{/each}
</section>

{#if items.length === 0}
	<!-- #427 empty day (story 35): suggest the next step instead of a blank. The
	     panel sits beside the dndzone, whose min-height stays the drop target. -->
	<div
		class="border-line mt-2 flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-5 text-center"
		data-day-empty
	>
		<p class="text-ink-muted text-sm">
			<span class="text-ink-soft font-medium">Nothing planned</span>
			<span aria-hidden="true">&nbsp;·&nbsp;</span>Add something, or drag an idea here.
		</p>
		<a
			href={withOrigin(`/trips/${tripSlug}/items/new?day=${dayId}`, page.url.pathname)}
			class="border-line text-ink-soft hover:border-ink-muted active:border-ink-muted inline-flex min-h-[44px] items-center rounded-lg border bg-white px-4 text-sm font-medium"
		>
			+ Add item
		</a>
	</div>
{/if}
