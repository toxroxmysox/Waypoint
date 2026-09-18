<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick, untrack } from 'svelte';
	import type { DocumentView } from '$lib/documents/types';
	import { documentLabel } from '$lib/documents/files';
	import { isCached } from '$lib/documents/offline-cache';
	import { lockBodyScroll, unlockBodyScroll } from '$lib/shell/scroll-lock';
	import { reducedMotion } from '$lib/shell/stores/reduced-motion';
	import {
		IDENTITY,
		DOUBLE_TAP_DIST,
		DOUBLE_TAP_MS,
		TAP_SLOP,
		clampPan,
		doubleTapView,
		isZoomed,
		pinchView,
		releaseAction,
		zoomAbout,
		type Pt,
		type View
	} from '$lib/documents/zoom';

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

	// #373 — the lightbox is a full-screen overlay; the page behind it must not
	// scroll or rubber-band under the swipe-between-images gesture.
	//
	// Keyed on OPEN-NESS (`index`), not on `doc`. `doc` is $derived FROM `index`,
	// so keying on it re-ran the whole effect on every swipe between images:
	// unlock → refcount hits 0 → body styles stripped → scroll restored → relock,
	// once per photo. The spec asks for the body to be locked while the lightbox
	// is open — one lock for the session, not one per image.
	//
	// #371 — reading `index` directly was NOT enough: the effect still depended
	// on `index`, so paging 0 → 1 re-ran it and churned the lock once per image
	// (proven by lightbox-zoom.spec's MutationObserver). Open-ness goes through a
	// boolean $derived, which dedupes the unchanged `true` across paging.
	const isOpen = $derived(index !== null);
	$effect(() => {
		if (!isOpen) return;
		lockBodyScroll();
		return () => unlockBodyScroll();
	});

	function close() {
		index = null;
		confirming = false;
		clearTapTimer();
		pointers.clear();
		mode = 'idle';
		view = IDENTITY;
		dragX = 0;
		dragY = 0;
		sliding = false;
	}
	function prev() {
		go(-1);
	}
	function next() {
		go(1);
	}

	// ---------------------------------------------------------------------
	// #371 — pinch-zoom, pan, double-tap, swipe-to-page, swipe-down-to-dismiss.
	//
	// Driven by POINTER events on the stage, which carries `touch-none`: the
	// browser does no panning / pinch / double-tap-zoom of its own there (the
	// global `touch-action: manipulation` on <html> is what used to eat
	// double-tap), so every gesture is ours. The image moves by CSS transform
	// only — layout never changes mid-gesture. The math lives in
	// `$lib/documents/zoom` (Vitest'd).
	//
	// Rules: at 1x one finger swipes (horizontal → page, down → dismiss). Once
	// zoomed, one finger PANS and paging is off entirely. Two fingers always
	// pinch. Zoom resets whenever the image changes.
	// ---------------------------------------------------------------------
	let stage = $state<HTMLDivElement | null>(null);
	let imgEl = $state<HTMLImageElement | null>(null);
	let backdropEl = $state<HTMLButtonElement | null>(null);

	let view = $state<View>(IDENTITY);
	let dragX = $state(0); // 1x horizontal swipe / page-slide offset
	let dragY = $state(0); // 1x swipe-down offset
	let animating = $state(false); // true → CSS transition on transform
	let sliding = false; // a page slide / dismiss is in flight; input ignored

	const SETTLE_MS = 220;
	const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

	const zoomed = $derived(isZoomed(view));
	// Swipe-down fades the backdrop and chrome out with the drag.
	const fade = $derived(
		dragY > 0 && stage ? 1 - Math.min(1, dragY / (stage.clientHeight * 0.5)) : 1
	);
	const motion = $derived(animating && !$reducedMotion);
	const imgStyle = $derived(
		`transform: translate3d(${view.x + dragX}px, ${view.y + dragY}px, 0) scale(${view.s});` +
			(motion ? ` transition: transform ${SETTLE_MS}ms ${EASE};` : '')
	);
	const fadeStyle = $derived(
		`opacity: ${fade};` + (motion ? ` transition: opacity ${SETTLE_MS}ms ${EASE};` : '')
	);

	// Reset zoom on every image change (and on open). Keyed on `index` alone.
	$effect(() => {
		void index;
		untrack(() => {
			view = IDENTITY;
			dragY = 0;
		});
	});

	let settleTimer: ReturnType<typeof setTimeout> | undefined;
	/** Apply a programmatic change WITH the settle transition (unless reduced). */
	function animateTo(fn: () => void) {
		animating = true;
		fn();
		clearTimeout(settleTimer);
		settleTimer = setTimeout(() => (animating = false), SETTLE_MS + 20);
	}
	const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
	const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

	/**
	 * Page by `dir` with a slide: the current image leaves in the direction of
	 * travel and the next enters from the other side. Reduced motion: an
	 * instant swap. Shared by swipe, the arrow buttons and the arrow keys.
	 */
	async function go(dir: 1 | -1) {
		if (index === null || sliding) return;
		const target = index + dir;
		if (target < 0 || target >= gallery.length) return;
		confirming = false;
		const w = stage?.clientWidth ?? 0;
		if ($reducedMotion || !w) {
			dragX = 0;
			index = target;
			return;
		}
		sliding = true;
		animateTo(() => {
			view = IDENTITY;
			dragX = -dir * w;
		});
		await wait(SETTLE_MS);
		if (index === null) return; // closed mid-slide
		animating = false;
		index = target;
		dragX = dir * w;
		await tick();
		await nextFrame();
		animateTo(() => (dragX = 0));
		await wait(SETTLE_MS);
		sliding = false;
	}

	async function dismiss() {
		const h = stage?.clientHeight ?? 0;
		if ($reducedMotion || !h) return close();
		sliding = true;
		animateTo(() => (dragY = h));
		await wait(SETTLE_MS);
		close();
	}

	function sizes() {
		return {
			img: { w: imgEl?.offsetWidth ?? 0, h: imgEl?.offsetHeight ?? 0 },
			box: { w: stage?.clientWidth ?? 0, h: stage?.clientHeight ?? 0 }
		};
	}
	/** Client coords → stage-centre coords (the frame zoom.ts works in). */
	function local(p: Pt): Pt {
		const r = stage!.getBoundingClientRect();
		return { x: p.x - r.left - r.width / 2, y: p.y - r.top - r.height / 2 };
	}

	type Mode = 'idle' | 'pending' | 'pan' | 'swipe-x' | 'swipe-y' | 'pinch';
	const pointers = new Map<number, Pt>();
	let mode: Mode = 'idle';
	let downAt: Pt = { x: 0, y: 0 };
	let downTarget: EventTarget | null = null;
	let startView: View = IDENTITY;
	let pinchStart = { mid: { x: 0, y: 0 }, dist: 1, view: IDENTITY };
	let lastMove = { x: 0, y: 0, t: 0 };
	let velocity = { x: 0, y: 0 };
	let lastTap: { p: Pt; t: number } | null = null;
	let tapTimer: ReturnType<typeof setTimeout> | undefined;

	function clearTapTimer() {
		clearTimeout(tapTimer);
		tapTimer = undefined;
	}

	function twoFingers(): { mid: Pt; dist: number } {
		const [a, b] = [...pointers.values()];
		return {
			mid: local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
			dist: Math.hypot(a.x - b.x, a.y - b.y)
		};
	}

	function onPointerDown(e: PointerEvent) {
		if (sliding || !stage) return;
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		// The paging arrows are ordinary buttons — leave their clicks alone.
		if ((e.target as Element | null)?.closest?.('[data-lightbox-control]')) return;
		stage.setPointerCapture?.(e.pointerId);
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		animating = false;

		if (pointers.size === 1) {
			mode = 'pending';
			downAt = { x: e.clientX, y: e.clientY };
			downTarget = e.target;
			startView = view;
			lastMove = { x: e.clientX, y: e.clientY, t: e.timeStamp };
			velocity = { x: 0, y: 0 };
		} else if (pointers.size === 2) {
			// A second finger turns whatever the first was doing into a pinch.
			clearTapTimer();
			lastTap = null;
			dragX = 0;
			dragY = 0;
			mode = 'pinch';
			const { mid, dist } = twoFingers();
			pinchStart = { mid, dist, view };
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (!pointers.has(e.pointerId)) return;
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		const { img, box } = sizes();

		if (mode === 'pinch') {
			if (pointers.size < 2) return;
			const { mid, dist } = twoFingers();
			view = pinchView(pinchStart.view, pinchStart.mid, pinchStart.dist, mid, dist, img, box);
			return;
		}

		const dx = e.clientX - downAt.x;
		const dy = e.clientY - downAt.y;
		const dt = e.timeStamp - lastMove.t;
		if (dt > 0) {
			velocity = { x: (e.clientX - lastMove.x) / dt, y: (e.clientY - lastMove.y) / dt };
			lastMove = { x: e.clientX, y: e.clientY, t: e.timeStamp };
		}

		if (mode === 'pending') {
			if (Math.hypot(dx, dy) < TAP_SLOP) return;
			clearTapTimer();
			lastTap = null;
			if (zoomed) mode = 'pan';
			else mode = Math.abs(dx) > Math.abs(dy) ? 'swipe-x' : 'swipe-y';
		}

		if (mode === 'pan') {
			view = clampPan({ s: startView.s, x: startView.x + dx, y: startView.y + dy }, img, box);
		} else if (mode === 'swipe-x') {
			// Resist past either end of the gallery, iOS-style.
			const blocked = (dx < 0 && !hasNext) || (dx > 0 && !hasPrev);
			dragX = blocked ? dx * 0.25 : dx;
		} else if (mode === 'swipe-y') {
			dragY = dy > 0 ? dy : dy * 0.2;
		}
	}

	function onPointerUp(e: PointerEvent) {
		if (!pointers.delete(e.pointerId)) return;

		if (mode === 'pinch') {
			// The pinch owns the gesture until the LAST finger lifts — a finger
			// left behind must not turn into a swipe or a tap.
			if (pointers.size > 0) return;
			mode = 'idle';
			if (!isZoomed(view)) animateTo(() => (view = IDENTITY));
			return;
		}
		if (pointers.size > 0) return;

		// A released drag's velocity is the last sample only if it is recent —
		// a finger that stopped before lifting is not a flick.
		if (e.timeStamp - lastMove.t > 80) velocity = { x: 0, y: 0 };

		const was = mode;
		mode = 'idle';
		if (e.type === 'pointercancel') {
			animateTo(() => {
				dragX = 0;
				dragY = 0;
			});
			return;
		}

		if (was === 'pending') {
			onTap({ x: e.clientX, y: e.clientY });
		} else if (was === 'swipe-x') {
			const action = releaseAction('x', dragX, velocity.x, { hasPrev, hasNext });
			if (action === 'next') next();
			else if (action === 'prev') prev();
			else animateTo(() => (dragX = 0));
		} else if (was === 'swipe-y') {
			if (releaseAction('y', dragY, velocity.y, { hasPrev, hasNext }) === 'dismiss') dismiss();
			else animateTo(() => (dragY = 0));
		}
	}

	function onTap(p: Pt) {
		const now = performance.now();
		if (
			lastTap &&
			now - lastTap.t < DOUBLE_TAP_MS &&
			Math.hypot(p.x - lastTap.p.x, p.y - lastTap.p.y) < DOUBLE_TAP_DIST
		) {
			// Double-tap: toggle zoom about the tap point. Also cancels the
			// backdrop close the first tap may have scheduled.
			clearTapTimer();
			lastTap = null;
			const { img, box } = sizes();
			const target = doubleTapView(view, local(p), img, box);
			animateTo(() => (view = target));
			return;
		}
		lastTap = { p, t: now };
		// A single tap on the backdrop (not the image) closes — at 1x only, and
		// only once the double-tap window has passed without a second tap.
		if (downTarget === backdropEl && !zoomed) {
			clearTapTimer();
			tapTimer = setTimeout(close, DOUBLE_TAP_MS);
		}
	}

	// Backdrop button: pointer taps are handled above (so a double-tap on the
	// backdrop zooms instead of closing). Keyboard activation (detail 0) closes.
	function onBackdropClick(e: MouseEvent) {
		if (e.detail === 0) close();
	}

	// Desktop trackpad pinch arrives as ctrl+wheel; it needs a non-passive
	// listener to stop the browser zooming the whole page. Safari's own
	// `gesturestart` is blocked for the same reason.
	$effect(() => {
		const el = stage;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			if (!e.ctrlKey) return;
			e.preventDefault();
			const { img, box } = sizes();
			const z = zoomAbout(view, view.s * Math.exp(-e.deltaY / 100), local({ x: e.clientX, y: e.clientY }), img, box);
			view = isZoomed(z) ? z : IDENTITY;
		};
		const block = (e: Event) => e.preventDefault();
		el.addEventListener('wheel', onWheel, { passive: false });
		el.addEventListener('gesturestart', block);
		return () => {
			el.removeEventListener('wheel', onWheel);
			el.removeEventListener('gesturestart', block);
		};
	});

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

	// #371 / #366 — every control here is sized to a real 44×44 box rather than
	// relying on `hit-44`'s overlay, which is invisible to layout and so to any
	// check that measures the control.
	const toolBtn =
		'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2.5 text-xs font-semibold text-paper/90 hover:bg-paper/10 active:bg-paper/10 disabled:opacity-40';
</script>

<svelte:window onkeydown={doc ? onkeydown : undefined} />

{#if doc}
	<div class="z-overlay fixed inset-0 flex flex-col" role="dialog" aria-modal="true" aria-label={label}>
		<!-- Backdrop layer, separate so swipe-down can fade it without fading the image. -->
		<div class="absolute inset-0 bg-ink/90 backdrop-blur-sm" style={fadeStyle} aria-hidden="true"></div>

		<!-- Toolbar -->
		<div class="relative flex items-center justify-between gap-2 py-1.5 pr-2 pl-4 text-paper" style={fadeStyle}>
			<div class="flex min-w-0 flex-1 items-center gap-2">
				<p class="min-w-0 truncate text-sm font-medium">{label}</p>
				{#if gallery.length > 1}
					<span class="text-paper/60 shrink-0 font-mono text-xs tabular-nums">{(index ?? 0) + 1}/{gallery.length}</span>
				{/if}
				{#if savedOffline}
					<span class="bg-moss/20 text-moss-tint shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold">Saved offline</span>
				{/if}
			</div>
			<div class="flex shrink-0 items-center gap-0.5">
				{#if shareSupported}
					<button type="button" onclick={share} disabled={sharing} class={toolBtn}>Share</button>
				{/if}
				<a href={doc.file_href} target="_blank" rel="noopener" class={toolBtn}>Open</a>
				<a href="{doc.file_href}?download=1" download class={toolBtn}>Save</a>
				{#if deletable}
					{#if !confirming}
						<button type="button" onclick={() => (confirming = true)} class={toolBtn}>Delete</button>
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
							class="flex items-center gap-0.5"
						>
							<input type="hidden" name="document_id" value={doc.id} />
							<button
								type="submit"
								disabled={deleting}
								class="bg-error text-paper inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2.5 text-xs font-semibold disabled:opacity-40"
							>
								{deleting ? 'Deleting…' : 'Confirm'}
							</button>
							<button type="button" onclick={() => (confirming = false)} class="{toolBtn} text-paper/70 font-normal">Cancel</button>
						</form>
					{/if}
				{/if}
				<button type="button" onclick={close} class={toolBtn} aria-label="Close">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
				</button>
			</div>
		</div>

		<!-- Image stage. `touch-none`: every gesture here is ours (see the #371
		     block in the script). The backdrop button (behind the image) is the
		     keyboard/AT close; pointer taps on it are resolved by onTap so a
		     double-tap on the backdrop zooms rather than closes. -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			bind:this={stage}
			class="relative flex flex-1 touch-none items-center justify-center overflow-hidden p-4 select-none"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
		>
			<button
				bind:this={backdropEl}
				type="button"
				class="absolute inset-0 {zoomed ? 'cursor-grab' : 'cursor-zoom-out'}"
				aria-label="Close"
				onclick={onBackdropClick}
			></button>
			<img
				bind:this={imgEl}
				src={doc.file_href}
				alt={label}
				draggable="false"
				data-lightbox-image
				data-zoomed={zoomed ? 'true' : 'false'}
				class="relative max-h-full max-w-full object-contain will-change-transform {zoomed ? 'cursor-grab' : 'cursor-zoom-in'}"
				style={imgStyle}
			/>

			{#if hasPrev}
				<button type="button" data-lightbox-control onclick={prev} aria-label="Previous" class="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-ink/40 text-paper hover:bg-ink/60 active:bg-ink/60" style={fadeStyle}>
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
				</button>
			{/if}
			{#if hasNext}
				<button type="button" data-lightbox-control onclick={next} aria-label="Next" class="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-ink/40 text-paper hover:bg-ink/60 active:bg-ink/60" style={fadeStyle}>
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
				</button>
			{/if}
		</div>
	</div>
{/if}
