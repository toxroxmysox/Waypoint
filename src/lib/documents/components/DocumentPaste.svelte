<script lang="ts">
	import { enhance } from '$app/forms';
	import { checkFile } from '$lib/documents/files';

	let {
		action = '?/uploadDocument',
		itemId = '',
		// When false, the window-level paste listener is detached (used by the add
		// sheet so it only catches Cmd+V while open). The button always works.
		listen = true,
		onUploaded
	}: {
		action?: string;
		itemId?: string;
		listen?: boolean;
		onUploaded?: () => void;
	} = $props();

	let fileInput = $state<HTMLInputElement | null>(null);
	let formEl = $state<HTMLFormElement | null>(null);
	let uploading = $state(false);
	let clientError = $state('');

	// The grabbed image, staged for an optional caption before it's sent.
	let pendingFile = $state<File | null>(null);
	let previewUrl = $state('');
	let caption = $state('');

	function ext(mime: string): string {
		const sub = (mime.split('/')[1] || 'png').toLowerCase();
		return sub === 'jpeg' ? 'jpg' : sub;
	}

	// Stage an image blob: validate, wrap as a File, show a preview. Clipboard
	// images are screenshots with no real filename — a generic name is fine (PB
	// adds a suffix; the caption is the human label).
	function acceptBlob(blob: Blob) {
		const mime = blob.type || 'image/png';
		const name = `pasted-screenshot.${ext(mime)}`;
		const check = checkFile({ type: mime, name, size: blob.size });
		if (!check.ok) {
			clientError = check.error ?? 'Unsupported image.';
			return;
		}
		clientError = '';
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		const file = new File([blob], name, { type: mime });
		pendingFile = file;
		previewUrl = URL.createObjectURL(file);
		caption = '';
	}

	// Button path — read the clipboard on an explicit tap (the one-tap action).
	async function pasteFromClipboard() {
		clientError = '';
		const read = navigator.clipboard?.read;
		if (!read) {
			clientError = 'Pasting isn’t supported here — use Upload instead.';
			return;
		}
		try {
			const items = await navigator.clipboard.read();
			for (const item of items) {
				const type = item.types.find((t) => t.startsWith('image/'));
				if (type) {
					acceptBlob(await item.getType(type));
					return;
				}
			}
			clientError = 'No image on the clipboard. Copy a screenshot first.';
		} catch {
			clientError = 'Couldn’t read the clipboard — copy an image, then allow access.';
		}
	}

	// Keyboard path — Cmd/Ctrl+V anywhere on the surface.
	function onWindowPaste(e: ClipboardEvent) {
		if (pendingFile || uploading) return;
		const items = e.clipboardData?.items;
		if (!items) return;
		for (const it of items) {
			if (it.kind === 'file' && it.type.startsWith('image/')) {
				const blob = it.getAsFile();
				if (blob) {
					e.preventDefault();
					acceptBlob(blob);
					return;
				}
			}
		}
	}

	function discard() {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = '';
		pendingFile = null;
		caption = '';
		clientError = '';
		if (fileInput) fileInput.value = '';
	}

	function submit() {
		formEl?.requestSubmit();
	}

	// Mirror the staged File into the real file input (forms can't take a File
	// programmatically except via DataTransfer) right before submit.
	$effect(() => {
		if (pendingFile && fileInput) {
			const dt = new DataTransfer();
			dt.items.add(pendingFile);
			fileInput.files = dt.files;
		}
	});
</script>

<svelte:window onpaste={listen ? onWindowPaste : undefined} />

<form
	bind:this={formEl}
	method="POST"
	{action}
	enctype="multipart/form-data"
	use:enhance={() => {
		uploading = true;
		return async ({ update, result }) => {
			uploading = false;
			if (result.type === 'success') {
				discard();
				onUploaded?.();
			}
			await update({ reset: false });
		};
	}}
>
	{#if itemId}
		<input type="hidden" name="item" value={itemId} />
	{/if}
	<input bind:this={fileInput} type="file" name="file" class="sr-only" tabindex="-1" />
	<input type="hidden" name="caption" value={caption} />

	{#if pendingFile && previewUrl}
		<!-- Staged paste: preview + optional caption before sending. -->
		<div class="border-line bg-surface space-y-3 rounded-lg border p-3">
			<div class="flex items-start gap-3">
				<img src={previewUrl} alt="Pasted screenshot preview" class="border-line h-16 w-16 shrink-0 rounded-md border object-cover" />
				<div class="min-w-0 flex-1">
					<label for="paste-caption" class="text-ink-soft mb-1 block text-[12px] font-medium">Caption (optional)</label>
					<input
						id="paste-caption"
						type="text"
						bind:value={caption}
						maxlength="500"
						placeholder="e.g. TAP boarding pass"
						class="border-line bg-paper text-ink w-full rounded-md border px-2.5 py-1.5 text-sm"
						onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
					/>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<button
					type="button"
					onclick={submit}
					disabled={uploading}
					class="bg-ink text-paper rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
				>
					{uploading ? 'Adding…' : 'Add image'}
				</button>
				<button type="button" onclick={discard} disabled={uploading} class="text-ink-muted text-sm">Cancel</button>
			</div>
		</div>
	{:else}
		<button
			type="button"
			onclick={pasteFromClipboard}
			class="border-line text-ink-soft hover:border-ink-muted hover:text-ink flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-sm font-medium transition-colors"
		>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
				<rect x="8" y="2" width="8" height="4" rx="1" />
				<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
			</svg>
			Paste image
		</button>
	{/if}

	{#if clientError}
		<p class="text-clay mt-2 text-center text-[12px]">{clientError}</p>
	{/if}
</form>
