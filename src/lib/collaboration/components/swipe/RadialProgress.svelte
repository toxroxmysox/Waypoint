<script lang="ts">
	// Radial ring that counts the deck *down* — the remaining number sits in the
	// middle and the moss arc shrinks as cards are cleared.
	let {
		done = 0,
		total = 0,
		size = 38
	}: {
		done?: number;
		total?: number;
		size?: number;
	} = $props();

	const r = $derived((size - 5) / 2);
	const c = $derived(2 * Math.PI * r);
	const frac = $derived(total ? done / total : 0);
	const remaining = $derived(Math.max(0, total - done));
</script>

<div class="relative flex-none" style="width:{size}px;height:{size}px;" aria-hidden="true">
	<svg width={size} height={size} style="transform:rotate(-90deg);">
		<circle cx={size / 2} cy={size / 2} {r} fill="none" stroke="var(--color-line)" stroke-width="3" />
		<circle
			cx={size / 2}
			cy={size / 2}
			{r}
			fill="none"
			stroke="var(--color-moss)"
			stroke-width="3"
			stroke-linecap="round"
			stroke-dasharray={c}
			stroke-dashoffset={c * (1 - frac)}
			style="transition:stroke-dashoffset .35s cubic-bezier(.16,1,.3,1);"
		/>
	</svg>
	<span
		class="text-ink font-mono absolute inset-0 flex items-center justify-center text-xs font-semibold"
	>
		{remaining}
	</span>
</div>
