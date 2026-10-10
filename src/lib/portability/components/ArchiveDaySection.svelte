<script lang="ts">
	import RecordCard from './RecordCard.svelte';
	import { orderDayItems } from '$lib/itinerary/timeline';
	import { formatCalendarDate } from '$lib/shell/format';
	import type { Day, Phase, ItemType } from '$lib/types';

	type SanitizedItem = {
		id: string;
		day: string;
		phase: string;
		type: ItemType;
		subtype: string;
		title: string;
		description: string;
		location_name: string;
		location_address: string;
		start_time: string | null;
		end_time: string | null;
		end_date?: string;
		status: string;
		sort_order?: number;
	};

	let {
		day,
		items,
		phases
	}: {
		day: Day;
		items: SanitizedItem[];
		phases: Phase[];
	} = $props();

	const phaseMap = $derived(new Map(phases.map((p) => [p.id, p])));

	const dayDate = $derived(
		formatCalendarDate(day.date, { weekday: 'long', month: 'long', day: 'numeric' })
	);

	const dayPhase = $derived.by(() => {
		if (!day.phases || day.phases.length === 0) return null;
		return phaseMap.get(day.phases[0]) || null;
	});

	// The day page's order: timed items by time, untimed woven in by sort_order.
	const sortedItems = $derived(
		orderDayItems(items.map((i) => ({ ...i, start_time: i.start_time ?? '', end_time: i.end_time ?? '', sort_order: i.sort_order ?? 0 })))
	);
</script>

<section class="bg-surface border-border overflow-hidden rounded-xl border shadow-sm">
	<div class="flex items-center gap-3 border-b border-border/50 px-4 py-3">
		<div>
			<h3 class="text-ink text-base font-semibold">{dayDate}</h3>
			{#if dayPhase}
				<span
					class="mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
					style="background-color: var(--color-moss-tint); color: var(--color-moss)"
				>
					{dayPhase.name}
				</span>
			{/if}
		</div>
	</div>

	{#if items.length === 0}
		<p class="text-ink-muted px-4 py-4 text-center text-sm">Rest day</p>
	{:else}
		<!-- #436: the day on the same rail as the day page, read-only. -->
		<div class="space-y-2 p-3">
			{#each sortedItems as item (item.id)}
				<RecordCard {item} dayDate={day.date} />
			{/each}
		</div>
	{/if}
</section>
