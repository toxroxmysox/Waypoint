<script lang="ts">
	import type { Item, Day } from '$lib/types';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import { itemDateRange, nightInfo } from '$lib/itinerary/multi-day';
	import { formatDateRange, formatTime } from '$lib/shell/format';

	let {
		item,
		days,
		dayDate,
		tripSlug,
		ongoing = false
	}: {
		item: Item;
		days: Day[];
		dayDate: string;
		tripSlug: string;
		ongoing?: boolean;
	} = $props();

	const range = $derived(itemDateRange(item, days));
	const info = $derived(nightInfo(item, days, dayDate));

	// Lodging keeps hotel language (Check in/out); everything else gets neutral
	// start/end labels — not every multi-day item is a hotel.
	const isLodging = $derived(item.type === 'lodging');
	const startLabel = $derived(isLodging ? 'Check in' : 'Starts');
	const endLabel = $derived(isLodging ? 'Check out' : 'Ends');

	const context = $derived.by(() => {
		if (!range) return '';
		if (dayDate === range.start) {
			return item.start_time ? `${startLabel} · ${formatTime(item.start_time)}` : startLabel;
		}
		if (dayDate === range.end) {
			return item.end_time ? `${endLabel} · ${formatTime(item.end_time)}` : endLabel;
		}
		// Middle days: 'night X of N' only reads right for lodging. For other spans
		// the date range + Ongoing pill already convey it — skip the night count.
		if (isLodging && info) return `night ${info.night} of ${info.total}`;
		return '';
	});
</script>

{#if range}
	<a
		href="/trips/{tripSlug}/items/{item.id}"
		class="bg-clay text-paper flex items-center gap-3 rounded-xl px-4 py-3 shadow-sm transition-opacity hover:opacity-95"
	>
		<span class="bg-paper/20 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
			<TypeIcon type={item.type} size={18} />
		</span>
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<p class="truncate text-sm font-semibold">{item.title}</p>
				{#if ongoing}
					<Pill variant="default" size="sm">Ongoing</Pill>
				{/if}
			</div>
			<p class="text-paper/80 text-xs">
				{formatDateRange(range.start, range.end)}{context ? ` · ${context}` : ''}
			</p>
		</div>
	</a>
{/if}
