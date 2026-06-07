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

	const context = $derived.by(() => {
		if (!range) return '';
		if (dayDate === range.start) {
			return item.start_time ? `Check in · ${formatTime(item.start_time)}` : 'Check in';
		}
		if (dayDate === range.end) {
			return item.end_time ? `Check out · ${formatTime(item.end_time)}` : 'Check out';
		}
		return info ? `night ${info.night} of ${info.total}` : '';
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
