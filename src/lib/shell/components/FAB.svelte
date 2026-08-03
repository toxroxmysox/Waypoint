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
		'fixed right-5 z-nav flex h-14 w-14 items-center justify-center rounded-full bg-ink text-paper shadow-card-strong active:scale-95 transition-transform fab-safe-bottom';
</script>

<!-- #380 — the FAB is `fixed`, so it sits ON TOP of the last row of scrollable
     content at full scroll-bottom (the last day card on the trip overview, the
     parking-lot drop zone on the day view). iOS convention is that content gets
     a bottom inset so everything can scroll clear of floating controls.

     Emitted by the FAB itself rather than as a `pb-*` on each page's `<main>`:
     every call site renders `<FAB>` in normal flow immediately after `</main>`,
     so this block adds exactly the needed document height wherever a FAB exists
     — and only there. New FAB pages get the inset for free. -->
<div class="fab-scroll-inset" aria-hidden="true"></div>

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

<style>
	.fab-safe-bottom {
		bottom: calc(env(safe-area-inset-bottom, 0px) + 5rem);
	}

	/* FAB is h-14 (3.5rem) and sits 5rem above the safe-area bottom; the shell
	   already contributes a 4rem spacer for the bottom nav. This adds the
	   remainder — the FAB's own height plus a 1rem breathing gap — so the last
	   content row clears it instead of hiding underneath. */
	.fab-scroll-inset {
		height: 4.5rem;
	}
</style>
