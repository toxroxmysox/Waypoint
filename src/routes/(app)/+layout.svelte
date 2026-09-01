<script lang="ts">
	import { onMount } from 'svelte';
	import { onNavigate, afterNavigate } from '$app/navigation';
	import { updateNavDepth } from '$lib/shell/stores/nav-depth';

	let { children } = $props();

	type TransitionType = 'tab' | 'peer' | 'drill-down' | 'drill-up' | 'fade';

	// Every route reachable from a bottom-nav tab, in BOTH modes — so tab-to-tab
	// hops animate laterally (peer) instead of as a drill-down/up. Planning tabs:
	// Itinerary / Money / Members / Docs / More. Trip-mode tabs (#244): Now /
	// Money / Docs (Add opens a sheet, no route). Docs + Money are shared by both.
	const bottomNavRoutes = new Set([
		'/(app)/trips/[slug]',
		'/(app)/trips/[slug]/expenses',
		'/(app)/trips/[slug]/budget',
		'/(app)/trips/[slug]/money',
		'/(app)/trips/[slug]/members',
		'/(app)/trips/[slug]/documents',
		'/(app)/trips/[slug]/more',
		'/(app)/trips/[slug]/now'
	]);

	function classifyNavigation(from: string | null | undefined, to: string | null | undefined): TransitionType {
		if (!from || !to || from === to) return 'fade';

		if (bottomNavRoutes.has(from) && bottomNavRoutes.has(to)) return 'tab';

		const depth = (id: string) =>
			id.replace(/\([^)]+\)\/?/g, '').split('/').filter(Boolean).length;
		const fromDepth = depth(from);
		const toDepth = depth(to);

		if (toDepth > fromDepth) return 'drill-down';
		if (toDepth < fromDepth) return 'drill-up';

		return 'peer';
	}

	afterNavigate((nav) => {
		updateNavDepth(nav.type, nav.delta);
	});

	// #383 — THE ONE INVARIANT: the update callback must ALWAYS return.
	//
	// It used to `await navigation.complete` unconditionally. When a navigation is
	// SUPERSEDED that promise never settles — it does not reject, it hangs — so the
	// callback never returned, `finished` never settled, the `delete` below never
	// ran, and the ::view-transition overlay stayed mounted swallowing every
	// pointer event. The page was dead until reload. A rejection handler cannot
	// help a promise that never settles, which is why a two-arg `.then` was
	// measured and found insufficient.
	//
	// Measured (scripts/probe-383-reach.mjs): the supersede window is 7–228ms, and
	// no ordinary gesture lands in it — back-after-tap and double-tap both stayed
	// clean across 0–400ms at 1x and 6x CPU. What DOES land in it is code calling
	// `history.back()` synchronously, which is exactly #365's orphan walk. Latent
	// on its own; deterministic under #365.
	//
	// One owner, not cooperating primitives: whoever is pending gets released.
	let pending: { release: () => void } | null = null;

	// A pending transition is superseded by TWO different things, and only one of
	// them is a navigation:
	//
	//   1. another `onNavigate` — the ordinary case, handled below;
	//   2. a bare `popstate` that never becomes a navigation at all.
	//
	// (2) is not hypothetical, it is the exact case that wedges. BottomSheet owns
	// its history entry via SHALLOW ROUTING (`pushState`), and popping a shallow
	// entry restores `page.state` WITHOUT running a navigation — so `onNavigate`
	// never fires for it. #365's orphan walk pops exactly such an entry, in the
	// middle of the `goto` a sheet fired on its way out. Releasing only from
	// `onNavigate` leaves that transition pending forever, which is what the
	// skip-door spec caught.
	onMount(() => {
		const release = () => pending?.release();
		// Capture phase, so this lands before the router turns the popstate into a
		// `page.state` change.
		window.addEventListener('popstate', release, true);
		return () => window.removeEventListener('popstate', release, true);
	});

	onNavigate((navigation) => {
		// BEFORE the guards, deliberately. ANY navigation supersedes a pending
		// transition — including the popstate we return early for below, which is
		// the very case that wedges. Releasing after the guard would fix nothing.
		pending?.release();

		if (!document.startViewTransition) return;

		const from = navigation.from?.route?.id;
		const to = navigation.to?.route?.id;
		const type = classifyNavigation(from, to);

		document.documentElement.dataset.transition = type;

		return new Promise((resolve) => {
			let release!: () => void;
			const superseded = new Promise<void>((r) => (release = r));
			const record = { release };
			pending = record;

			const transition = document.startViewTransition(async () => {
				resolve();
				// Whichever comes first — this navigation finishing, or a later one
				// superseding it. Either way the callback RETURNS, which is the whole
				// fix. `.catch` because an aborted navigation rejects on some paths
				// and hangs on others; both shapes end here.
				await Promise.race([navigation.complete.catch(() => {}), superseded]);
			});

			const clear = () => {
				if (pending === record) pending = null;
				delete document.documentElement.dataset.transition;
			};
			// Two-arg: `finished` REJECTS when a transition is skipped, and cleanup
			// has to run on that path too.
			transition.finished.then(clear, clear);
		});
	});
</script>

<div class="bg-paper text-ink flex min-h-dvh flex-col">
	{@render children()}
</div>
