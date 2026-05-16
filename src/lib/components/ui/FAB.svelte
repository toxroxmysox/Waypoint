<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		onclick,
		href,
		label = 'Add',
		icon
	}: {
		onclick?: (e: MouseEvent) => void;
		href?: string;
		label?: string;
		icon?: Snippet;
	} = $props();

	const base =
		'fixed bottom-20 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-paper shadow-card-strong active:scale-95 transition-transform';
</script>

{#if href}
	<a {href} class={base} aria-label={label}>
		{#if icon}
			{@render icon()}
		{:else}
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="M12 5v14M5 12h14" />
			</svg>
		{/if}
	</a>
{:else}
	<button type="button" {onclick} class={base} aria-label={label}>
		{#if icon}
			{@render icon()}
		{:else}
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="M12 5v14M5 12h14" />
			</svg>
		{/if}
	</button>
{/if}
