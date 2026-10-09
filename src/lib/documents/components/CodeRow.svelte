<script lang="ts">
	import { toast } from '$lib/shell/stores/toast';
	import type { ConfirmationCode } from '$lib/itinerary/types';

	// #428 — a confirmation code as a LARGE tap-to-copy row (Hero: "show it at the
	// counter"). Ink, mono, no gold (CARD_SYSTEM D10: a code is settled, not an open
	// loop). 56px tall, so well past the 44px hit area. CodeChip stays the compact
	// pill for dense lists. Copy confirms with the toast (iOS PWA has no haptics).
	let { code }: { code: ConfirmationCode } = $props();

	let copied = $state(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(code.value);
			copied = true;
			toast.show('Code copied');
			setTimeout(() => (copied = false), 1500);
		} catch {
			toast.show('Could not copy — long-press to copy the code');
		}
	}
</script>

<button
	type="button"
	onclick={copy}
	data-testid="code-row"
	class="bg-surface-2 border-line hover:border-ink-muted active:border-ink-muted focus-visible:ring-ink-muted/40 flex min-h-14 w-full items-center gap-3 rounded-lg border px-4 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
>
	<span class="min-w-0 flex-1">
		{#if code.label}
			<span class="text-ink-muted block text-[11px] font-semibold tracking-wide uppercase">{code.label}</span>
		{/if}
		<span class="text-ink block truncate font-mono text-xl leading-tight font-semibold tracking-wide">{code.value}</span>
	</span>
	<span class="text-ink-soft flex shrink-0 items-center gap-1 text-xs font-medium" aria-hidden="true">
		{#if copied}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
			Copied
		{:else}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="13" height="13" x="9" y="9" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
			Copy
		{/if}
	</span>
	<span class="sr-only">Copy code {code.label} {code.value}</span>
</button>
