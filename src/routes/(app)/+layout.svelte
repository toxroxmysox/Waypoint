<script lang="ts">
	import { navigating } from '$app/stores';
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
</script>

<div class="bg-paper text-ink flex min-h-dvh flex-col">
	{#if skeleton}
		{@const SkeletonPage = skeleton}
		<SkeletonPage />
	{:else}
		{@render children()}
	{/if}
</div>
