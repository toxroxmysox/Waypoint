<script lang="ts">
	import { toast } from '$lib/shell/stores/toast';
	import type { ConfirmationCode } from '$lib/itinerary/types';

	// #434 — the copy action on a confirmation-code Row (Trip Documents). Sits outside
	// the Row's link, 44px square, ink (a code is settled: no gold, D10). Copy
	// confirms with the toast; iOS PWA has no usable haptics.
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
	data-testid="code-copy"
	class="text-ink-soft hover:text-ink active:text-ink focus-visible:ring-ink-muted/40 -mr-3 flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-lg focus-visible:ring-2 focus-visible:outline-none"
>
	{#if copied}
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
	{:else}
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="13" height="13" x="9" y="9" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
	{/if}
	<span class="sr-only">Copy code {code.label} {code.value}</span>
</button>
