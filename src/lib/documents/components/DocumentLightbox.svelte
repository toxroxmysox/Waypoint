<script lang="ts">
	import type { DocumentView } from '$lib/documents/types';
	import { documentLabel } from '$lib/documents/files';

	let { doc = $bindable(null) }: { doc?: DocumentView | null } = $props();

	const label = $derived(doc ? documentLabel(doc.caption, doc.file) : '');

	function close() {
		doc = null;
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}
</script>

<svelte:window onkeydown={doc ? onkeydown : undefined} />

{#if doc}
	<div
		class="z-overlay fixed inset-0 flex flex-col bg-ink/90 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-label={label}
	>
		<!-- Toolbar -->
		<div class="flex items-center justify-between gap-3 px-4 py-3 text-paper">
			<p class="min-w-0 flex-1 truncate text-sm font-medium">{label}</p>
			<div class="flex shrink-0 items-center gap-2">
				<a
					href={doc.file_href}
					target="_blank"
					rel="noopener"
					class="rounded-md px-2.5 py-1.5 text-xs font-semibold text-paper/90 hover:bg-paper/10"
				>
					Open
				</a>
				<a
					href="{doc.file_href}?download=1"
					download
					class="rounded-md px-2.5 py-1.5 text-xs font-semibold text-paper/90 hover:bg-paper/10"
				>
					Save
				</a>
				<button
					type="button"
					onclick={close}
					class="flex h-8 w-8 items-center justify-center rounded-md text-paper/90 hover:bg-paper/10"
					aria-label="Close"
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
				</button>
			</div>
		</div>

		<!-- Image stage. The backdrop button (behind) closes on click; the image
		     sits above it so clicking the image itself does nothing. -->
		<div class="relative flex flex-1 items-center justify-center overflow-auto p-4">
			<button type="button" class="absolute inset-0 cursor-zoom-out" aria-label="Close" onclick={close}></button>
			<img src={doc.file_href} alt={label} class="relative max-h-full max-w-full object-contain" />
		</div>
	</div>
{/if}
