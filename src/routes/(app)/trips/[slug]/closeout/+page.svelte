<script lang="ts">
	import { enhance } from '$app/forms';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import CloseoutDayCard from '$lib/components/CloseoutDayCard.svelte';
	import type { Day, Item } from '$lib/types';
	import { untrack } from 'svelte';

	let { data } = $props();

	let currentDayIndex = $state(0);
	let finishing = $state(false);

	const isOffline = $derived(
		typeof window !== 'undefined' && !navigator.onLine
	);

	const sortedDays = $derived(
		[...data.days].sort((a, b) => a.date.localeCompare(b.date))
	);

	const totalDays = $derived(sortedDays.length);
	const currentDay = $derived(sortedDays[currentDayIndex]);
	const isLastDay = $derived(currentDayIndex >= totalDays - 1);
	const showSummary = $derived(currentDayIndex >= totalDays);

	function itemsForDay(day: Day): Item[] {
		return data.items.filter((i) => i.day === day.id);
	}

	const summary = $derived(() => {
		let done = 0;
		let planned = 0;
		let considered = 0;
		for (const item of data.items) {
			if (item.status === 'done') done++;
			else if (item.status === 'considered') considered++;
			else planned++;
		}
		return { done, planned, considered, total: data.items.length };
	});
</script>

<svelte:head>
	<title>Closeout — {data.trip.title}</title>
</svelte:head>

<NavBar
	title="Closeout"
	subtitle={data.trip.title}
	subtitleStyle="tagline"
	back
	backHref="/trips/{data.trip.slug}"
/>

<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-32">
	{#if isOffline}
		<div class="bg-surface border-border mt-8 rounded-xl border p-6 text-center">
			<svg class="text-ink-muted mx-auto mb-3" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<line x1="1" y1="1" x2="23" y2="23" />
				<path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
				<path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
				<path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
				<path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
				<path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
				<line x1="12" y1="20" x2="12.01" y2="20" />
			</svg>
			<h2 class="text-ink text-lg font-semibold">You're offline</h2>
			<p class="text-ink-muted mt-1 text-sm">Closeout requires an internet connection. Please reconnect and try again.</p>
		</div>
	{:else if totalDays === 0}
		<div class="bg-surface border-border mt-8 rounded-xl border p-6 text-center">
			<p class="text-ink-muted text-sm">No days to review. This trip has no itinerary days.</p>
		</div>
	{:else if !showSummary}
		<div class="mb-4">
			<div class="flex items-center justify-between">
				<p class="text-ink-muted text-sm font-medium">Day {currentDayIndex + 1} of {totalDays}</p>
			</div>
			<div class="bg-surface-2 mt-2 h-1.5 w-full overflow-hidden rounded-full">
				<div
					class="h-full rounded-full bg-green-500 transition-all"
					style="width: {((currentDayIndex + 1) / totalDays) * 100}%"
				></div>
			</div>
		</div>

		<CloseoutDayCard
			day={currentDay}
			items={itemsForDay(currentDay)}
			phases={data.phases}
			tripId={data.trip.id}
		/>

		<div class="mt-4 flex justify-between">
			<button
				type="button"
				disabled={currentDayIndex === 0}
				onclick={() => (currentDayIndex--)}
				class="text-ink-muted rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-100 disabled:opacity-30"
			>
				Previous
			</button>
			<button
				type="button"
				onclick={() => (currentDayIndex++)}
				class="bg-ink text-on-ink rounded-lg px-4 py-2 text-sm font-medium"
			>
				{isLastDay ? 'Review Summary' : 'Next Day'}
			</button>
		</div>
	{:else}
		<div class="bg-surface border-border mt-4 rounded-xl border p-6">
			<h2 class="text-ink text-lg font-semibold">Trip Closeout Summary</h2>
			<p class="text-ink-muted mt-1 text-sm">Here's how your trip shook out.</p>

			<div class="mt-4 space-y-2">
				<div class="flex justify-between text-sm">
					<span class="text-ink-muted">Done</span>
					<span class="font-medium text-green-600">{summary().done}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-ink-muted">Skipped (stayed planned)</span>
					<span class="text-ink-muted font-medium">{summary().planned}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-ink-muted">Swapped (considered)</span>
					<span class="font-medium text-amber-600">{summary().considered}</span>
				</div>
				<div class="border-border flex justify-between border-t pt-2 text-sm">
					<span class="text-ink font-medium">Total items</span>
					<span class="text-ink font-medium">{summary().total}</span>
				</div>
			</div>

			<div class="mt-6 flex flex-col gap-2">
				<form
					method="POST"
					action="?/finishCloseout"
					use:enhance={() => {
						finishing = true;
						return async () => {
							finishing = false;
						};
					}}
				>
					<button
						type="submit"
						disabled={finishing}
						class="bg-ink text-on-ink w-full rounded-lg px-4 py-3 text-sm font-medium disabled:opacity-50"
					>
						{finishing ? 'Archiving...' : 'Finish & Archive Trip'}
					</button>
				</form>

				<button
					type="button"
					onclick={() => (currentDayIndex = totalDays - 1)}
					class="text-ink-muted py-2 text-sm"
				>
					Go back and review
				</button>
			</div>
		</div>
	{/if}
</main>
