<script lang="ts">
	import { enhance } from '$app/forms';
	import Avatar from '$lib/ui/Avatar.svelte';
	import type { DocumentView } from '$lib/documents/types';
	import { documentLabel, isRenderableImage, relativeTime } from '$lib/documents/files';
	import { isCached } from '$lib/documents/offline-cache';

	let {
		doc,
		canDelete = false,
		showItemName = false,
		deleteAction = '?/deleteDocument',
		onView,
		onDeleted
	}: {
		doc: DocumentView;
		canDelete?: boolean;
		showItemName?: boolean;
		deleteAction?: string;
		onView?: (doc: DocumentView) => void;
		onDeleted?: (doc: DocumentView) => void;
	} = $props();

	const label = $derived(documentLabel(doc.caption, doc.file));
	const renderable = $derived(isRenderableImage(doc.file));
	const when = $derived(relativeTime(doc.created));

	let menuOpen = $state(false);
	let confirming = $state(false);
	let deleting = $state(false);

	// Truthful offline tick: this file's bytes are actually in Cache Storage
	// (caches.match) — not an assumption. Absent = not cached yet (PRD S5/D5).
	let cached = $state(false);
	$effect(() => {
		let alive = true;
		isCached(doc.file_href).then((hit) => {
			if (alive) cached = hit;
		});
		return () => {
			alive = false;
		};
	});

	function view() {
		// Renderable images open in the in-app lightbox; PDFs/HEIC open natively.
		if (renderable && onView) onView(doc);
		else window.open(doc.file_href, '_blank', 'noopener');
	}
</script>

<div class="border-line bg-surface flex items-center gap-3 rounded-lg border p-2.5">
	<!-- Media square: thumbnail for images, file-type glyph otherwise. -->
	{#if renderable}
		<button
			type="button"
			onclick={view}
			class="border-line h-[46px] w-[46px] shrink-0 overflow-hidden rounded-md border bg-paper"
			aria-label="View {label}"
		>
			<img src={doc.file_href} alt={label} loading="lazy" decoding="async" class="h-full w-full object-cover" />
		</button>
	{:else}
		<a
			href={doc.file_href}
			target="_blank"
			rel="noopener"
			class="bg-clay-tint text-clay flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-md"
			aria-label="Open {label}"
		>
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
				<polyline points="14 2 14 8 20 8" />
			</svg>
		</a>
	{/if}

	<!-- Label + meta. -->
	<div class="min-w-0 flex-1">
		<p class="text-ink truncate text-sm font-medium">{label}</p>
		<div class="text-ink-muted mt-0.5 flex items-center gap-1.5 text-[12px]">
			<Avatar
				initial={doc.uploader_name}
				alt={doc.uploader_name}
				placeholder={!doc.uploader_name}
				size={16}
			/>
			<span class="truncate">{doc.uploader_name || 'Member'}</span>
			{#if when}
				<span aria-hidden="true">·</span>
				<span class="shrink-0">{when}</span>
			{/if}
			{#if showItemName && doc.item_title}
				<span aria-hidden="true">·</span>
				<span class="truncate italic">{doc.item_title}</span>
			{/if}
			{#if cached}
				<span class="text-moss/85 inline-flex shrink-0 items-center" title="Saved offline" aria-label="Saved offline">
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
						<polyline points="7 10 12 15 17 10" />
						<line x1="12" y1="15" x2="12" y2="3" />
					</svg>
				</span>
			{/if}
		</div>
	</div>

	<!-- Kebab menu: view / download / delete (gated). -->
	<div class="relative shrink-0">
		<button
			type="button"
			onclick={() => (menuOpen = !menuOpen)}
			class="text-ink-muted hover:text-ink-soft flex h-8 w-8 items-center justify-center rounded-md"
			aria-label="Document actions"
			aria-haspopup="menu"
			aria-expanded={menuOpen}
		>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
		</button>

		{#if menuOpen}
			<!-- Click-away backdrop. -->
			<button type="button" class="fixed inset-0 z-dropdown cursor-default" aria-hidden="true" tabindex="-1" onclick={() => (menuOpen = false)}></button>
			<div role="menu" class="border-line bg-surface shadow-dropdown absolute right-0 z-dropdown mt-1 w-40 overflow-hidden rounded-lg border py-1 text-sm">
				<button
					type="button"
					role="menuitem"
					class="text-ink-soft hover:bg-paper flex w-full items-center gap-2 px-3 py-2 text-left"
					onclick={() => { menuOpen = false; view(); }}
				>
					{renderable ? 'View' : 'Open'}
				</button>
				<a
					role="menuitem"
					href="{doc.file_href}?download=1"
					download
					class="text-ink-soft hover:bg-paper flex w-full items-center gap-2 px-3 py-2 text-left"
					onclick={() => (menuOpen = false)}
				>
					Download
				</a>
				{#if canDelete}
					{#if !confirming}
						<button
							type="button"
							role="menuitem"
							class="text-error hover:bg-error/5 flex w-full items-center gap-2 px-3 py-2 text-left"
							onclick={() => (confirming = true)}
						>
							Delete
						</button>
					{:else}
						<form
							method="POST"
							action={deleteAction}
							use:enhance={() => {
								deleting = true;
								return async ({ update, result }) => {
									deleting = false;
									menuOpen = false;
									confirming = false;
									if (result.type === 'success') onDeleted?.(doc);
									await update({ reset: false });
								};
							}}
							class="border-line border-t px-3 py-2"
						>
							<input type="hidden" name="document_id" value={doc.id} />
							<p class="text-ink-muted mb-1.5 text-[12px]">Delete this document?</p>
							<div class="flex items-center gap-2">
								<button type="submit" disabled={deleting} class="bg-error text-paper rounded-md px-2.5 py-1 text-xs font-semibold disabled:opacity-40">
									{deleting ? 'Deleting…' : 'Delete'}
								</button>
								<button type="button" onclick={() => (confirming = false)} class="text-ink-muted text-xs">Cancel</button>
							</div>
						</form>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</div>
