<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		title = '',
		children
	}: {
		open: boolean;
		title?: string;
		children: Snippet;
	} = $props();

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
		class="fixed inset-0 z-modal flex items-end justify-center bg-black/40"
		onclick={onBackdropClick}
		onkeydown={onKeydown}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="w-full max-w-lg rounded-t-xl bg-surface shadow-card-strong animate-slide-up max-h-[85vh] overflow-y-auto z-overlay"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
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

<style>
	@keyframes slide-up {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}
	.animate-slide-up {
		animation: slide-up 0.25s ease-out;
	}
</style>
