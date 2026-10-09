<script lang="ts">
	import { tick } from 'svelte';
	import type { ItemMenuEntry } from '$lib/itinerary/item-actions';

	// #437 — the item page's `⋯`. The entries come from `itemMenuEntries()` (a pure
	// projection of #416's permissions), so this renders nothing when the viewer has
	// no action to take. It is only the trigger + popover: the sheets each entry
	// opens live in ItemActionSheets, OUTSIDE the NavBar, because the header's
	// backdrop-blur makes it the containing block for `position: fixed` (a sheet
	// rendered in here would be sized to the header, not the screen).

	let {
		entries,
		onselect
	}: {
		entries: ItemMenuEntry[];
		onselect: (id: 'move' | 'skip' | 'delete') => void;
	} = $props();

	let menuOpen = $state(false);
	let wrapEl = $state<HTMLElement | null>(null);
	let triggerEl = $state<HTMLButtonElement | null>(null);
	let menuEl = $state<HTMLElement | null>(null);

	async function openMenu() {
		menuOpen = true;
		await tick();
		menuEl?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
	}

	function closeMenu(returnFocus = false) {
		menuOpen = false;
		if (returnFocus) triggerEl?.focus();
	}

	function choose(id: 'move' | 'skip' | 'delete') {
		closeMenu();
		onselect(id);
	}

	function onWindowClick(e: MouseEvent) {
		if (menuOpen && wrapEl && !wrapEl.contains(e.target as Node)) closeMenu();
	}

	function onMenuKeydown(e: KeyboardEvent) {
		const items = Array.from(menuEl?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
		const i = items.indexOf(document.activeElement as HTMLElement);
		if (e.key === 'Escape') {
			e.preventDefault();
			closeMenu(true);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			items[(i + 1) % items.length]?.focus();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			items[(i - 1 + items.length) % items.length]?.focus();
		} else if (e.key === 'Tab') {
			closeMenu();
		}
	}

	const rowClass =
		'min-h-11 hover:bg-surface-2 active:bg-surface-2 flex w-full items-center px-4 text-left text-sm font-medium';
</script>

<svelte:window onclick={onWindowClick} />

{#if entries.length > 0}
	<div class="relative" bind:this={wrapEl}>
		<button
			type="button"
			bind:this={triggerEl}
			onclick={() => (menuOpen ? closeMenu() : openMenu())}
			aria-label="Item actions"
			aria-haspopup="menu"
			aria-expanded={menuOpen}
			class="text-ink-soft hover:text-ink active:text-ink active:bg-surface-2 -mr-2 flex h-11 w-11 items-center justify-center rounded-full transition duration-75"
		>
			<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<circle cx="5" cy="12" r="1.75" />
				<circle cx="12" cy="12" r="1.75" />
				<circle cx="19" cy="12" r="1.75" />
			</svg>
		</button>

		{#if menuOpen}
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<div
				bind:this={menuEl}
				role="menu"
				aria-label="Item actions"
				onkeydown={onMenuKeydown}
				class="border-line bg-surface shadow-card-strong z-dropdown absolute top-full right-0 mt-1 w-56 overflow-hidden rounded-lg border py-1"
			>
				{#each entries as entry (entry.id)}
					{#if entry.id === 'divider'}
						<div role="separator" class="bg-line my-1 h-px"></div>
					{:else}
						<button
							type="button"
							role="menuitem"
							onclick={() => choose(entry.id)}
							class="{rowClass} {entry.id === 'delete' ? 'text-clay' : 'text-ink'}"
						>
							{entry.label}
						</button>
					{/if}
				{/each}
			</div>
		{/if}
	</div>
{/if}
