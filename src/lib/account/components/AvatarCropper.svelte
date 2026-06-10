<script lang="ts">
	import Button from '$lib/ui/Button.svelte';
	import {
		coverScale,
		cropToWebp,
		maxOffset,
		type CropView
	} from '$lib/account/avatar-crop';

	// Sheet *content* only — the parent owns the BottomSheet and its open state
	// (the proven two-layer bind pattern). This component mounts fresh each time
	// the sheet opens, so the file effect resets the view automatically.
	let {
		file,
		onCropped,
		onCancel
	}: {
		/** The image the user picked. */
		file?: File | null;
		/** Called with the 512² webp blob when the user saves. */
		onCropped?: (blob: Blob) => void;
		onCancel?: () => void;
	} = $props();

	// Square viewport edge in display px (the circular mask). Kept comfortably
	// under 375px with sheet padding.
	const VIEWPORT = 280;

	let img = $state<HTMLImageElement | null>(null);
	let naturalWidth = $state(0);
	let naturalHeight = $state(0);
	let loadError = $state('');
	let saving = $state(false);

	let zoom = $state(1);
	let offsetX = $state(0);
	let offsetY = $state(0);
	let objectUrl = '';

	// Load the picked file into a decoded Image and reset the view.
	$effect(() => {
		const f = file;
		if (!f) return;
		loadError = '';
		const url = URL.createObjectURL(f);
		const image = new Image();
		image.onload = () => {
			if (objectUrl) URL.revokeObjectURL(objectUrl);
			objectUrl = url;
			img = image;
			naturalWidth = image.naturalWidth;
			naturalHeight = image.naturalHeight;
			zoom = 1;
			offsetX = 0;
			offsetY = 0;
		};
		image.onerror = () => {
			URL.revokeObjectURL(url);
			loadError = "That image couldn't be read. Try another file.";
		};
		image.src = url;
		return () => {
			if (url !== objectUrl) URL.revokeObjectURL(url);
		};
	});

	$effect(() => () => {
		if (objectUrl) URL.revokeObjectURL(objectUrl);
	});

	const scale = $derived(
		naturalWidth && naturalHeight ? coverScale(naturalWidth, naturalHeight, VIEWPORT) * zoom : 1
	);
	const dispW = $derived(naturalWidth * scale);
	const dispH = $derived(naturalHeight * scale);

	// Clamp the committed offsets to the current zoom's slack. Called from the
	// drag and zoom handlers (never an effect — no read/write reactive cycle).
	function clampOffsets() {
		if (!naturalWidth || !naturalHeight) return;
		const m = maxOffset({ naturalWidth, naturalHeight, viewport: VIEWPORT, zoom });
		offsetX = Math.min(Math.max(offsetX, -m.x), m.x);
		offsetY = Math.min(Math.max(offsetY, -m.y), m.y);
	}

	function onZoom(e: Event) {
		zoom = Number((e.currentTarget as HTMLInputElement).value);
		clampOffsets();
	}

	// --- Drag to recenter (pointer events: mouse + touch + pen) ---
	let dragging = false;
	let startX = 0;
	let startY = 0;
	let startOffX = 0;
	let startOffY = 0;

	function onPointerDown(e: PointerEvent) {
		if (!img) return;
		dragging = true;
		startX = e.clientX;
		startY = e.clientY;
		startOffX = offsetX;
		startOffY = offsetY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		offsetX = startOffX + (e.clientX - startX);
		offsetY = startOffY + (e.clientY - startY);
		clampOffsets();
	}
	function onPointerUp(e: PointerEvent) {
		dragging = false;
		try {
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {
			// pointer already released
		}
	}

	async function save() {
		if (!img) return;
		saving = true;
		try {
			const view: CropView = {
				naturalWidth,
				naturalHeight,
				viewport: VIEWPORT,
				zoom,
				offsetX,
				offsetY
			};
			const blob = await cropToWebp(img, view);
			onCropped?.(blob);
		} catch {
			loadError = 'Could not process that image. Try another.';
		} finally {
			saving = false;
		}
	}
</script>

{#if loadError}
	<p role="alert" class="text-error-deep bg-error/10 border-error/20 mb-4 rounded-md border p-3 text-sm">
		{loadError}
	</p>
{/if}

<div class="flex flex-col items-center gap-5">
	<!-- Circular-masked viewport. The image sits at center + drag offset,
	     cover-scaled by zoom; the round overlay shows the final crop. -->
	<div
		class="relative touch-none overflow-hidden rounded-full bg-surface-2 select-none"
		style="width:{VIEWPORT}px;height:{VIEWPORT}px;"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		role="application"
		aria-label="Drag to reposition your photo"
	>
		{#if img}
			<img
				src={img.src}
				alt=""
				draggable="false"
				class="pointer-events-none absolute top-1/2 left-1/2 max-w-none"
				style="width:{dispW}px;height:{dispH}px;transform:translate(-50%,-50%) translate({offsetX}px,{offsetY}px);"
			/>
			<div
				class="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-black/10"
				aria-hidden="true"
			></div>
		{:else}
			<div class="absolute inset-0 animate-pulse"></div>
		{/if}
	</div>

	<label class="flex w-full max-w-[280px] items-center gap-3">
		<span class="text-ink-muted" aria-hidden="true">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
		</span>
		<span class="sr-only">Zoom</span>
		<input
			type="range"
			min="1"
			max="3"
			step="0.01"
			value={zoom}
			oninput={onZoom}
			disabled={!img}
			class="accent-moss h-1 flex-1 cursor-pointer"
			aria-label="Zoom"
		/>
		<span class="text-ink-muted" aria-hidden="true">
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
		</span>
	</label>

	<div class="flex w-full gap-2">
		<Button variant="ghost" size="md" class="flex-1" onclick={() => onCancel?.()}>Cancel</Button>
		<Button variant="moss" size="md" class="flex-1" loading={saving} disabled={!img} onclick={save}>
			Save photo
		</Button>
	</div>
</div>
