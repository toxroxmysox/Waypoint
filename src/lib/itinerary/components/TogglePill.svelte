<script lang="ts">
	// Toggle pill with a small square check (e.g. "Hide done" on the checklist
	// detail, #49). Moss when on. Translated from source-jsx → TogglePill.
	import type { Snippet } from 'svelte';

	let {
		on = $bindable(false),
		children
	}: {
		on?: boolean;
		children: Snippet;
	} = $props();
</script>

<button
	type="button"
	onclick={() => (on = !on)}
	aria-pressed={on}
	class="inline-flex items-center gap-1.5 rounded-full border py-[5px] pr-[11px] pl-[9px] text-[11.5px] font-semibold transition-colors {on
		? 'border-moss bg-moss-tint text-moss'
		: 'border-line bg-surface text-ink-soft'}"
>
	<span
		class="flex h-[13px] w-[13px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px] {on
			? 'border-moss bg-moss text-paper'
			: 'border-line bg-surface'}"
	>
		{#if on}
			<svg width="8" height="8" viewBox="0 0 12 12" fill="none">
				<path d="M2.5 6.2l2.3 2.3L9.5 3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		{/if}
	</span>
	{@render children()}
</button>
