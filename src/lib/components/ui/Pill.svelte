<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'booked' | 'pending' | 'planned' | 'trip' | 'info' | 'default' | 'ink';
	type Size = 'sm' | 'md';

	let {
		variant = 'default',
		size = 'md',
		children
	}: {
		variant?: Variant;
		size?: Size;
		children: Snippet;
	} = $props();

	const variantClass: Record<Variant, string> = {
		booked: 'bg-moss-tint text-moss border-moss/20',
		pending: 'bg-[#FBF1DC] text-[#8a6f24] border-gold/30',
		planned: 'bg-transparent text-ink-soft border-line',
		trip: 'bg-clay text-paper border-clay',
		info: 'bg-[#E6EEF8] text-sky border-sky/20',
		default: 'bg-surface-2 text-ink-soft border-line',
		ink: 'bg-ink text-paper border-ink'
	};

	const sizeClass: Record<Size, string> = {
		sm: 'px-2 py-[1px] text-[10.5px]',
		md: 'px-2.5 py-0.5 text-[11.5px]'
	};
</script>

<span
	class="inline-flex items-center gap-1 rounded-full border font-semibold tracking-wide uppercase {variantClass[
		variant
	]} {sizeClass[size]}"
>
	{@render children()}
</span>
