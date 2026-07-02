<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { canGoBack } from '$lib/shell/stores/nav-depth';

	let {
		title,
		subtitle,
		subtitleStyle = 'default',
		back = false,
		backHref,
		onBack,
		right,
		homeLink = true
	}: {
		title: string;
		subtitle?: string;
		subtitleStyle?: 'default' | 'tagline';
		back?: boolean;
		backHref?: string;
		onBack?: () => void;
		right?: Snippet;
		// #299: mobile-only wordmark linking to /trips — the escape hatch out of a
		// trip (Trip Mode's bottom nav has no /trips affordance; desktop SideRail
		// already carries the logo, so this is hidden at md-desktop to avoid
		// duplicating it into that tree). Off on the /trips list itself (the title
		// is already "Waypoint" → would self-link).
		homeLink?: boolean;
	} = $props();

	function handleBack() {
		if (onBack) {
			onBack();
			return;
		}
		if ($canGoBack) {
			history.back();
		} else if (backHref) {
			goto(backHref);
		}
	}
</script>

<header
	class="border-line bg-paper/95 sticky top-0 z-sticky flex items-center gap-3 border-b px-4 py-3 backdrop-blur"
>
	<div class="flex w-10 shrink-0 items-center">
		{#if back}
			<button
				type="button"
				onclick={handleBack}
				class="text-ink-soft hover:text-ink -ml-2 flex h-11 w-11 items-center justify-center rounded-full"
				aria-label="Back"
			>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
					<path d="m15 18-6-6 6-6" />
				</svg>
			</button>
		{/if}
	</div>

	<div class="min-w-0 flex-1 text-center">
		<!-- #334: the title itself is the escape hatch to /trips (was a separate left
		     wordmark that shoved the title off-centre). Back arrow stays upper-left;
		     with no wordmark the left (back) and right (actions) slots balance so the
		     title truly centres. Non-linked when homeLink is off (e.g. the /trips list
		     title would self-link). -->
		<h1 class="font-display text-ink truncate text-lg font-semibold leading-tight tracking-[-0.2px]" title={title}>
			{#if homeLink}
				<a href="/trips" class="hover:text-moss transition-colors" aria-label="{title} — all trips">{title}</a>
			{:else}
				{title}
			{/if}
		</h1>
		{#if subtitle}
			{#if subtitleStyle === 'tagline'}
				<div class="text-ink-soft truncate text-[13px] leading-tight font-medium" title={subtitle}>
					{subtitle}
				</div>
			{:else}
				<div class="text-ink-muted truncate text-[12px] leading-tight" title={subtitle}>{subtitle}</div>
			{/if}
		{/if}
	</div>

	<div class="flex min-w-10 shrink-0 items-center justify-end whitespace-nowrap">
		{#if right}{@render right()}{/if}
	</div>
</header>
