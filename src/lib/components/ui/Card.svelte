<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		strong = false,
		accent,
		href,
		onclick,
		class: klass = '',
		children
	}: {
		strong?: boolean;
		accent?: string;
		href?: string;
		onclick?: (e: MouseEvent) => void;
		class?: string;
		children: Snippet;
	} = $props();

	const base =
		'block rounded-lg border border-line bg-surface text-ink transition-shadow';
	const shadow = $derived(strong ? 'shadow-card-strong' : 'shadow-card');
	const interactive = $derived(href || onclick ? 'hover:shadow-card-strong active:scale-[0.98] active:bg-surface-2' : '');
	const accentStyle = $derived(accent ? `border-left-width:4px;border-left-color:${accent};` : '');
</script>

{#if href}
	<a {href} class="{base} {shadow} {interactive} {klass}" style={accentStyle}>
		{@render children()}
	</a>
{:else if onclick}
	<button
		type="button"
		{onclick}
		class="{base} {shadow} {interactive} w-full text-left {klass}"
		style={accentStyle}
	>
		{@render children()}
	</button>
{:else}
	<div class="{base} {shadow} {klass}" style={accentStyle}>
		{@render children()}
	</div>
{/if}
