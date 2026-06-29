<script lang="ts">
	import { toast } from '$lib/shell/stores/toast';
	import type { ConfirmationCode } from '$lib/itinerary/types';

	// #268 / ADR-0016 — a confirmation code is NOT a file card. It renders as a
	// distinct, pill-shaped chip (`label: value`) whose value is tap-to-copy. No
	// "added by" attribution (Scott's call — `uploaded_by` is hidden for codes).
	// iOS PWA has no usable haptics, so the copy confirmation is purely the toast.
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
	data-testid="code-chip"
	title="Tap to copy"
	class="bg-gold-tint border-gold/25 hover:border-gold/45 focus-visible:ring-gold/40 inline-flex max-w-full items-center gap-2 rounded-full border py-1.5 pr-2.5 pl-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
>
	{#if code.label}
		<span class="text-gold shrink-0 text-[11px] font-semibold tracking-wide uppercase opacity-80">{code.label}</span>
	{/if}
	<span class="text-ink truncate font-mono text-sm font-semibold">{code.value}</span>
	<span class="text-gold/90 shrink-0" aria-hidden="true">
		{#if copied}
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
		{:else}
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="13" height="13" x="9" y="9" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
		{/if}
	</span>
	<span class="sr-only">Copy code {code.label} {code.value}</span>
</button>
