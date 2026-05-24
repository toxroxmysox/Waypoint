<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		subtitle,
		subtitleStyle = 'default',
		back = false,
		backHref,
		onBack,
		right
	}: {
		title: string;
		subtitle?: string;
		subtitleStyle?: 'default' | 'tagline';
		back?: boolean;
		backHref?: string;
		onBack?: () => void;
		right?: Snippet;
	} = $props();

	function handleBack() {
		if (onBack) onBack();
		else if (typeof history !== 'undefined') history.back();
	}
</script>

<header
	class="border-line bg-paper/95 sticky top-0 z-sticky flex items-center gap-3 border-b px-4 py-3 backdrop-blur"
>
	<div class="flex w-10 shrink-0 items-center">
		{#if back}
			{#if backHref}
				<a
					href={backHref}
					class="text-ink-soft hover:text-ink -ml-2 flex h-9 w-9 items-center justify-center rounded-full"
					aria-label="Back"
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
						<path d="m15 18-6-6 6-6" />
					</svg>
				</a>
			{:else}
				<button
					type="button"
					onclick={handleBack}
					class="text-ink-soft hover:text-ink -ml-2 flex h-9 w-9 items-center justify-center rounded-full"
					aria-label="Back"
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
						<path d="m15 18-6-6 6-6" />
					</svg>
				</button>
			{/if}
		{/if}
	</div>

	<div class="min-w-0 flex-1 text-center">
		<h1 class="text-ink truncate text-base font-semibold leading-tight">{title}</h1>
		{#if subtitle}
			{#if subtitleStyle === 'tagline'}
				<div class="font-display text-ink-soft truncate text-[13px] leading-tight italic">
					{subtitle}
				</div>
			{:else}
				<div class="text-ink-muted truncate text-[12px] leading-tight">{subtitle}</div>
			{/if}
		{/if}
	</div>

	<div class="flex min-w-10 shrink-0 items-center justify-end whitespace-nowrap">
		{#if right}{@render right()}{/if}
	</div>
</header>
