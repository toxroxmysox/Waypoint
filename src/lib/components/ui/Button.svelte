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

	const base =
		'inline-flex items-center justify-center font-semibold border transition-colors disabled:opacity-40 disabled:pointer-events-none';
</script>

{#if href && !disabled}
	<a {href} class="{base} {variantClass[variant]} {sizeClass[size]} {klass}">
		{#if icon}{@render icon()}{/if}
		{@render children()}
	</a>
{:else}
	<button
		{type}
		{onclick}
		{disabled}
		class="{base} {variantClass[variant]} {sizeClass[size]} {klass}"
	>
		{#if icon}{@render icon()}{/if}
		{@render children()}
	</button>
{/if}
