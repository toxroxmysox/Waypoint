<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { reducedMotion } from '$lib/shell/stores/reduced-motion';

	let {
		open = $bindable(false),
		title = '',
		children
	}: {
		open: boolean;
		title?: string;
		children: Snippet;
	} = $props();

	let noMotion = $derived($reducedMotion);

	const flyParams = $derived(
		noMotion
			? { y: 0, duration: 0 }
			: { y: 300, duration: 250, easing: (t: number) => 1 - Math.pow(1 - t, 3) }
	);

	const fadeParams = $derived(noMotion ? { duration: 0 } : { duration: 200 });

	function onBackdropClick() {
		open = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-modal flex items-end justify-center"
		onkeydown={onKeydown}
	>
		<div
			class="fixed inset-0 bg-black/40"
			onclick={onBackdropClick}
			role="presentation"
			transition:fade={fadeParams}
		></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="relative w-full max-w-lg rounded-t-xl bg-surface shadow-card-strong max-h-[85vh] overflow-y-auto z-overlay"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			transition:fly={flyParams}
		>
			<div class="flex items-center justify-between border-b border-line px-4 py-3">
				<h2 class="font-display text-base font-semibold text-ink">{title}</h2>
				<button
					type="button"
					class="text-ink-muted hover:text-ink p-1"
					onclick={() => (open = false)}
					aria-label="Close"
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M18 6 6 18M6 6l12 12" />
					</svg>
				</button>
			</div>
			<div class="p-4">
				{@render children()}
			</div>
		</div>
	</div>
{/if}
