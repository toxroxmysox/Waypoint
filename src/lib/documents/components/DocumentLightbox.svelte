<script lang="ts">
	import { enhance } from '$app/forms';
	import type { DocumentView } from '$lib/documents/types';
	import { documentLabel } from '$lib/documents/files';
	import { isCached } from '$lib/documents/offline-cache';

	let {
		// The renderable images to page through. The lightbox shows gallery[index].
		gallery = [],
		index = $bindable(null),
		canDelete = false,
		deleteAction = '?/deleteDocument',
		onDeleted
	}: {
		gallery?: DocumentView[];
		index?: number | null;
		canDelete?: boolean | ((doc: DocumentView) => boolean);
		deleteAction?: string;
		onDeleted?: (doc: DocumentView) => void;
	} = $props();

	const doc = $derived(index !== null ? (gallery[index] ?? null) : null);
	const label = $derived(doc ? documentLabel(doc.caption, doc.file) : '');
	const hasPrev = $derived(index !== null && index > 0);
	const hasNext = $derived(index !== null && index < gallery.length - 1);
	const deletable = $derived(
		doc ? (typeof canDelete === 'function' ? canDelete(doc) : canDelete) : false
	);

	// Web Share is absent on most desktop browsers — hide the button there (PRD).
	const shareSupported = typeof navigator !== 'undefined' && !!navigator.share;

	let confirming = $state(false);
	let deleting = $state(false);
	let sharing = $state(false);
	let savedOffline = $state(false);

	function close() {
		index = null;
		confirming = false;
	}
	function prev() {
		if (hasPrev) index = (index ?? 0) - 1;
	}
	function next() {
		if (hasNext) index = (index ?? 0) + 1;
	}

	// Offline-availability truth, same source as the row tick (caches.match).
	$effect(() => {
		savedOffline = false;
		const href = doc?.file_href;
		if (!href) return;
		let alive = true;
		isCached(href).then((hit) => {
			if (alive) savedOffline = hit;
		});
		return () => {
			alive = false;
		};
	});

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
		else if (e.key === 'ArrowLeft') prev();
		else if (e.key === 'ArrowRight') next();
	}

	// Touch swipe between images.
	let touchX = 0;
	function onTouchStart(e: TouchEvent) {
		touchX = e.changedTouches[0]?.clientX ?? 0;
	}
	function onTouchEnd(e: TouchEvent) {
		const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX;
		if (Math.abs(dx) < 50) return;
		if (dx > 0) prev();
		else next();
	}

	async function share() {
		if (!doc || sharing) return;
		sharing = true;
		try {
			const res = await fetch(doc.file_href);
			const blob = await res.blob();
			const file = new File([blob], label || 'document', { type: blob.type });
			const data = { files: [file], title: label };
			if (navigator.canShare?.(data)) {
				await navigator.share(data);
			} else {
				await navigator.share({ title: label, text: label });
			}
		} catch {
			// User cancelled or share unavailable — silent (no destructive action).
		} finally {
			sharing = false;
		}
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
			<div class="flex min-w-0 flex-1 items-center gap-2">
				<p class="min-w-0 truncate text-sm font-medium">{label}</p>
				{#if gallery.length > 1}
					<span class="text-paper/60 shrink-0 font-mono text-xs tabular-nums">{(index ?? 0) + 1}/{gallery.length}</span>
				{/if}
				{#if savedOffline}
					<span class="bg-moss/20 text-moss-tint shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold">Saved offline</span>
				{/if}
			</div>
			<div class="flex shrink-0 items-center gap-1">
				{#if shareSupported}
					<button
						type="button"
						onclick={share}
						disabled={sharing}
						class="rounded-md px-2.5 py-1.5 text-xs font-semibold text-paper/90 hover:bg-paper/10 disabled:opacity-40"
					>
						Share
					</button>
				{/if}
				<a href={doc.file_href} target="_blank" rel="noopener" class="rounded-md px-2.5 py-1.5 text-xs font-semibold text-paper/90 hover:bg-paper/10">Open</a>
				<a href="{doc.file_href}?download=1" download class="rounded-md px-2.5 py-1.5 text-xs font-semibold text-paper/90 hover:bg-paper/10">Save</a>
				{#if deletable}
					{#if !confirming}
						<button type="button" onclick={() => (confirming = true)} class="rounded-md px-2.5 py-1.5 text-xs font-semibold text-paper/90 hover:bg-paper/10">Delete</button>
					{:else}
						<form
							method="POST"
							action={deleteAction}
							use:enhance={() => {
								deleting = true;
								return async ({ update, result }) => {
									deleting = false;
									confirming = false;
									if (result.type === 'success') {
										const removed = doc;
										close();
										if (removed) onDeleted?.(removed);
									}
									await update({ reset: false });
								};
							}}
							class="flex items-center gap-1.5"
						>
							<input type="hidden" name="document_id" value={doc.id} />
							<button type="submit" disabled={deleting} class="bg-clay text-paper rounded-md px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40">
								{deleting ? 'Deleting…' : 'Confirm'}
							</button>
							<button type="button" onclick={() => (confirming = false)} class="text-paper/70 px-1.5 text-xs">Cancel</button>
						</form>
					{/if}
				{/if}
				<button type="button" onclick={close} class="flex h-8 w-8 items-center justify-center rounded-md text-paper/90 hover:bg-paper/10" aria-label="Close">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
				</button>
			</div>
		</div>

		<!-- Image stage. Backdrop button (behind) closes on click; the image sits
		     above it. Swipe left/right pages through the gallery. -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="relative flex flex-1 items-center justify-center overflow-hidden p-4"
			ontouchstart={onTouchStart}
			ontouchend={onTouchEnd}
		>
			<button type="button" class="absolute inset-0 cursor-zoom-out" aria-label="Close" onclick={close}></button>
			<img src={doc.file_href} alt={label} class="relative max-h-full max-w-full object-contain" />

			{#if hasPrev}
				<button type="button" onclick={prev} aria-label="Previous" class="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-ink/40 text-paper hover:bg-ink/60">
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
				</button>
			{/if}
			{#if hasNext}
				<button type="button" onclick={next} aria-label="Next" class="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-ink/40 text-paper hover:bg-ink/60">
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
				</button>
			{/if}
		</div>
	</div>
{/if}
