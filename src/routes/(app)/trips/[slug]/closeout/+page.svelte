<script lang="ts">
	import { enhance } from '$app/forms';
	import NavBar from '$lib/ui/NavBar.svelte';
	import CloseoutDayCard from '$lib/itinerary/components/CloseoutDayCard.svelte';
	import PublishControl from '$lib/portability/components/PublishControl.svelte';
	import type { Day, Item } from '$lib/types';
	import { untrack } from 'svelte';

	let { data } = $props();

	// owner/co_owner curate + decide publishing; travelers do the item walk only and
	// their wizard ends at "submit review → closed" (no publish step).
	const canCurate = $derived(data.canCurate ?? false);

	let currentDayIndex = $state(0);
	let finishing = $state(false);
	// Ideas-review step gate (#243): owner/co_owner only, optional, skipped by default.
	// Once reviewed (keep/drop/skip) it advances to the summary. Kept as a flag (not an
	// index bump) so #257's currentDayIndex survival isn't disturbed.
	let ideasReviewed = $state(false);
	// Dropped ideas — client-side dismissal only (unplanned items are already excluded
	// from the record, so dropping needs no write). Kept items leave the pool naturally:
	// keepIdea flips status→considered, then update() re-runs load().
	let droppedIds = $state<string[]>([]);

	// Publish choice (#241) — owner/co_owner only. Binary Keep-private (default) /
	// Publish + inline date defaulting to today; the opt-in budget summary (#243) rides
	// the same control.
	let publish = $state(false);
	let publishDate = $state('');
	let showBudget = $state(false);

	const isOffline = $derived(
		typeof window !== 'undefined' && typeof navigator !== 'undefined' && !navigator.onLine
	);

	const sortedDays = $derived(
		[...data.days].sort((a, b) => a.date.localeCompare(b.date))
	);

	const totalDays = $derived(sortedDays.length);
	const currentDay = $derived(sortedDays[currentDayIndex]);
	const isLastDay = $derived(currentDayIndex >= totalDays - 1);

	// Unplanned parking-lot ideas — the owner-only "what we considered" curation pool.
	// Travelers never see this (canCurate is false for them). Each idea: keep-for-record
	// (→ considered, becomes a public recommendation) or drop (stays unplanned, excluded
	// from the record). Goals review is NOT built (killed in the resolutions).
	const unplannedIdeas = $derived(
		data.items.filter((i) => i.status === 'unplanned' && !droppedIds.includes(i.id))
	);
	// Whether the step EXISTS at all — based on the trip having unplanned ideas at load,
	// independent of in-session drops (so dropping the last idea doesn't yank the step
	// out from under the user mid-review). Derived from the unfiltered set.
	const hasIdeasStep = $derived(
		canCurate && data.items.some((i) => i.status === 'unplanned')
	);

	// After the day walk: the optional owner ideas step, then the summary.
	const showIdeas = $derived(currentDayIndex >= totalDays && hasIdeasStep && !ideasReviewed);
	const showSummary = $derived(
		currentDayIndex >= totalDays && (!hasIdeasStep || ideasReviewed)
	);

	function itemsForDay(day: Day): Item[] {
		return data.items.filter((i) => i.day === day.id);
	}

	const summary = $derived.by(() => {
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

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8">
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
	{:else if !showSummary && !showIdeas}
		<div class="mb-4">
			<div class="flex items-center justify-between">
				<p class="text-ink-muted text-sm font-medium">Day {currentDayIndex + 1} of {totalDays}</p>
			</div>
			<div class="bg-surface-2 mt-2 h-1.5 w-full overflow-hidden rounded-full">
				<div
					class="h-full rounded-full bg-moss transition-all"
					style="width: {((currentDayIndex + 1) / totalDays) * 100}%"
				></div>
			</div>
		</div>

		<CloseoutDayCard
			day={currentDay}
			items={itemsForDay(currentDay)}
			phases={data.phases}
			tripId={data.trip.id}
			days={data.days}
		/>

		<div class="mt-4 flex justify-between">
			<button
				type="button"
				disabled={currentDayIndex === 0}
				onclick={() => (currentDayIndex--)}
				class="text-ink-muted rounded-lg px-4 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-40"
			>
				Previous
			</button>
			<button
				type="button"
				onclick={() => (currentDayIndex++)}
				class="bg-ink text-on-ink rounded-lg px-4 py-2 text-sm font-medium"
			>
				{isLastDay ? (hasIdeasStep ? 'Review ideas' : 'Review Summary') : 'Next Day'}
			</button>
		</div>
	{:else if showIdeas}
		<!-- Owner ideas-review step (#243): OPTIONAL, skipped by default. Each unplanned
		     parking-lot idea: keep-for-record (→ a public "what we considered"
		     recommendation) or drop (stays out of the record). Bulk "keep all". Travelers
		     never reach this (canCurate-gated). Goals review is NOT built (killed). -->
		<div class="mb-4">
			<p class="text-ink text-lg font-semibold">Review your ideas</p>
			<p class="text-ink-muted mt-1 text-sm">
				Ideas you collected but didn't schedule. Keep the good ones as public
				recommendations for anyone who asks "what'd you do?" — or drop them. Optional;
				skip to publish as-is.
			</p>
		</div>

		<div class="space-y-2" data-testid="ideas-review">
			{#each unplannedIdeas as idea (idea.id)}
				<div class="bg-surface border-border flex items-center gap-3 rounded-xl border px-4 py-3">
					<span class="min-w-0 flex-1">
						<span class="text-ink block truncate text-sm font-medium">{idea.title}</span>
						{#if idea.location_name}
							<span class="text-ink-muted block truncate text-xs">{idea.location_name}</span>
						{/if}
					</span>
					<form method="POST" action="?/keepIdea" use:enhance={() => async ({ update }) => update({ reset: false })}>
						<input type="hidden" name="item_id" value={idea.id} />
						<button type="submit" class="rounded-lg bg-moss-tint px-3 py-1.5 text-xs font-semibold text-moss">Keep</button>
					</form>
					<!-- Drop = client-side dismissal; unplanned items are already excluded from
					     the record, so no write is needed. -->
					<button
						type="button"
						onclick={() => (droppedIds = [...droppedIds, idea.id])}
						class="text-ink-muted hover:text-ink px-2 py-1.5 text-xs font-medium"
					>
						Drop
					</button>
				</div>
			{/each}
		</div>

		<div class="mt-5 flex items-center justify-between gap-2">
			<form method="POST" action="?/keepAllIdeas" use:enhance={() => async ({ update }) => update({ reset: false })}>
				{#each unplannedIdeas as idea (idea.id)}
					<input type="hidden" name="item_ids" value={idea.id} />
				{/each}
				<button type="submit" class="text-moss text-sm font-semibold">Keep all</button>
			</form>
			<button
				type="button"
				onclick={() => (ideasReviewed = true)}
				data-testid="ideas-continue"
				class="bg-ink text-on-ink rounded-lg px-4 py-2 text-sm font-medium"
			>
				Continue
			</button>
		</div>
	{:else}
		<div class="bg-surface border-border mt-4 rounded-xl border p-6">
			<h2 class="text-ink text-lg font-semibold">Trip Closeout Summary</h2>
			<p class="text-ink-muted mt-1 text-sm">Here's how your trip shook out.</p>

			<div class="mt-4 space-y-2">
				<div class="flex justify-between text-sm">
					<span class="text-ink-muted">Done</span>
					<span class="font-medium text-moss">{summary.done}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-ink-muted">Skipped (stayed planned)</span>
					<span class="text-ink-muted font-medium">{summary.planned}</span>
				</div>
				<div class="flex justify-between text-sm">
					<span class="text-ink-muted">Swapped (considered)</span>
					<span class="font-medium text-gold">{summary.considered}</span>
				</div>
				<div class="border-border flex justify-between border-t pt-2 text-sm">
					<span class="text-ink font-medium">Total items</span>
					<span class="text-ink font-medium">{summary.total}</span>
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
					{#if canCurate}
						<!-- Owner/co_owner final step: choose whether the public record publishes.
						     Server re-enforces owner/co_owner before honoring these fields (#241). -->
						<div class="border-line mb-4 rounded-xl border p-4">
							<h3 class="text-ink text-sm font-semibold">Share the record</h3>
							<p class="text-ink-muted mt-0.5 mb-3 text-xs">
								Closing out finishes the trip's record. Choose whether to make it public —
								you can change this any time.
							</p>
							<PublishControl
								bind:publish
								bind:publishDate
								bind:showBudget
								showBudgetToggle={true}
							/>
						</div>
					{/if}
					<button
						type="submit"
						disabled={finishing}
						class="bg-ink text-on-ink w-full rounded-lg px-4 py-3 text-sm font-medium disabled:opacity-40"
					>
						{#if finishing}
							{canCurate ? 'Finishing…' : 'Submitting…'}
						{:else}
							{canCurate ? 'Finish & close out trip' : 'Submit review & finish'}
						{/if}
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
