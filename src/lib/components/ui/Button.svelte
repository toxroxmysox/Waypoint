<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'primary' | 'moss' | 'ghost' | 'soft';
	type Size = 'sm' | 'md' | 'lg';

	let {
		variant = 'primary',
		size = 'md',
		type = 'button',
		href,
		disabled = false,
		loading = false,
		onclick,
		icon,
		class: klass = '',
		children
	}: {
		variant?: Variant;
		size?: Size;
		type?: 'button' | 'submit' | 'reset';
		href?: string;
		disabled?: boolean;
		loading?: boolean;
		onclick?: (e: MouseEvent) => void;
		icon?: Snippet;
		class?: string;
		children: Snippet;
	} = $props();

	const variantClass: Record<Variant, string> = {
		primary: 'bg-ink text-paper border-ink hover:bg-ink-soft',
		moss: 'bg-moss text-paper border-moss hover:bg-moss-soft',
		ghost: 'bg-transparent text-ink border-line hover:bg-surface-2',
		soft: 'bg-surface-2 text-ink border-line hover:bg-surface'
	};

	const sizeClass: Record<Size, string> = {
		sm: 'px-3 py-1.5 text-[13px] rounded-md gap-1.5',
		md: 'px-4 py-2 text-sm rounded-md gap-2',
		lg: 'px-5 py-2.5 text-base rounded-lg gap-2'
	};

	const spinnerSize: Record<Size, string> = {
		sm: 'h-3.5 w-3.5',
		md: 'h-4 w-4',
		lg: 'h-5 w-5'
	};

	const isDisabled = $derived(disabled || loading);

	const base =
		'inline-flex items-center justify-center font-semibold border transition-colors disabled:opacity-40 disabled:pointer-events-none';
</script>

{#snippet spinner()}
	<svg
		class="{spinnerSize[size]} animate-spin"
		viewBox="0 0 24 24"
		fill="none"
		aria-hidden="true"
	>
		<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25" />
		<path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
	</svg>
{/snippet}

{#if href && !isDisabled}
	<a {href} class="{base} {variantClass[variant]} {sizeClass[size]} {klass}">
		{#if icon}{@render icon()}{/if}
		{@render children()}
	</a>
{:else}
	<button
		{type}
		{onclick}
		disabled={isDisabled}
		aria-busy={loading || undefined}
		class="{base} {variantClass[variant]} {sizeClass[size]} {klass}"
		class:opacity-72={loading}
	>
		{#if loading}
			{@render spinner()}
		{:else if icon}
			{@render icon()}
		{/if}
		{@render children()}
	</button>
{/if}

<style>
	.opacity-72 {
		opacity: 0.72;
	}
</style>
