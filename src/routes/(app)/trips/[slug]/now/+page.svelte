<script lang="ts">
	import NavBar from '$lib/ui/NavBar.svelte';
	import { getNowViewState } from '$lib/trip-mode/now-state';
	import NowMidEvent from '$lib/trip-mode/components/NowMidEvent.svelte';
	import NowBetweenThings from '$lib/trip-mode/components/NowBetweenThings.svelte';
	import NowDayWrapped from '$lib/trip-mode/components/NowDayWrapped.svelte';
	import Card from '$lib/ui/Card.svelte';
	import { untrack } from 'svelte';

	let { data } = $props();

	const now = new Date(untrack(() => data.now));
	const viewState = $derived(
		getNowViewState(data.todayItems, now, data.hasToday)
	);
</script>

<NavBar title="Now" subtitle={data.trip.title} subtitleStyle="tagline" />

<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-8">
	{#if viewState.kind === 'mid-event'}
		<NowMidEvent
			currentItem={viewState.currentItem}
			nextItem={viewState.nextItem}
			tomorrowFirstItem={data.tomorrowFirstItem}
			minutesRemaining={viewState.minutesRemaining}
			slug={data.trip.slug}
		/>
	{:else if viewState.kind === 'between-things'}
		<NowBetweenThings
			nextItem={viewState.nextItem}
			minutesUntilNext={viewState.minutesUntilNext}
			slug={data.trip.slug}
		/>
	{:else if viewState.kind === 'day-wrapped'}
		<NowDayWrapped
			completedCount={viewState.completedCount}
			totalCount={viewState.totalCount}
		/>
	{:else}
		<Card>
			<div class="p-6 text-center">
				<p class="text-ink-soft font-semibold">No itinerary for today</p>
				<p class="text-ink-muted mt-1 text-sm">Today doesn't fall within this trip's dates.</p>
			</div>
		</Card>
	{/if}
</main>
