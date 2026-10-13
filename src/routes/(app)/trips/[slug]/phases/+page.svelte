<script lang="ts">
	import { withOrigin } from '$lib/shell/back-nav';
	import { page } from '$app/state';
	import NavBar from '$lib/ui/NavBar.svelte';
	import SubTabs from '$lib/ui/SubTabs.svelte';
	import SectionH from '$lib/ui/SectionH.svelte';
	import PhaseCalendarEditor from '$lib/itinerary/components/PhaseCalendarEditor.svelte';
	import PhaseOverviewCard from '$lib/itinerary/components/PhaseOverviewCard.svelte';

	let { data, form } = $props();

</script>

<NavBar title="Phases" subtitle={data.trip.title} back backHref="/trips/{data.trip.slug}" />
<SubTabs tabs={[
	{ id: 'overview', label: 'Overview', href: `/trips/${data.trip.slug}` },
	{ id: 'phases', label: 'Phases', href: `/trips/${data.trip.slug}/phases` },
	{ id: 'lists', label: 'Lists', href: `/trips/${data.trip.slug}/lists` },
	{ id: 'goals', label: 'Goals', href: `/trips/${data.trip.slug}/goals` }
]} />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8 space-y-4">
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
				{#each data.orphans as orphan (orphan.id)}
					<li>
						<a
							href={withOrigin(`/trips/${data.trip.slug}/items/${orphan.id}/edit`, page.url.pathname)}
							class="bg-surface hover:bg-surface-2 active:bg-surface-2 border-line text-ink flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
						>
							<span class="min-w-0 truncate">{orphan.title || 'Untitled idea'}</span>
							<span class="text-ink-muted shrink-0 text-xs capitalize">{orphan.type}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<!-- #391/#401 — Phase Overview: a card per phase. -->
	<div class="space-y-3 md-desktop:grid md-desktop:grid-cols-2 md-desktop:gap-3 md-desktop:space-y-0">
		{#each data.cards as card (card.phase.id)}
			<PhaseOverviewCard
				phase={card.phase}
				days={card.days}
				plannedByDay={card.plannedByDay}
				ideaCount={card.ideaCount}
				unratedCount={card.unratedCount}
				tripSlug={data.trip.slug}
			/>
		{/each}
	</div>

	<!-- Restructuring sits below the cards. -->
	<section class="border-line space-y-4 border-t pt-5">
		<SectionH>Edit phases</SectionH>
		<PhaseCalendarEditor trip={data.trip} phases={data.phases} {form} />
	</section>
</main>
