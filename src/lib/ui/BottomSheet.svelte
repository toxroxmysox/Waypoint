<script lang="ts">
	import type { Snippet } from 'svelte';
	import { untrack } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { pushState } from '$app/navigation';
	import { page } from '$app/state';
	import { reducedMotion } from '$lib/shell/stores/reduced-motion';
	import { lockBodyScroll, unlockBodyScroll } from '$lib/shell/scroll-lock';

	let {
		open = $bindable(false),
		title = '',
		dirty = false,
		discardLabel = 'Discard changes?',
		swallowBack = true,
		children
	}: {
		open: boolean;
		title?: string;
		/**
		 * #370 — the sheet holds unsaved typed content. Opt-in: when true, EVERY
		 * dismissal path asks before throwing the draft away. Sheets that hold no
		 * typed content (menus, pickers, detail views) leave it false and behave
		 * exactly as before.
		 */
		dirty?: boolean;
		/** The question shown in the discard confirm. Name the thing being lost. */
		discardLabel?: string;
		/**
		 * #365 — whether this sheet takes over the back gesture (push an entry on
		 * open, close on popstate). True everywhere by default. The one case that
		 * opts OUT is a sheet that exists BECAUSE a navigation was intercepted
		 * (#367's unsaved-changes guard): it must not push an entry it would then
		 * have to unwind while re-running the very navigation it interrupted.
		 */
		swallowBack?: boolean;
		children: Snippet;
	} = $props();

	let noMotion = $derived($reducedMotion);

	// #370 — the two-step inline confirm, matching the app's delete pattern
	// (a destructive action revealed in place, alongside a way back).
	let confirmingDiscard = $state(false);

	$effect(() => {
		if (!open) confirmingDiscard = false;
	});

	/**
	 * The ONE funnel every dismissal path goes through. Backdrop, Escape, the X,
	 * drag-to-dismiss and back all call this, so the guard cannot be bypassed by
	 * whichever path someone reaches for — including the X, which #370 does not
	 * list but which discards exactly as much work as the others.
	 */
	function requestClose(): boolean {
		if (dirty) {
			confirmingDiscard = true;
			return false;
		}
		open = false;
		return true;
	}

	function discardAndClose() {
		confirmingDiscard = false;
		open = false;
	}

	// #373 — pin the page behind the sheet. Reference-counted in the store, so
	// nesting (sheet → lightbox) releases the body only once the last one closes.
	// The cleanup arm covers every exit: close, unmount, and navigating away with
	// the sheet still open.
	$effect(() => {
		if (!open) return;
		lockBodyScroll();
		return () => unlockBodyScroll();
	});

	// ---------------------------------------------------------------------------
	// #365 — back / edge-swipe is swallowed by an open sheet.
	//
	// Locked decision (Scott, 2026-08-03): an open sheet takes the back gesture.
	// On iOS the edge-swipe otherwise navigates the PAGE out from under a sheet
	// that is still on screen, which is incoherent; on Android back-closes-modal
	// is the platform contract outright.
	//
	// Implemented with SvelteKit SHALLOW ROUTING (`pushState` with an empty url),
	// not a raw `history.pushState`. Shallow entries carry the router's own index
	// bookkeeping, and popping one restores `page.state` WITHOUT running a
	// navigation — so `onNavigate` never fires and the layout's
	// `startViewTransition` wrapper never animates the page. A raw history entry
	// would desync the router and (via onNavigate) animate a page transition on
	// what is only a sheet dismissal.
	//
	// `page.state.sheet` is a depth, so nested sheets each own one entry.
	// ---------------------------------------------------------------------------
	let historyToken = 0;
	let closingFromPopstate = false;

	$effect(() => {
		if (!open || !swallowBack) return;

		// untrack: this effect must depend on `open` ALONE. Reading page.state
		// reactively here would re-fire the effect on our own pushState — an
		// endless push loop.
		const token = untrack(() => (page.state.sheet ?? 0) + 1);
		const url = untrack(() => page.url.pathname + page.url.search);
		historyToken = token;
		try {
			untrack(() => pushState('', { ...page.state, sheet: token }));
		} catch {
			// Router not initialised yet (or shallow routing unavailable): the sheet
			// still works, it just does not swallow back. Never let this throw take
			// the sheet down with it.
			historyToken = 0;
		}

		return () => {
			const stillHere = untrack(() => page.url.pathname + page.url.search) === url;
			const ours = untrack(() => page.state.sheet) === token;
			// Pop our entry only when it is still the CURRENT one and we are still on
			// the page that pushed it. After a redirect (a sheet form that navigates
			// on success) neither holds, and a back() there would undo the redirect.
			if (!closingFromPopstate && historyToken === token && stillHere && ours) {
				history.back();
			}
			closingFromPopstate = false;
			historyToken = 0;
		};
	});

	// The other half: the user pressed back / edge-swiped. Our entry is gone from
	// history, so close the sheet. Tracks page.state.sheet ONLY.
	$effect(() => {
		const depth = page.state.sheet ?? 0;
		if (!untrack(() => open) || historyToken === 0 || depth >= historyToken) return;

		// #370 — back is a dismissal like any other, so a dirty sheet asks first.
		// The browser has already dropped our entry, so re-push it: the sheet is
		// still on screen and must still own the back gesture.
		if (untrack(() => dirty)) {
			untrack(() => {
				cancelDrag();
				confirmingDiscard = true;
				try {
					pushState('', { ...page.state, sheet: historyToken });
				} catch {
					historyToken = 0;
				}
			});
			return;
		}

		closingFromPopstate = true;
		cancelDrag();
		open = false;
	});

	// ---------------------------------------------------------------------------
	// #365 — grabber + drag-to-dismiss.
	//
	// The gesture is scoped to the grabber/header strip, never the sheet body: the
	// body is the scroll container, and a drag that has to first decide "scroll or
	// dismiss?" is the classic way to make both feel broken.
	//
	// Settling (spring-back and slide-out) runs through the Web Animations API
	// rather than a CSS transition. A CSS transition here depends on the browser
	// seeing `transition-duration` change to non-zero and the transform change in
	// separate style recalcs; batched into one Svelte flush that is not reliable,
	// and the failure mode is a silent teleport instead of a slide. `el.animate`
	// takes explicit from/to keyframes and cannot be batched away.
	// ---------------------------------------------------------------------------
	const DISMISS_PX = 96; // past this, release dismisses
	const FLICK_PX = 24; // a flick still needs some travel to count
	const FLICK_VELOCITY = 0.5; // px/ms
	const SETTLE_MS = 220;

	let panelEl = $state<HTMLElement | null>(null);
	let dragY = $state(0);
	let dragging = $state(false);
	let dismissing = $state(false);

	let startY = 0;
	let startT = 0;
	let panelH = 0;
	let settleAnim: Animation | null = null;

	// Suppresses the fly outro when the drag has already slid the panel off the
	// bottom — otherwise the outro restarts from translateY(0) and the sheet
	// visibly snaps back up before flying down again.
	const flyParams = $derived(
		noMotion || dismissing
			? { y: 0, duration: 0 }
			: { y: 300, duration: 250, easing: (t: number) => 1 - Math.pow(1 - t, 3) }
	);

	const fadeParams = $derived(noMotion || dismissing ? { duration: 0 } : { duration: 200 });

	// Backdrop thins out as the sheet is pulled down — the drag reads as "I am
	// taking this away" rather than "I am moving a rectangle".
	const backdropOpacity = $derived(
		dragY <= 0 ? 1 : Math.max(0.15, 1 - (dragY / Math.max(panelH || 400, 1)) * 0.85)
	);

	function settleTo(to: number, then?: () => void) {
		const el = panelEl;
		const from = dragY;
		const dur = noMotion ? 0 : SETTLE_MS;

		settleAnim?.cancel();
		settleAnim = null;

		if (!el || dur === 0 || Math.abs(to - from) < 1) {
			dragY = to;
			then?.();
			return;
		}

		const anim = el.animate(
			[{ transform: `translateY(${from}px)` }, { transform: `translateY(${to}px)` }],
			{ duration: dur, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' }
		);
		settleAnim = anim;

		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			// Set the resting offset FIRST, then drop the animation. `fill: forwards`
			// keeps overriding the inline transform after the animation ends, so an
			// un-cancelled one silently pins the panel and the NEXT drag renders as a
			// dead no-op — the gesture still fires, the sheet just never moves.
			// Ordering matters: dragY lands in the same flush, so there is no frame
			// where neither governs.
			dragY = to;
			anim.cancel();
			if (settleAnim === anim) settleAnim = null;
			then?.();
		};

		anim.onfinish = finish;
		// Belt: WAAPI never reports `finish` inside a display:none subtree or a
		// background tab (the #379 failure mode). A sheet must not be able to wedge
		// half-slid, so time out to the same end state regardless.
		setTimeout(finish, dur + 150);
	}

	function cancelDrag() {
		settleAnim?.cancel();
		settleAnim = null;
		dragging = false;
		dragY = 0;
	}

	function onDragStart(e: TouchEvent) {
		const t = e.touches[0];
		if (!t) return;
		settleAnim?.cancel();
		settleAnim = null;
		startY = t.clientY;
		startT = performance.now();
		panelH = panelEl?.offsetHeight ?? 0;
		dragging = true;
		dragY = 0;
	}

	function onDragMove(e: TouchEvent) {
		const t = e.touches[0];
		if (!dragging || !t) return;
		const dy = t.clientY - startY;
		// Downward tracks the finger 1:1; upward gets heavy resistance and a hard
		// stop, so the sheet cannot be dragged up past its own top edge.
		dragY = dy > 0 ? dy : Math.max(dy / 5, -24);
	}

	function onDragEnd() {
		if (!dragging) return;
		dragging = false;

		const dt = Math.max(performance.now() - startT, 1);
		const velocity = dragY / dt;
		const past = dragY > DISMISS_PX;
		const flicked = dragY > FLICK_PX && velocity > FLICK_VELOCITY;

		if (!(past || flicked)) {
			settleTo(0);
			return;
		}

		// #370 — a dirty sheet does not slide away on a drag either. Spring it back
		// to rest and ask, so the draft is still on screen behind the question.
		if (dirty) {
			settleTo(0, () => (confirmingDiscard = true));
			return;
		}

		dismissByDrag();
	}

	function dismissByDrag() {
		dismissing = true;
		settleTo(panelH || window.innerHeight, () => {
			open = false;
			dismissing = false;
			dragY = 0;
		});
	}

	function onBackdropClick() {
		requestClose();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		// Escape backs out of the confirm first, rather than skipping past the
		// question it just asked.
		if (confirmingDiscard) {
			confirmingDiscard = false;
			return;
		}
		requestClose();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-modal flex items-end justify-center" onkeydown={onKeydown}>
		<!--
			#373 — `touch-action: none` is what stops a touch-drag ON THE BACKDROP
			from scrolling the page behind it. The body lock handles the rest; this
			handles the gesture that never reaches a scroll container at all.
		-->
		<div
			class="fixed inset-0 touch-none bg-black/40"
			style="opacity: {backdropOpacity}"
			onclick={onBackdropClick}
			role="presentation"
			transition:fade={fadeParams}
		></div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			bind:this={panelEl}
			data-sheet-panel
			class="relative w-full max-w-lg rounded-t-xl bg-surface shadow-card-strong max-h-[85vh] overflow-y-auto overscroll-contain z-overlay"
			style="transform: translateY({dragY}px)"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			transition:fly={flyParams}
		>
			<!--
				#365 — the drag strip. `touch-none` keeps the browser from claiming the
				gesture as a scroll before our handlers see it; the panel below is the
				scroll container and keeps its own touch behaviour.
			-->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				data-sheet-drag-zone
				class="touch-none"
				ontouchstart={onDragStart}
				ontouchmove={onDragMove}
				ontouchend={onDragEnd}
				ontouchcancel={onDragEnd}
			>
				<!--
					Grabber. Deliberately NOT `bg-line`: --color-line is the app's
					lowest-contrast token (~1.2:1) and is for dividers only — a grabber is
					a foreground affordance and has to be seen. See layout.css / cerebrum.
				-->
				<div class="flex justify-center pt-2 pb-1">
					<div data-sheet-grabber class="h-1 w-9 rounded-full bg-ink-muted/30"></div>
				</div>
				<div class="flex items-center justify-between border-b border-line px-4 pt-1 pb-3">
					<h2 class="font-display text-base font-semibold text-ink">{title}</h2>
					<button
						type="button"
						class="text-ink-muted hover:text-ink active:text-ink hit-44 p-1"
						onclick={() => requestClose()}
						aria-label="Close"
					>
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M18 6 6 18M6 6l12 12" />
						</svg>
					</button>
				</div>
			</div>
			<!--
				#370 — two-step inline discard confirm, in the app's delete idiom: the
				destructive action revealed in place next to a way back, never a native
				dialog. Sits directly under the header so the draft it is asking about
				stays visible behind it.
			-->
			{#if confirmingDiscard}
				<div
					class="border-line bg-error-tint/70 flex items-center justify-between gap-3 border-b px-4 py-3"
					role="alert"
				>
					<p class="text-ink text-sm font-medium">{discardLabel}</p>
					<div class="flex shrink-0 items-center gap-3">
						<button
							type="button"
							class="hit-44 text-error active:text-error-deep text-xs font-semibold"
							onclick={discardAndClose}
						>
							Discard
						</button>
						<button
							type="button"
							class="hit-44 text-ink-muted active:text-ink text-xs"
							onclick={() => (confirmingDiscard = false)}
						>
							Keep editing
						</button>
					</div>
				</div>
			{/if}
			<div class="p-4">
				{@render children()}
			</div>
		</div>
	</div>
{/if}
