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
	<h3 class="text-moss text-[11px] font-bold tracking-[0.2em] uppercase">
		{@render children()}
	</h3>
	{#if right}
		<div class="text-ink-muted text-[11.5px]">{@render right()}</div>
	{/if}
</div>
