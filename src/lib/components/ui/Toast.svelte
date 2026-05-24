<script lang="ts">
	import { toast } from '$lib/stores/toast';
	import { fly, fade } from 'svelte/transition';

	let current = $derived($toast);
</script>

{#if current}
	<div
		class="toast-position pointer-events-none fixed z-50"
		role="status"
		aria-live="polite"
	>
		<div
			class="pointer-events-auto inline-flex items-center gap-2 rounded-[14px] px-3 py-2.5 text-sm font-medium shadow-dropdown
				{current.variant === 'success' ? 'border-moss/20 bg-moss-tint text-moss border' : ''}
				{current.variant === 'error' ? 'border-error/20 bg-error/10 text-error-deep border' : ''}
				{current.variant === 'info' ? 'border border-sky-200 bg-sky-50 text-sky-700' : ''}"
			in:fly={{ y: 20, duration: 250 }}
			out:fade={{ duration: 150 }}
		>
			{#if current.variant === 'success'}
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
			{:else if current.variant === 'error'}
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
			{:else}
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
			{/if}
			<span>{current.message}</span>
			<button
				type="button"
				onclick={() => toast.dismiss()}
				class="ml-1 rounded-full p-0.5 opacity-60 hover:opacity-100"
				aria-label="Dismiss"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
			</button>
		</div>
	</div>
{/if}

<style>
	.toast-position {
		left: 50%;
		transform: translateX(-50%);
		bottom: calc(env(safe-area-inset-bottom, 0px) + 7.5rem);
	}
	@media (min-width: 1024px) {
		.toast-position {
			left: auto;
			transform: none;
			right: 1.5rem;
			top: 1.5rem;
			bottom: auto;
		}
	}
</style>
