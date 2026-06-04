<script lang="ts">
	import type { Item } from '$lib/types';
	import TripModeCard from './TripModeCard.svelte';
	import NowDivider from './NowDivider.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import { formatCountdown, formatTime } from '$lib/shell/format';

	let {
		currentItem,
		nextItem,
		tomorrowFirstItem,
		minutesRemaining,
		slug
	}: {
		currentItem: Item;
		nextItem: Item | null;
		tomorrowFirstItem: Item | null;
		minutesRemaining: number;
		slug: string;
	} = $props();
</script>

<section class="space-y-4">
	<div>
		<Pill variant="trip" size="sm">Right now</Pill>
		<p class="text-ink-muted mt-1 text-xs">{formatCountdown(minutesRemaining)} remaining</p>
	</div>

	<TripModeCard item={currentItem} {slug} />

	{#if nextItem}
		<NowDivider label="Up next" />
		<Card href="/trips/{slug}/items/{nextItem.id}">
			<div class="flex items-center gap-3 p-3">
				<TypeIcon type={nextItem.type} sub={nextItem.subtype} size={32} />
				<div class="min-w-0 flex-1">
					<h4 class="text-ink truncate text-sm font-semibold">{nextItem.title}</h4>
					{#if nextItem.start_time}
						<p class="text-ink-muted font-mono text-xs">{formatTime(nextItem.start_time)}</p>
					{/if}
				</div>
			</div>
		</Card>
	{/if}

	{#if tomorrowFirstItem}
		<div class="border-line border-t pt-4">
			<p class="text-ink-muted mb-2 text-xs font-medium uppercase tracking-wide">Tomorrow</p>
			<Card href="/trips/{slug}/items/{tomorrowFirstItem.id}">
				<div class="flex items-center gap-3 p-3">
					<TypeIcon type={tomorrowFirstItem.type} sub={tomorrowFirstItem.subtype} size={28} />
					<div class="min-w-0 flex-1">
						<h4 class="text-ink truncate text-sm">{tomorrowFirstItem.title}</h4>
						{#if tomorrowFirstItem.start_time}
							<p class="text-ink-muted font-mono text-[11px]">{formatTime(tomorrowFirstItem.start_time)}</p>
						{/if}
					</div>
				</div>
			</Card>
		</div>
	{/if}
</section>
