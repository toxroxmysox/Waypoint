<script lang="ts">
	import { enhance } from '$app/forms';
	import { FILE_ACCEPT, checkFile } from '$lib/documents/files';
	import { isStrippableImage, reencodeStripMetadata } from '$lib/image/strip-exif';

	let {
		action = '?/uploadDocument',
		itemId = '',
		label = 'Upload',
		hint = '',
		onUploaded
	}: {
		// Form action URL.
		action?: string;
		// When set, the document is scoped to this item (hidden `item` input).
		itemId?: string;
		label?: string;
		hint?: string;
		onUploaded?: () => void;
	} = $props();

	let fileInput = $state<HTMLInputElement | null>(null);
	let formEl = $state<HTMLFormElement | null>(null);
	let uploading = $state(false);
	let uploadingName = $state('');
	let clientError = $state('');

	function pick() {
		clientError = '';
		fileInput?.click();
	}

	function onChange() {
		clientError = '';
		const file = fileInput?.files?.[0];
		if (!file) return;
		// Client pre-check for a fast message; PB mimeTypes/maxSize is the real gate.
		const check = checkFile(file);
		if (!check.ok) {
			clientError = check.error ?? 'Unsupported file.';
			if (fileInput) fileInput.value = '';
			return;
		}
		uploadingName = file.name;
		formEl?.requestSubmit();
	}
</script>

<form
	bind:this={formEl}
	method="POST"
	{action}
	enctype="multipart/form-data"
	use:enhance={async ({ formData }) => {
		// Strip EXIF/GPS from image uploads before they leave the browser (#290).
		// Canvas re-encode drops all metadata; HEIC is transcoded to JPEG where the
		// browser can decode it. If the strip fails (e.g. HEIC on Chrome/Firefox),
		// fall back to the original — PB still gates type/size.
		const picked = formData.get('file');
		if (picked instanceof File && picked.size > 0 && isStrippableImage(picked)) {
			try {
				formData.set('file', await reencodeStripMetadata(picked));
			} catch {
				// keep the original file
			}
		}
		uploading = true;
		return async ({ update, result }) => {
			uploading = false;
			uploadingName = '';
			if (fileInput) fileInput.value = '';
			if (result.type === 'success') onUploaded?.();
			await update({ reset: false });
		};
	}}
>
	{#if itemId}
		<input type="hidden" name="item" value={itemId} />
	{/if}
	<input
		bind:this={fileInput}
		type="file"
		name="file"
		accept={FILE_ACCEPT}
		class="sr-only"
		onchange={onChange}
		tabindex="-1"
	/>

	{#if uploading}
		<!-- In-row upload progress. Indeterminate: server-side form action gives no
		     byte progress, so this is a pending state, not a percentage. -->
		<div class="border-line bg-surface flex items-center gap-3 rounded-lg border p-2.5">
			<div class="bg-paper h-[46px] w-[46px] shrink-0 animate-pulse rounded-md"></div>
			<div class="min-w-0 flex-1">
				<p class="text-ink-soft truncate text-sm">Uploading {uploadingName}…</p>
				<div class="bg-line mt-2 h-1 w-full overflow-hidden rounded-full">
					<div class="bg-moss h-full w-1/3 animate-[doc-progress_1.1s_ease-in-out_infinite] rounded-full"></div>
				</div>
			</div>
		</div>
	{:else}
		<button
			type="button"
			onclick={pick}
			class="border-line text-ink-soft hover:border-ink-muted hover:text-ink flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-sm font-medium transition-colors"
		>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
				<polyline points="17 8 12 3 7 8" />
				<line x1="12" y1="3" x2="12" y2="15" />
			</svg>
			{label}
		</button>
		{#if hint}
			<p class="text-ink-muted mt-1.5 text-center text-[12px]">{hint}</p>
		{/if}
	{/if}

	{#if clientError}
		<p class="text-clay mt-2 text-center text-[12px]">{clientError}</p>
	{/if}
</form>

<style>
	@keyframes doc-progress {
		0% { transform: translateX(-100%); }
		100% { transform: translateX(400%); }
	}
</style>
