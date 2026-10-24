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
	class="flex items-center gap-2.5 rounded-[10px] border border-line bg-surface-2 px-3 py-2 hover:bg-surface active:bg-surface"
>
	<ProgressDonut {done} {total} size={20} stroke={3} />
	<span class="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink">{title}</span>
	<span class="font-mono text-[11px] text-ink-muted tabular-nums">{done}/{total}</span>
	<span class="inline-flex shrink-0 text-ink-muted">
		<svg width="14" height="14" viewBox="0 0 20 20" fill="none">
			<path
				d="M8 5l5 5-5 5"
				stroke="currentColor"
				stroke-width="1.8"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</span>
</a>
