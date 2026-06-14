<script lang="ts">
	import type { Item } from '$lib/types';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import { titleCase } from '$lib/shell/format';

	let {
		item,
		slug = '',
		isNext = false
	}: {
		item: Item;
		slug?: string;
		isNext?: boolean;
	} = $props();

	function formatTime(t: string): string {
		if (!t) return '';
		const timePart = t.includes('T') ? t.split('T')[1] : t.includes(' ') ? t.split(' ')[1] : t;
		const [h, m] = timePart.split(':');
		const hour = parseInt(h, 10);
		const ampm = hour >= 12 ? 'PM' : 'AM';
		const h12 = hour % 12 || 12;
		return `${h12}:${m} ${ampm}`;
	}
</script>

<a
	href="/trips/{slug}/items/{item.id}?from=trip"
	class="block rounded-xl border p-4 transition-colors
		{isNext ? 'border-clay bg-clay/5 shadow-sm' : 'border-line bg-paper hover:border-ink-muted'}"
>
	<div class="flex items-start gap-4">
		<TypeIcon type={item.type} sub={item.subtype} size={44} />
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-1.5">
				{#if item.start_time}
					<span class="font-mono text-ink text-base font-semibold">
						{formatTime(item.start_time)}
					</span>
				{/if}
				{#if isNext}
					<Pill variant="trip" size="sm">Up next</Pill>
				{/if}
				{#if item.booked}
					<Pill variant="booked" size="sm">Booked</Pill>
				{/if}
			</div>
			<h3 class="text-ink mt-1 text-lg leading-snug font-semibold">{item.title}</h3>
			{#if item.location_name}
				<p class="text-ink-muted mt-1 text-sm">{item.location_name}</p>
			{/if}
			{#if item.subtype}
				<p class="text-ink-muted mt-1 text-[11px] uppercase tracking-wide">{titleCase(item.subtype)}</p>
			{/if}
		</div>
	</div>

	{#if item.confirmation_codes?.length > 0}
		<div class="mt-3 space-y-1">
			{#each item.confirmation_codes as code}
				<div class="bg-surface-2 flex items-center justify-between rounded px-3 py-1.5">
					<span class="text-ink-muted text-xs uppercase tracking-wide">{code.label}</span>
					<span class="font-mono text-ink text-sm font-semibold">{code.value}</span>
				</div>
			{/each}
		</div>
	{/if}
</a>
