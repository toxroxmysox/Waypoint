<script lang="ts">
	import type { Item } from '$lib/types';
	import NowDivider from './NowDivider.svelte';
	import Card from '$lib/ui/Card.svelte';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import { formatCountdown, formatTime } from '$lib/shell/format';

	let {
		nextItem,
		minutesUntilNext,
		slug
	}: {
		nextItem: Item;
		minutesUntilNext: number;
		slug: string;
	} = $props();
</script>

<section class="space-y-4">
	<Card>
		<div class="p-6 text-center">
			<p class="text-ink-muted text-xs font-medium uppercase tracking-wide">Free time</p>
			<p class="text-ink font-display mt-2 text-3xl font-semibold">{formatCountdown(minutesUntilNext)}</p>
			<p class="text-ink-muted mt-1 text-sm">until next activity</p>
		</div>
	</Card>

	<NowDivider label="Up next" />

	<Card href="/trips/{slug}/items/{nextItem.id}">
		<div class="flex items-center gap-3 p-4">
			<TypeIcon type={nextItem.type} sub={nextItem.subtype} size={36} />
			<div class="min-w-0 flex-1">
				<h4 class="text-ink text-base font-semibold">{nextItem.title}</h4>
				{#if nextItem.start_time}
					<p class="text-ink-muted font-mono mt-0.5 text-sm">{formatTime(nextItem.start_time)}</p>
				{/if}
				{#if nextItem.location_name}
					<p class="text-ink-muted mt-0.5 text-sm">{nextItem.location_name}</p>
				{/if}
			</div>
		</div>
	</Card>
</section>
