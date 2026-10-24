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
<SubTabs
	tabs={[
		{ id: 'overview', label: 'Overview', href: `/trips/${data.trip.slug}` },
		{ id: 'phases', label: 'Phases', href: `/trips/${data.trip.slug}/phases` },
		{ id: 'lists', label: 'Lists', href: `/trips/${data.trip.slug}/lists` },
		{ id: 'goals', label: 'Goals', href: `/trips/${data.trip.slug}/goals` }
	]}
/>

<main class="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 pt-4 pb-8 md-desktop:max-w-2xl">
	<!-- #196: legacy phase-less ideas, re-home each. -->
	{#if data.orphans.length > 0}
		<section
			aria-label="Unsorted ideas"
			class="space-y-2 rounded-lg border border-clay/30 bg-clay/10 p-4"
		>
			<div class="flex items-center gap-2">
				<span aria-hidden="true" class="text-lg text-clay">⚠</span>
				<h2 class="text-sm font-semibold text-ink">
					{data.orphans.length} Unsorted idea{data.orphans.length === 1 ? '' : 's'}
				</h2>
			</div>
			<p class="text-xs text-ink-muted">
				These ideas have no phase, so they don't appear in any parking lot. Open each one and assign
				it a phase (or a day) to file it back.
			</p>
			<ul class="space-y-1">
				{#each data.orphans as orphan (orphan.id)}
					<li>
						<a
							href={withOrigin(
								`/trips/${data.trip.slug}/items/${orphan.id}/edit`,
								page.url.pathname
							)}
							class="flex items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink transition-colors hover:bg-surface-2 active:bg-surface-2"
						>
							<span class="min-w-0 truncate">{orphan.title || 'Untitled idea'}</span>
							<span class="shrink-0 text-xs text-ink-muted capitalize">{orphan.type}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<!-- #391/#401 — Phase Overview: a card per phase. -->
	<div
		class="space-y-3 md-desktop:grid md-desktop:grid-cols-2 md-desktop:gap-3 md-desktop:space-y-0"
	>
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
	<section class="space-y-4 border-t border-line pt-5">
		<SectionH>Edit phases</SectionH>
		<PhaseCalendarEditor trip={data.trip} phases={data.phases} {form} />
	</section>
</main>
