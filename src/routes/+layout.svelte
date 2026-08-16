<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import A2HSBanner from '$lib/shell/components/A2HSBanner.svelte';
	import Toast from '$lib/ui/Toast.svelte';
	import { page as pageState } from '$app/state';
	import { installOfflineWriteGuard } from '$lib/shell/offline-write-guard';
	import { installResumeRefresh } from '$lib/shell/resume-refresh';
	import {
		shouldWalkOrphan,
		consumeOrphan,
		notePopstate,
		consumePopstate
	} from '$lib/shell/sheet-history';

	let { children } = $props();
	let routeAnnouncement = $state('');

	// #365 — walk the history entries orphaned by a sheet that closed itself.
	//
	// A sheet closing as part of an action (`open = false; goto(...)`) cannot pop
	// its own entry: that races the in-flight navigation and the just-saved record
	// vanishes from the page. It cannot clean up afterwards either, because that
	// same navigation unmounts it. So the orphan is walked HERE — the root layout
	// outlives every route and every sheet, and is the only place that can still
	// be listening when the user lands back on a dead entry.
	//
	// Without this, the second back press after any AddSheet flow does nothing at
	// all: the #235 dead tap, measured before this existed.
	// Keyed on the entry's UNIQUE id, not its nesting depth. Depth repeats — a
	// later, unrelated sheet is depth 1 again — and keying on it made this walk a
	// live entry belonging to a different sheet, deterministically breaking a
	// trip-mode flow.
	$effect(() => {
		const id = pageState.state.sheetId ?? 0;
		if (!shouldWalkOrphan(id)) return;
		// ONLY in response to a real back press. On a forward navigation this would
		// drag the user out of the page they just opened.
		if (!consumePopstate()) return;
		consumeOrphan(id);
		history.back();
	});

	onMount(() => {
		// #365 — the orphan walk above is only legitimate after a back press, so
		// record real popstates. Capture phase, so it lands before the router's own
		// handling turns the popstate into a page.state change.
		const onPopstate = () => notePopstate();
		window.addEventListener('popstate', onPopstate, true);

		// Number input scroll prevention
		const handler = (e: WheelEvent) => {
			if (e.target instanceof HTMLInputElement && e.target.type === 'number') {
				e.target.blur();
			}
		};
		document.addEventListener('wheel', handler, { passive: true });

		// App-wide offline write-guard (#255): block mutation submits while offline
		// with a toast; read navigation is unaffected. One capture-phase listener.
		const teardownGuard = installOfflineWriteGuard();

		// Resume revalidation (#372): back after >60s hidden → silent invalidateAll.
		// No spinner, no gesture; under 60s nothing happens.
		const teardownResume = installResumeRefresh();

		return () => {
			window.removeEventListener('popstate', onPopstate, true);
			document.removeEventListener('wheel', handler);
			teardownGuard();
			teardownResume();
		};
	});

	afterNavigate(() => {
		const mainEl = document.querySelector('main');
		if (mainEl) {
			mainEl.id = 'main-content';
			mainEl.tabIndex = -1;
			mainEl.style.outline = 'none';
			mainEl.focus({ preventScroll: true });
		}
		const h1 = document.querySelector('h1');
		routeAnnouncement = h1?.textContent?.trim() || document.title;
	});
</script>

<svelte:head>
	<meta name="theme-color" content="#F6F2EA" />
</svelte:head>

<a href="#main-content" class="skip-link">Skip to content</a>
<div class="sr-only" aria-live="polite" aria-atomic="true">{routeAnnouncement}</div>

<A2HSBanner />

{@render children()}

<Toast />
