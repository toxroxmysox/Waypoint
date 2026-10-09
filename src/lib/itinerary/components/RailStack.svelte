<script lang="ts">
	// One card's stretch of the Timeline Rail (#420; spec §Timeline Rail geometry,
	// CARD_SYSTEM D9): a centred time · icon · time stack, 48px wide, filling the
	// height of the card beside it. Absolutely positioned: the host row is
	// `relative`, pads its left by RAIL.column + RAIL.gap, and passes its measured
	// `height`.
	//   - leaders: a rule across the time at each card edge, from the column's left
	//     edge to the card (so it reads as the card's top / bottom edge)
	//   - segments: within the item only, dropped under 6px (`railSegments`)
	//   - the node: monochrome, vertically centred, dashed when untimed
	// The rail never prints `by`: a deadline is a plain bottom label.
	import MonoTypeIcon from '$lib/ui/MonoTypeIcon.svelte';
	import { railTimeLabels } from '$lib/shell/format';
	import { timeShape, type TimeFields } from '$lib/itinerary/timeline';
	import { RAIL, railSegments } from '$lib/itinerary/card-anatomy';
	import type { ItemType } from '$lib/itinerary/types';

	let {
		item,
		height = 0,
		redTop = false,
		redBottom = false
	}: {
		item: TimeFields & { type: ItemType; subtype?: string };
		/** The card's rendered height in px (0 before it is measured: no segments). */
		height?: number;
		/** The later item's START in a real conflict (D10). */
		redTop?: boolean;
		/** The earlier item's END in a real conflict (D10). */
		redBottom?: boolean;
	} = $props();

	const shape = $derived(timeShape(item));
	const labels = $derived(railTimeLabels(item));
	const segs = $derived(height > 0 ? railSegments(height, shape) : { top: null, bottom: null });
	const edge = RAIL.column + RAIL.gap;
</script>

<div class="pointer-events-none absolute top-0 bottom-0 left-0" style="width:{RAIL.column}px;" data-rail="stack">
	{#if labels.top}
		<div class="bg-ink-muted/40 absolute top-0 left-0 h-px" style="width:{edge}px;" data-rail="leader-top"></div>
		<span
			class="absolute inset-x-[3px] text-center font-mono text-[11px] leading-[11px] {redTop ? 'text-error' : 'text-ink-muted'}"
			style="top:{RAIL.rulePad}px;"
			data-rail="time-top">{labels.top}</span
		>
	{/if}
	{#if labels.bottom}
		<div class="bg-ink-muted/40 absolute bottom-0 left-0 h-px" style="width:{edge}px;" data-rail="leader-bottom"></div>
		<span
			class="absolute inset-x-[3px] text-center font-mono text-[11px] leading-[11px] {redBottom ? 'text-error' : 'text-ink-muted'}"
			style="bottom:{RAIL.rulePad}px;"
			data-rail="time-bottom">{labels.bottom}</span
		>
	{/if}
	{#if segs.top}
		<div class="bg-ink-muted/40 absolute w-px" style="left:{RAIL.column / 2 - 0.5}px;top:{segs.top.top}px;height:{segs.top.length}px;" data-rail="seg-top"></div>
	{/if}
	{#if segs.bottom}
		<div class="bg-ink-muted/40 absolute w-px" style="left:{RAIL.column / 2 - 0.5}px;top:{segs.bottom.top}px;height:{segs.bottom.length}px;" data-rail="seg-bottom"></div>
	{/if}
	<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" data-rail="node">
		<MonoTypeIcon type={item.type} sub={item.subtype} size={24} variant={shape === 'untimed' ? 'dashed' : 'plain'} />
	</div>
</div>
