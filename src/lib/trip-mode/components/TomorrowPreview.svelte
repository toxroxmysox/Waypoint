<script lang="ts">
	import { formatCalendarDate } from '$lib/shell/format';
	// Now's next-day preview (#434): tomorrow's date heading + "Next 3 days" link, up to
	// three Rows (`rowSub` with no date, since the heading is the day), then `+n more`.
	// Shared by the Now page's content column and the desktop context rail (#446).
	import { withOrigin } from '$lib/shell/back-nav';
	import SectionH from '$lib/ui/SectionH.svelte';
	import Row from '$lib/ui/Row.svelte';
	import { rowSub } from '$lib/itinerary/row';
	import type { Item } from '$lib/types';
	import { page } from '$app/state';

	let {
		slug,
		date,
		items = []
	}: {
		slug: string;
		/** Tomorrow's calendar-day date string (`YYYY-MM-DD 00:00:00.000Z`). */
		date: string;
		items?: Item[];
	} = $props();

	const label = $derived(
		formatCalendarDate(date, {
			weekday: 'long',
			month: 'short',
			day: 'numeric'
		})
	);
	const shown = $derived(items.slice(0, 3));
</script>

<SectionH>
	{#snippet right()}
		<a href="/trips/{slug}/today/upcoming" class="text-ink-muted hover:text-ink-soft active:text-ink-soft text-xs">Next 3 days</a>
	{/snippet}
	{label}
</SectionH>
{#if items.length > 0}
	<div class="mt-1">
		{#each shown as item, i (item.id)}
			<Row
				type={item.type}
				subtype={item.subtype}
				title={item.title}
				sub={rowSub(item)}
				href={withOrigin(`/trips/${slug}/items/${item.id}`, page.url.pathname)}
				divider={i < shown.length - 1}
			/>
		{/each}
		{#if items.length > 3}
			<p class="text-ink-muted text-center text-xs">+{items.length - 3} more</p>
		{/if}
	</div>
{:else}
	<p class="text-ink-muted mt-2 text-xs">Nothing scheduled.</p>
{/if}
