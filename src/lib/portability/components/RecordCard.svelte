<script lang="ts">
	// One item in the record (#436; spec stories 57/58, CARD_SYSTEM D2): the day
	// page's card on the Timeline Rail, read-only. Same shape as `ItemCard` (rail,
	// title, meta), but nothing to act on: no link (public archive rows go nowhere),
	// no cost, no strip, no outcome stamp (everything in the record was done), and the
	// FULL description. The rail owns time, so the card never prints one.
	import Card from '$lib/ui/Card.svelte';
	import RailStack from '$lib/itinerary/components/RailStack.svelte';
	import { RAIL, TIMED_MIN_HEIGHT } from '$lib/itinerary/card-anatomy';
	import { timeShape } from '$lib/itinerary/timeline';
	import { recordCardFields, type RecordCardItem } from '$lib/portability/record-card';
	import type { ItemType } from '$lib/itinerary/types';

	let {
		item,
		dayDate
	}: {
		item: RecordCardItem & { subtype?: string; type: ItemType };
		/** The owning day's calendar date. */
		dayDate: string;
	} = $props();

	let height = $state(0);

	const fields = $derived(recordCardFields(item, dayDate));
	const timed = $derived(timeShape(fields) !== 'untimed');
	// A flight's description is its arrival label (it feeds the route in the meta), not prose.
	const body = $derived(item.type === 'flight' ? '' : (item.description ?? ''));
	const railItem = $derived({ type: item.type, subtype: item.subtype, ...fields });
</script>

<div
	class="relative"
	style="padding-left:{RAIL.column + RAIL.gap}px;{timed ? `min-height:${TIMED_MIN_HEIGHT}px;` : ''}"
	bind:clientHeight={height}
	data-record-card
>
	<RailStack item={railItem} {height} />

	<Card class="relative h-full {timed ? 'min-h-[62px]' : ''}">
		<div class="p-3">
			<h4 class="text-ink line-clamp-2 text-sm leading-5 font-semibold" data-card="title">{item.title}</h4>
			{#if fields.meta}
				<p class="text-ink-muted mt-0.5 truncate text-[12px] leading-4" data-card="meta">{fields.meta}</p>
			{/if}
			{#if body}
				<p class="text-ink-soft mt-1.5 text-xs leading-5 whitespace-pre-line" data-card="description">{body}</p>
			{/if}
		</div>
	</Card>
</div>
