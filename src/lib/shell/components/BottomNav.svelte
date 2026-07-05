<script lang="ts">
	import { page } from '$app/state';
	import StarIcons from '$lib/ui/StarIcons.svelte';
	import { getActiveTab } from '$lib/shell/nav-tabs';
	import type { NavConfig } from '$lib/shell/nav-tabs';

	let {
		config,
		onAction
	}: {
		config: NavConfig;
		onAction?: (action: string) => void;
	} = $props();

	let inputFocused = $state(false);

	function handleFocusIn(e: FocusEvent) {
		const tag = (e.target as HTMLElement)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
			inputFocused = true;
		}
	}

	function handleFocusOut() {
		inputFocused = false;
	}

	const activeTabId = $derived(getActiveTab(page.url.pathname, config.chrome));
</script>

<svelte:window onfocusin={handleFocusIn} onfocusout={handleFocusOut} />

{#if !inputFocused}
<nav class="border-line bg-paper/95 fixed bottom-0 left-0 right-0 z-nav flex border-t backdrop-blur safe-bottom">
	{#each config.tabs as tab}
		{@const isActive = activeTabId === tab.id}
		{@const activeColor = config.accent === 'clay' ? 'text-clay' : 'text-moss'}
		{#if tab.oversized && tab.action}
			<button
				type="button"
				class="flex flex-1 flex-col items-center justify-center py-2"
				aria-label={tab.label}
				onclick={() => onAction?.(tab.action!)}
			>
				<span class="bg-clay flex h-12 w-12 items-center justify-center rounded-full text-white shadow-md">
					<StarIcons name={tab.icon} size={22} />
				</span>
			</button>
		{:else if tab.oversized}
			<a
				href={tab.href}
				class="flex flex-1 flex-col items-center justify-center py-2"
				aria-label={tab.label}
			>
				<span class="bg-clay flex h-12 w-12 items-center justify-center rounded-full text-white shadow-md">
					<StarIcons name={tab.icon} size={22} />
				</span>
			</a>
		{:else}
			<a
				href={tab.href}
				class="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors
					{isActive ? activeColor : 'text-ink-muted'}"
				aria-current={isActive ? 'page' : undefined}
			>
				<StarIcons name={tab.icon} size={22} />
				<span>{tab.label}</span>
			</a>
		{/if}
	{/each}
</nav>
{/if}

<style>
	.safe-bottom {
		padding-bottom: env(safe-area-inset-bottom, 0px);
	}
</style>
