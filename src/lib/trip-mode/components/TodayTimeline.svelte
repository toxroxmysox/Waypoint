<script lang="ts">
	import type { Item } from '$lib/types';
	import { buildTimeline } from '$lib/itinerary/timeline';
	import TodayItemCard from './TodayItemCard.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import { tick, onMount } from 'svelte';

	let {
		items,
		tripSlug,
		now
	}: {
		items: Item[];
		tripSlug: string;
		now: Date;
	} = $props();

	const timeline = $derived(buildTimeline(items));

	// Plan-based count, never a done-count: done is Closeout's verdict and no
	// Trip-Mode surface can set it, so "0 of N done" all day was a lie (#199).
	const totalCount = $derived(items.length);

	function getTemporalState(item: Item): 'past' | 'current' | 'future' {
		if (!item.start_time) {
			return item.status === 'done' ? 'past' : 'future';
		}
		const start = new Date(item.start_time.replace(' ', 'T')).getTime();
		const end = item.end_time
			? new Date(item.end_time.replace(' ', 'T')).getTime()
			: start;
		const nowMs = now.getTime();
		if (nowMs >= start && nowMs < end) return 'current';
		if (nowMs >= end) return 'past';
		return 'future';
	}

	function findCurrentItemId(): string | null {
		for (const entry of timeline) {
			if (entry.kind === 'item' && getTemporalState(entry.item) === 'current') {
				return entry.item.id;
			}
		}
		return null;
	}

	onMount(() => {
		const id = findCurrentItemId();
		if (!id) return;
		tick().then(() => {
			const el = document.getElementById(`item-${id}`);
			el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		});
	});
</script>

{#if totalCount > 0}
	<div class="mb-3 flex items-center justify-between">
		<Pill variant="default" size="sm">{totalCount} {totalCount === 1 ? 'thing' : 'things'} on today's plan</Pill>
	</div>
{/if}

{#if timeline.length === 0}
	<div class="rounded-xl border border-line bg-surface p-6 text-center">
		<p class="text-ink-muted text-sm">Nothing scheduled for today.</p>
	</div>
{:else}
	<div class="space-y-2">
		{#each timeline as entry}
			{#if entry.kind === 'divider'}
				<div class="flex items-center gap-3 py-1">
					<div class="border-line flex-1 border-t"></div>
					<span class="text-ink-muted text-[11px] font-medium uppercase tracking-wider">{entry.label}</span>
					<div class="border-line flex-1 border-t"></div>
				</div>
			{:else if entry.kind === 'item'}
				<TodayItemCard
					item={entry.item}
					{tripSlug}
					temporal={getTemporalState(entry.item)}
				/>
			{/if}
		{/each}
	</div>
{/if}
