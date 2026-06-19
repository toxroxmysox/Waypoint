<script lang="ts">
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

	onNavigate((navigation) => {
		if (!document.startViewTransition) return;

		const from = navigation.from?.route?.id;
		const to = navigation.to?.route?.id;
		const type = classifyNavigation(from, to);

		document.documentElement.dataset.transition = type;

		return new Promise((resolve) => {
			const transition = document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
			transition.finished.then(() => {
				delete document.documentElement.dataset.transition;
			});
		});
	});
</script>

<div class="bg-paper text-ink flex min-h-dvh flex-col">
	{@render children()}
</div>
