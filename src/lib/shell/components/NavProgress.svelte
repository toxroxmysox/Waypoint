<script lang="ts">
	import { navigating } from '$app/state';
	import { createNavProgress, IDLE, type NavProgressState } from '$lib/shell/nav-progress';

	// #363 — pending feedback for route navigation: a plain 2px accent bar pinned
	// under the status bar. The show/hide/progress rules (150ms delay, ease toward
	// 90%, snap to 100% + fade) live in `nav-progress.ts`; this only paints them.
	//
	// Driven by `navigating` alone, so shallow routing (pushState/replaceState —
	// sheets) and same-page form invalidations never trigger it: neither sets it.
	// SvelteKit runs `onNavigate` (the view-transition wrapper) only AFTER `load`
	// resolves, so while data is in flight the page is live and this paints
	// normally — it has no interaction with the transition.

	let s = $state<NavProgressState>(IDLE);
	const ctrl = createNavProgress((next) => (s = next));

	$effect(() => {
		if (navigating.to && !navigating.willUnload) ctrl.start();
		else ctrl.done();
	});

	$effect(() => () => ctrl.destroy());
</script>

<div
	class="nav-progress"
	class:visible={s.visible}
	class:jump={!s.animate}
	style="--p: {s.progress};"
	aria-hidden="true"
	data-testid="nav-progress"
	data-phase={s.phase}
></div>

<style>
	.nav-progress {
		position: fixed;
		top: env(safe-area-inset-top, 0px);
		left: 0;
		right: 0;
		height: 2px;
		z-index: calc(var(--z-index-overlay) + 10);
		pointer-events: none;
		background: var(--color-accent);
		transform-origin: left center;
		transform: scaleX(var(--p));
		opacity: 0;
		transition:
			transform 200ms ease-out,
			opacity 300ms ease;
	}
	.nav-progress.visible {
		opacity: 1;
		transition:
			transform 200ms ease-out,
			opacity 150ms ease;
	}
	.nav-progress.jump {
		transition: opacity 150ms ease;
	}

	/* No travel — the full-width bar just fades in and out. */
	@media (prefers-reduced-motion: reduce) {
		.nav-progress,
		.nav-progress.visible,
		.nav-progress.jump {
			transform: none;
			transition: opacity 200ms ease;
		}
	}
</style>
