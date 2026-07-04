<script lang="ts">
	// The one memory composer (#269, PRD §Composer): a photo slot + a 280-char
	// counted thought field. Reached from three doors (Note Before Bed, Trip Mode
	// Add, Closeout) — always this sheet. Saving upserts the (day, author)
	// record; clearing BOTH fields deletes it (the button says so). Input =
	// native file picker + clipboard paste, one image — same affordances as
	// Documents, no bespoke camera UI.
	import { enhance } from '$app/forms';
	import BottomSheet from '$lib/ui/BottomSheet.svelte';
	import { checkPhoto, decideMemorySave, isRenderablePhoto, MAX_THOUGHT_CHARS, PHOTO_ACCEPT } from '$lib/memory/memory';
	import type { Memory } from '$lib/memory/types';
	import { isStrippableImage, reencodeStripMetadata } from '$lib/image/strip-exif';

	let {
		open = $bindable(false),
		action = '?/saveMemory',
		dayId,
		existing = null,
		photoSrc = '',
		title = 'Your memory',
		subtitle = 'One photo, one thought — the day’s highlight.',
		onSaved
	}: {
		open?: boolean;
		action?: string;
		dayId: string;
		existing?: Memory | null;
		/** Proxy URL for the existing photo ('' when none). */
		photoSrc?: string;
		title?: string;
		subtitle?: string;
		onSaved?: () => void;
	} = $props();

	let fileInput = $state<HTMLInputElement | null>(null);
	let formEl = $state<HTMLFormElement | null>(null);
	let saving = $state(false);
	let clientError = $state('');

	let thought = $state('');
	let stagedFile = $state<File | null>(null);
	let stagedUrl = $state('');
	let removePhoto = $state(false);

	// Re-seed the composer whenever it opens (the same sheet serves different
	// days/records across the Closeout walk).
	$effect(() => {
		if (open) {
			thought = existing?.thought ?? '';
			removePhoto = false;
			clientError = '';
			discardStaged();
		}
	});

	const hasExistingPhoto = $derived(!!existing?.photo && !!photoSrc);
	const existingRenderable = $derived(!!existing?.photo && isRenderablePhoto(existing.photo));
	const saveOp = $derived(
		decideMemorySave({
			hasExisting: existing !== null,
			existingHasPhoto: !!existing?.photo,
			hasNewPhoto: stagedFile !== null,
			removePhoto,
			thought
		})
	);

	function discardStaged() {
		if (stagedUrl) URL.revokeObjectURL(stagedUrl);
		stagedUrl = '';
		stagedFile = null;
		if (fileInput) fileInput.value = '';
	}

	function stage(file: File) {
		const check = checkPhoto(file);
		if (!check.ok) {
			clientError = check.error ?? 'Unsupported image.';
			if (fileInput) fileInput.value = '';
			return;
		}
		clientError = '';
		if (stagedUrl) URL.revokeObjectURL(stagedUrl);
		stagedFile = file;
		// HEIC won't preview in the browser (v4 caveat) — show a filename chip instead.
		stagedUrl = isRenderablePhoto(file.name) ? URL.createObjectURL(file) : '';
		removePhoto = false;
	}

	function onPick() {
		const file = fileInput?.files?.[0];
		if (file) stage(file);
	}

	async function pasteFromClipboard() {
		clientError = '';
		if (!navigator.clipboard?.read) {
			clientError = 'Pasting isn’t supported here — use the photo picker instead.';
			return;
		}
		try {
			const items = await navigator.clipboard.read();
			for (const item of items) {
				const type = item.types.find((t) => t.startsWith('image/'));
				if (type) {
					const blob = await item.getType(type);
					const sub = (blob.type.split('/')[1] || 'png').toLowerCase();
					stage(new File([blob], `pasted-photo.${sub === 'jpeg' ? 'jpg' : sub}`, { type: blob.type }));
					return;
				}
			}
			clientError = 'No image on the clipboard.';
		} catch {
			clientError = 'Couldn’t read the clipboard — copy an image, then allow access.';
		}
	}

	// Cmd/Ctrl+V while the sheet is open.
	function onWindowPaste(e: ClipboardEvent) {
		if (!open || saving) return;
		const items = e.clipboardData?.items;
		if (!items) return;
		for (const it of items) {
			if (it.kind === 'file' && it.type.startsWith('image/')) {
				const blob = it.getAsFile();
				if (blob) {
					e.preventDefault();
					stage(blob);
					return;
				}
			}
		}
	}

	// Mirror the staged File into the real input right before submit (forms only
	// take Files via DataTransfer — same trick as DocumentPaste).
	$effect(() => {
		if (stagedFile && fileInput) {
			const dt = new DataTransfer();
			dt.items.add(stagedFile);
			fileInput.files = dt.files;
		}
	});
</script>

<svelte:window onpaste={onWindowPaste} />

<BottomSheet bind:open {title}>
	<form
		bind:this={formEl}
		method="POST"
		{action}
		enctype="multipart/form-data"
		use:enhance={async ({ formData }) => {
			// Strip EXIF/GPS before the photo leaves the browser (#290 — memory
			// photos are exactly the geo-tagged kind). Falls back to the original
			// (e.g. HEIC the browser can't decode); PB still gates type/size.
			const picked = formData.get('photo');
			if (picked instanceof File && picked.size > 0 && isStrippableImage(picked)) {
				try {
					formData.set('photo', await reencodeStripMetadata(picked));
				} catch {
					/* keep the original */
				}
			}
			saving = true;
			return async ({ update, result }) => {
				saving = false;
				if (result.type === 'success') {
					discardStaged();
					open = false;
					onSaved?.();
				}
				await update({ reset: false });
			};
		}}
		class="space-y-4"
	>
		<p class="text-ink-muted -mt-1 text-[12px]">{subtitle}</p>

		<input type="hidden" name="day_id" value={dayId} />
		<input type="hidden" name="remove_photo" value={removePhoto ? '1' : '0'} />
		<input
			bind:this={fileInput}
			type="file"
			name="photo"
			accept={PHOTO_ACCEPT}
			class="sr-only"
			tabindex="-1"
			onchange={onPick}
		/>

		<!-- Photo slot: empty → add; filled → preview + replace/remove (PRD §Composer). -->
		{#if stagedFile}
			<div class="border-line bg-surface flex items-center gap-3 rounded-xl border p-2.5">
				{#if stagedUrl}
					<img src={stagedUrl} alt="Staged preview" class="border-line h-20 w-20 shrink-0 rounded-lg border object-cover" />
				{:else}
					<div class="bg-paper text-ink-muted flex h-20 w-20 shrink-0 items-center justify-center rounded-lg text-[10px]">HEIC</div>
				{/if}
				<div class="min-w-0 flex-1">
					<p class="text-ink-soft truncate text-sm">{stagedFile.name}</p>
					<button type="button" onclick={discardStaged} class="text-ink-muted mt-1 text-xs underline-offset-2 hover:underline">Remove</button>
				</div>
			</div>
		{:else if hasExistingPhoto && !removePhoto}
			<div class="border-line bg-surface flex items-center gap-3 rounded-xl border p-2.5">
				{#if existingRenderable}
					<img src={photoSrc} alt="Your memory" class="border-line h-20 w-20 shrink-0 rounded-lg border object-cover" />
				{:else}
					<div class="bg-paper text-ink-muted flex h-20 w-20 shrink-0 items-center justify-center rounded-lg text-[10px]">HEIC</div>
				{/if}
				<div class="flex min-w-0 flex-1 flex-col items-start gap-1">
					<button type="button" onclick={() => fileInput?.click()} class="text-ink-soft text-xs font-medium underline-offset-2 hover:underline">Replace photo</button>
					<button type="button" onclick={() => (removePhoto = true)} class="text-ink-muted text-xs underline-offset-2 hover:underline">Remove photo</button>
				</div>
			</div>
		{:else}
			<div class="flex gap-2">
				<button
					type="button"
					onclick={() => fileInput?.click()}
					class="border-line text-ink-soft hover:border-ink-muted hover:text-ink flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-4 text-sm font-medium transition-colors"
				>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
						<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
						<circle cx="8.5" cy="8.5" r="1.5" />
						<polyline points="21 15 16 10 5 21" />
					</svg>
					Add photo
				</button>
				<button
					type="button"
					onclick={pasteFromClipboard}
					class="border-line text-ink-soft hover:border-ink-muted hover:text-ink flex items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-4 text-sm font-medium transition-colors"
					aria-label="Paste image from clipboard"
				>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
						<rect x="8" y="2" width="8" height="4" rx="1" />
						<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
					</svg>
					Paste
				</button>
			</div>
			{#if removePhoto && existing?.photo}
				<p class="text-ink-muted -mt-2 text-[12px]">
					Photo will be removed when you save.
					<button type="button" onclick={() => (removePhoto = false)} class="underline underline-offset-2">Undo</button>
				</p>
			{/if}
		{/if}

		<!-- One thought, tweet-length. -->
		<div>
			<label for="memory-thought" class="sr-only">Thought</label>
			<textarea
				id="memory-thought"
				name="thought"
				bind:value={thought}
				maxlength={MAX_THOUGHT_CHARS}
				rows="3"
				placeholder="One thought about today…"
				class="border-line bg-paper text-ink placeholder:text-ink-muted w-full resize-none rounded-xl border px-3 py-2.5 text-sm"
			></textarea>
			<p class="text-ink-muted mt-1 text-right text-[11px]">{thought.length}/{MAX_THOUGHT_CHARS}</p>
		</div>

		{#if clientError}
			<p class="text-clay text-center text-[12px]">{clientError}</p>
		{/if}

		<button
			type="submit"
			disabled={saving || saveOp === 'reject_empty'}
			class="bg-ink text-paper w-full rounded-lg px-4 py-3 text-sm font-medium disabled:opacity-40"
		>
			{#if saving}
				Saving…
			{:else if saveOp === 'delete'}
				Remove memory
			{:else}
				Save memory
			{/if}
		</button>
		{#if saveOp === 'delete'}
			<p class="text-ink-muted -mt-2 text-center text-[11px]">Both fields are empty — saving removes this memory.</p>
		{/if}
	</form>
</BottomSheet>
