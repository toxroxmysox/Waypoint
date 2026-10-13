<script lang="ts">
	import type { Day, Phase } from '$lib/types';
	import LevelHeader from './LevelHeader.svelte';
	import { spanLabel, dateRangeLabel } from '$lib/itinerary/span-label';
	import { formatCalendarDate } from '$lib/shell/format';

	// #391/#401 — a Phase Overview card: the phase's Level Header (read-only notes,
	// day chips) and its swipe launcher. The header opens Phase Detail; only the
	// day chips and the swipe row go elsewhere. No In/Staying/Out here.
	let {
		phase,
		days,
		plannedByDay,
		ideaCount,
		unratedCount,
		tripSlug
	}: {
		phase: Phase;
		days: Day[];
		plannedByDay: Record<string, number>;
		ideaCount: number;
		unratedCount: number;
		tripSlug: string;
	} = $props();

	const label = (d: Day) =>
		`${formatCalendarDate(d.date, { weekday: 'short' })} ${formatCalendarDate(d.date, { day: 'numeric' })}`;
	const chips = $derived(
		days.map((d) => ({
			label: label(d),
			href: `/trips/${tripSlug}/days/${d.id}`,
			filled: (plannedByDay[d.id] ?? 0) > 0,
			travel: (d.phases?.length ?? 0) > 1
		}))
	);
	const ideasLabel = $derived(`${ideaCount} idea${ideaCount === 1 ? '' : 's'}`);
</script>

<article class="border-line bg-surface rounded-lg border p-4 shadow-card" data-phase-card={phase.id}>
	<LevelHeader
		title={phase.name}
		place={phase.location}
		dates={dateRangeLabel(phase.start_date, phase.end_date)}
		span={spanLabel(phase.start_date, phase.end_date)}
		href="/trips/{tripSlug}/phases/{phase.id}"
		{chips}
		size="card"
	>
		{#snippet notes()}
			{#if phase.notes}
				<a href="/trips/{tripSlug}/phases/{phase.id}" class="text-ink-soft block text-sm whitespace-pre-wrap" tabindex="-1">{phase.notes}</a>
			{/if}
		{/snippet}
	</LevelHeader>

	{#if ideaCount > 0}
		<div class="border-line mt-3 border-t pt-2">
			{#if unratedCount > 0}
				<a
					href="/trips/{tripSlug}/swipe/{phase.id}?from={encodeURIComponent(`/trips/${tripSlug}/phases`)}"
					class="flex min-h-11 items-center justify-between gap-2 text-sm"
				>
					<span class="text-ink-soft">{ideasLabel} · {unratedCount} to rate</span>
					<span class="text-moss font-semibold">Swipe ›</span>
				</a>
			{:else}
				<p class="text-ink-muted flex min-h-11 items-center text-sm">{ideasLabel} · all rated</p>
			{/if}
		</div>
	{/if}
</article>
