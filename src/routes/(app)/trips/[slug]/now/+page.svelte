<script lang="ts">
	// INTERIM view — Slice A (#153) delivers the state machine + loader only.
	// Slice B (#154) replaces this with the weighted Focus layout (slim banners,
	// muted "later today" tier, tail row, checklists). This mapping keeps the page
	// functional against the new NowViewState shape until then.
	import NavBar from '$lib/ui/NavBar.svelte';
	import { getNowViewState } from '$lib/trip-mode/now-state';
	import NowMidEvent from '$lib/trip-mode/components/NowMidEvent.svelte';
	import NowBetweenThings from '$lib/trip-mode/components/NowBetweenThings.svelte';
	import NowDayWrapped from '$lib/trip-mode/components/NowDayWrapped.svelte';
	import Card from '$lib/ui/Card.svelte';
	import { untrack } from 'svelte';

	let { data } = $props();

	const now = new Date(untrack(() => data.now));
	const state = $derived(getNowViewState(data.todayItems, now, data.hasToday));
	const focus = $derived(state.focus);
</script>

<NavBar title="Now" subtitle={data.trip.title} subtitleStyle="tagline" />

<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-8">
	{#if focus.kind === 'mid-event'}
		<NowMidEvent
			currentItem={focus.currentItem}
			nextItem={state.forwardItems[0] ?? null}
			tomorrowFirstItem={null}
			minutesRemaining={focus.minutesRemaining}
			slug={data.trip.slug}
		/>
	{:else if focus.kind === 'free-time'}
		<NowBetweenThings
			nextItem={focus.nextItem}
			minutesUntilNext={focus.minutesUntilNext}
			slug={data.trip.slug}
		/>
	{:else if focus.kind === 'wrapped-summary'}
		<NowDayWrapped completedCount={focus.completedCount} totalCount={focus.totalCount} />
	{:else if focus.kind === 'nothing-else-planned'}
		<Card>
			<div class="p-6 text-center">
				<p class="text-ink-soft font-semibold">Nothing else planned</p>
				<p class="text-ink-muted mt-1 text-sm">The rest of today is open.</p>
			</div>
		</Card>
	{:else}
		<Card>
			<div class="p-6 text-center">
				<p class="text-ink-soft font-semibold">No itinerary for today</p>
				<p class="text-ink-muted mt-1 text-sm">Today doesn't fall within this trip's dates.</p>
			</div>
		</Card>
	{/if}
</main>
