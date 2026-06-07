<script lang="ts">
	// Compact one-line checklist preview for the Overview (#51): small donut +
	// title + mono n/m + chevron. Lightweight — never competes with the days.
	// Translated from design/lists-checklists/source-jsx → MiniListCard.
	import ProgressDonut from '$lib/itinerary/components/ProgressDonut.svelte';

	let {
		title,
		done,
		total,
		href
	}: {
		title: string;
		done: number;
		total: number;
		href: string;
	} = $props();
</script>

<a
	{href}
	class="border-line bg-surface-2 hover:bg-surface flex items-center gap-2.5 rounded-[10px] border px-3 py-2"
>
	<ProgressDonut {done} {total} size={20} stroke={3} />
	<span class="text-ink min-w-0 flex-1 truncate text-[12.5px] font-semibold">{title}</span>
	<span class="text-ink-muted font-mono text-[11px] tabular-nums">{done}/{total}</span>
	<span class="text-ink-muted inline-flex shrink-0">
		<svg width="14" height="14" viewBox="0 0 20 20" fill="none">
			<path d="M8 5l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</span>
</a>
