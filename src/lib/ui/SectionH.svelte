<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		right,
		children
	}: {
		right?: Snippet;
		children: Snippet;
	} = $props();
</script>

<div class="flex items-baseline justify-between gap-3 pt-1">
	<h3 class="text-[11px] font-bold tracking-[0.2em] text-moss uppercase">
		{@render children()}
	</h3>
	{#if right}
		<div class="text-[11.5px] text-ink-muted">{@render right()}</div>
	{/if}
</div>
