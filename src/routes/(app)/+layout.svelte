<script lang="ts">
	import { navigating } from '$app/stores';
	import { onNavigate } from '$app/navigation';
	import TripsPageSkeleton from '$lib/components/skeletons/TripsPageSkeleton.svelte';
	import DayPageSkeleton from '$lib/components/skeletons/DayPageSkeleton.svelte';
	import ExpensesPageSkeleton from '$lib/components/skeletons/ExpensesPageSkeleton.svelte';
	import MembersPageSkeleton from '$lib/components/skeletons/MembersPageSkeleton.svelte';

	let { children } = $props();

	const skeletonMap: Record<string, typeof TripsPageSkeleton> = {
		'/(app)/trips': TripsPageSkeleton,
		'/(app)/trips/[slug]/days/[dayId]': DayPageSkeleton,
		'/(app)/trips/[slug]/expenses': ExpensesPageSkeleton,
		'/(app)/trips/[slug]/members': MembersPageSkeleton
	};

	const skeleton = $derived(
		$navigating?.to?.route?.id ? (skeletonMap[$navigating.to.route.id] ?? null) : null
	);

	type TransitionType = 'tab' | 'peer' | 'drill-down' | 'drill-up' | 'fade';

	const bottomNavRoutes = new Set([
		'/(app)/trips/[slug]',
		'/(app)/trips/[slug]/expenses',
		'/(app)/trips/[slug]/budget',
		'/(app)/trips/[slug]/members',
		'/(app)/trips/[slug]/more'
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
	{#if skeleton}
		{@const SkeletonPage = skeleton}
		<SkeletonPage />
	{:else}
		{@render children()}
	{/if}
</div>
