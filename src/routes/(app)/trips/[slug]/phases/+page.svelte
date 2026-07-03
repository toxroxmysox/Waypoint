<script lang="ts">
	import NavBar from '$lib/ui/NavBar.svelte';
	import SubTabs from '$lib/ui/SubTabs.svelte';
	import SectionH from '$lib/ui/SectionH.svelte';
	import PhaseCalendarEditor from '$lib/itinerary/components/PhaseCalendarEditor.svelte';

	let { data, form } = $props();

	// The page carries two distinct concerns — rating/sorting IDEAS (the swipe deck +
	// legacy orphans) and reorganising PHASES (the calendar). Show the Ideas heading only
	// when there's something to rate/sort; the divider separates the two sections.
	const showIdeas = $derived(
		(data.unratedTotal > 0 && !!data.launchPhaseId) || data.orphans.length > 0
	);
</script>

<NavBar title="Phases" subtitle={data.trip.title} back backHref="/trips/{data.trip.slug}" />
<SubTabs tabs={[
	{ id: 'overview', label: 'Overview', href: `/trips/${data.trip.slug}` },
	{ id: 'phases', label: 'Phases', href: `/trips/${data.trip.slug}/phases` },
	{ id: 'lists', label: 'Lists', href: `/trips/${data.trip.slug}/lists` },
	{ id: 'goals', label: 'Goals', href: `/trips/${data.trip.slug}/goals` }
]} />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8 space-y-4">
	<!-- Section 1 — IDEAS: rate the parking lot + re-home any phase-less strays. -->
	{#if showIdeas}
	<section class="space-y-3">
		<SectionH>Ideas</SectionH>

		<!-- #123: rate-your-ideas launch deck. -->
		{#if data.unratedTotal > 0 && data.launchPhaseId}
			<a
				href="/trips/{data.trip.slug}/swipe/{data.launchPhaseId}"
				class="bg-moss text-paper hover:bg-moss-soft flex items-center gap-3 rounded-lg px-4 py-3 shadow-card transition-colors"
			>
				<span aria-hidden="true" class="text-xl">♥</span>
				<span class="min-w-0 flex-1">
					<span class="block text-sm font-semibold">Swipe through {data.unratedTotal} unrated</span>
					<span class="text-paper/80 block text-xs">Rate items fast, one phase at a time</span>
				</span>
				<span aria-hidden="true" class="text-lg">›</span>
			</a>
		{/if}

		<!-- #196: legacy phase-less ideas, re-home each. -->
		{#if data.orphans.length > 0}
		<section aria-label="Unsorted ideas" class="border-clay/30 bg-clay/10 rounded-lg border p-4 space-y-2">
			<div class="flex items-center gap-2">
				<span aria-hidden="true" class="text-clay text-lg">⚠</span>
				<h2 class="text-ink text-sm font-semibold">
					{data.orphans.length} Unsorted idea{data.orphans.length === 1 ? '' : 's'}
				</h2>
			</div>
			<p class="text-ink-muted text-xs">
				These ideas have no phase, so they don't appear in any parking lot. Open each one and
				assign it a phase (or a day) to file it back.
			</p>
			<ul class="space-y-1">
				{#each data.orphans as orphan}
					<li>
						<a
							href="/trips/{data.trip.slug}/items/{orphan.id}/edit"
							class="bg-surface hover:bg-surface-2 border-line text-ink flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
						>
							<span class="min-w-0 truncate">{orphan.title || 'Untitled idea'}</span>
							<span class="text-ink-muted shrink-0 text-xs capitalize">{orphan.type}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	</section>
	{/if}

	<!-- Section 2 — PHASES: the calendar editor; a divider separates it from Ideas. -->
	<section class="space-y-4 {showIdeas ? 'border-line border-t pt-5' : ''}">
		<SectionH>Phases</SectionH>
		<PhaseCalendarEditor trip={data.trip} phases={data.phases} {form} />
	</section>
</main>
