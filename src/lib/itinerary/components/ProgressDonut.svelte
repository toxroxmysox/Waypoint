<script lang="ts">
	// Art direction B "Ledger" — SVG progress ring with a centered mono count.
	// surface-2 track + moss arc. Pure presentational (issue #55).
	// Translated from design/lists-checklists/source-jsx/lists-components.jsx → ProgressDonut.
	let {
		done,
		total,
		size = 34,
		stroke = 4
	}: {
		done: number;
		total: number;
		size?: number;
		stroke?: number;
	} = $props();

	const r = $derived((size - stroke) / 2);
	const circumference = $derived(2 * Math.PI * r);
	const pct = $derived(total ? done / total : 0);
	const offset = $derived(circumference * (1 - pct));
	const countSize = $derived(Math.round(size * 0.26));
</script>

<span
	class="relative inline-flex shrink-0"
	style="width:{size}px;height:{size}px;"
	role="img"
	aria-label="{done} of {total} done"
>
	<svg width={size} height={size} style="transform:rotate(-90deg);" aria-hidden="true">
		<circle
			cx={size / 2}
			cy={size / 2}
			{r}
			fill="none"
			stroke="var(--color-surface-2)"
			stroke-width={stroke}
		/>
		<circle
			cx={size / 2}
			cy={size / 2}
			{r}
			fill="none"
			stroke="var(--color-moss)"
			stroke-width={stroke}
			stroke-dasharray={circumference}
			stroke-dashoffset={offset}
			stroke-linecap="round"
		/>
	</svg>
	<span
		class="text-ink-soft absolute inset-0 flex items-center justify-center font-mono font-semibold tabular-nums"
		style="font-size:{countSize}px;"
	>
		{done}
	</span>
</span>
