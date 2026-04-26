<script lang="ts">
	import type { Phase, Day } from '$lib/types';
	import { phasesForDay } from '$lib/utils/phases';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Pill from '$lib/components/ui/Pill.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import SectionH from '$lib/components/ui/SectionH.svelte';
	import TripTabs from '$lib/components/TripTabs.svelte';
	import { titleCase } from '$lib/utils/format';

	let { data } = $props();

	function formatDateRange(start: string, end: string): string {
		const s = new Date(start.replace(' ', 'T'));
		const e = new Date(end.replace(' ', 'T'));
		const startStr = s.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
		const endStr = e.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		});
		return `${startStr} – ${endStr}`;
	}

	function daysInPhase(phase: Phase): Day[] {
		return data.days.filter((d: Day) => (d.phases ?? []).includes(phase.id));
	}

	function dayLabel(d: Day): string {
		return new Date(d.date.replace(' ', 'T')).toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}

	let firstDayId = $derived(data.days[0]?.id);
</script>

<NavBar
	title={data.trip.title}
	subtitle={data.trip.location_summary || undefined}
	subtitleStyle="tagline"
	back
	backHref="/trips"
/>
<TripTabs slug={data.trip.slug} />

<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-8 space-y-6">
	<!-- Trip stats card -->
	<Card>
		<div class="flex items-start justify-between p-4">
			<div>
				<p class="text-ink-soft font-mono text-[12px]">
					{formatDateRange(data.trip.start_date, data.trip.end_date)}
				</p>
				{#if data.trip.timezone}
					<p class="text-ink-muted font-mono mt-0.5 text-[11px]">{data.trip.timezone}</p>
				{/if}
				<p class="text-ink-soft mt-2 text-sm">
					<span class="font-mono">{data.days.length}</span> days ·
					<span class="font-mono">{data.phases.length}</span> phase{data.phases.length === 1 ? '' : 's'}
				</p>
			</div>
			<Pill variant={data.membership.role === 'owner' ? 'ink' : 'default'} size="sm">
				{titleCase(data.membership.role)}
			</Pill>
		</div>
	</Card>

	<!-- Phases -->
	{#if data.phases.length > 0}
		<section class="space-y-2">
			<SectionH>
				{#snippet right()}
					<a class="text-ink-muted hover:text-ink-soft" href="/trips/{data.trip.slug}/phases"
						>Manage</a
					>
				{/snippet}
				Phases
			</SectionH>
			{#each data.phases as phase}
				<Card href="/trips/{data.trip.slug}/phases/{phase.id}" accent={phase.color}>
					<div class="p-3">
						<div class="flex items-center gap-2">
							<h3 class="text-ink font-semibold">{phase.name}</h3>
						</div>
						<p class="text-ink-muted font-mono mt-1 text-[11.5px]">
							{formatDateRange(phase.start_date, phase.end_date)}
							{#if phase.location}
								<span class="text-line">·</span> {phase.location}
							{/if}
							<span class="text-line">·</span> {daysInPhase(phase).length} days
						</p>
					</div>
				</Card>
			{/each}
		</section>
	{:else}
		<!-- M1 empty state: only CTAs that exist in M1 -->
		<Card>
			<div class="p-6 text-center">
				<p class="font-display text-ink-soft text-base italic">A blank itinerary.</p>
				<p class="text-ink-muted mt-1 text-sm">Start by adding a phase or scheduling something.</p>
				<div class="mt-4 flex flex-wrap items-center justify-center gap-2">
					<Button href="/trips/{data.trip.slug}/phases" variant="moss" size="sm">
						Add a phase
					</Button>
					{#if firstDayId}
						<Button
							href="/trips/{data.trip.slug}/items/new?day={firstDayId}"
							variant="ghost"
							size="sm"
						>
							Add a day item
						</Button>
					{/if}
				</div>
			</div>
		</Card>
	{/if}

	<!-- Days timeline -->
	{#if data.days.length > 0}
		<section class="space-y-1.5">
			<SectionH>Days</SectionH>
			<div class="space-y-1">
				{#each data.days as day}
					{@const dp = phasesForDay(day, data.phases)}
					<Card href="/trips/{data.trip.slug}/days/{day.id}">
						<div class="flex items-center justify-between px-3 py-2">
							<span class="text-ink text-sm">{dayLabel(day)}</span>
							{#if dp.length > 0}
								<span class="text-ink-muted flex items-center gap-1 text-[11.5px]">
									{#each dp as p, idx}
										{#if p.color}
											<span
												class="h-2 w-2 rounded-full"
												style="background-color: {p.color}"
											></span>
										{/if}
										<span>{p.name}</span>
										{#if idx < dp.length - 1}
											<span class="text-line">→</span>
										{/if}
									{/each}
								</span>
							{/if}
						</div>
					</Card>
				{/each}
			</div>
		</section>
	{/if}
</main>
