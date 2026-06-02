<script lang="ts">
	import type { Item } from '$lib/types';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import Card from '$lib/ui/Card.svelte';
	import { titleCase, formatTime } from '$lib/shell/format';

	let {
		item,
		tripSlug,
		anchored = false,
		overlapping = false,
		draggable = false,
	}: {
		item: Item;
		tripSlug: string;
		anchored?: boolean;
		overlapping?: boolean;
		draggable?: boolean;
	} = $props();
</script>

<div
	class="group relative"
	class:opacity-90={overlapping}
>
	{#if anchored && item.start_time}
		<div class="text-ink-muted absolute -left-16 top-3 hidden text-xs font-mono md-desktop:block">
			{formatTime(item.start_time)}
		</div>
	{/if}

	<Card href="/trips/{tripSlug}/items/{item.id}">
		<div class="flex items-start gap-3 p-3" class:border-l-2={overlapping} class:border-gold={overlapping}>
			{#if draggable && !anchored}
				<div class="text-line flex shrink-0 cursor-grab items-center" aria-label="Drag to reorder">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
						<circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
						<circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
						<circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
					</svg>
				</div>
			{/if}
			<TypeIcon type={item.type} sub={item.subtype} size={32} />
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<h4 class="text-ink truncate text-sm font-semibold">{item.title}</h4>
					{#if item.booked}
						<Pill variant="booked" size="sm">Booked</Pill>
					{/if}
				</div>
				{#if item.start_time || item.location_name}
					<p class="text-ink-muted mt-0.5 text-[12px]">
						{#if item.start_time}
							<span class="font-mono">{formatTime(item.start_time)}{item.end_time ? ` – ${formatTime(item.end_time)}` : ''}</span>
						{/if}
						{#if item.start_time && item.location_name}<span class="text-line">·</span>{/if}
						{#if item.location_name}{item.location_name}{/if}
					</p>
				{/if}
				{#if item.subtype}
					<p class="text-ink-muted mt-1 text-[11px] uppercase tracking-wide">{titleCase(item.subtype)}</p>
				{/if}
			</div>
		</div>
	</Card>
</div>
