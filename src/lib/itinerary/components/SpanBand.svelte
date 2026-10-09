<script lang="ts">
	// The Span shape (#423; spec §Span, CARD_SYSTEM D10/D11): a Multi-day Item as a
	// quiet full-width band, context rather than a step. Neutral surface-2, no
	// shadow, no accent. The 24px disc sits where the rail's icons sit (centred in
	// the 48px rail column) and the title starts where card titles start (rail +
	// gap + the card's 12px padding). One link to the item, 44px tall at least;
	// never inside the dnd zone, so never dragged.
	import { withOrigin } from '$lib/shell/back-nav';
	import { page } from '$app/state';
	import type { Item, Day } from '$lib/types';
	import MonoTypeIcon from '$lib/ui/MonoTypeIcon.svelte';
	import { spanBandText } from '$lib/itinerary/multi-day';
	import { RAIL } from '$lib/itinerary/card-anatomy';

	let {
		item,
		days,
		dayDate,
		tripSlug
	}: {
		item: Item;
		days: Day[];
		/** The date the band is shown on, 'YYYY-MM-DD' (the trip-local day). */
		dayDate: string;
		tripSlug: string;
	} = $props();

	const band = $derived(spanBandText(item, days, dayDate));
	const titleLeft = RAIL.column + RAIL.gap + 12;
</script>

{#if band}
	<a
		href={withOrigin(`/trips/${tripSlug}/items/${item.id}`, page.url.pathname)}
		class="bg-surface-2 hover:bg-line/40 active:bg-line/40 relative block min-h-[44px] rounded-lg py-2 pr-3 transition-colors"
		style="padding-left:{titleLeft}px;"
		data-span-band={item.id}
	>
		<span class="absolute top-1/2 -translate-y-1/2" style="left:{(RAIL.column - RAIL.icon) / 2}px;">
			<MonoTypeIcon type={item.type} sub={item.subtype} size={24} />
		</span>
		<span class="text-ink block truncate text-sm leading-5 font-semibold" data-span="title">{item.title}</span>
		<span class="text-ink-soft block truncate text-xs leading-4" data-span="text">{band.text}</span>
	</a>
{/if}
