<script lang="ts">
	import { page } from '$app/state';
	import type { Trip, Phase, Day, Item, Vote, TripMember } from '$lib/types';
	import { getActiveSection, formatTripDate } from '$lib/shell/trip-nav';
	import { tripToday, tripTz } from '$lib/shell/trip-time';
	import ParkingLotSection from '$lib/itinerary/components/ParkingLotSection.svelte';

	let {
		slug,
		trip,
		phases = [],
		days = []
	}: {
		slug: string;
		trip?: Trip;
		phases?: Phase[];
		days?: Day[];
	} = $props();

	let activeContext = $derived(getActiveSection(page.url.pathname));

	const isDayPage = $derived(page.url.pathname.includes('/days/'));

	// Phase-scoped "Ideas" (#159): the day page's load supplies parkingLotItems
	// filtered to that day's phases; it reaches the rail via merged page data
	// (same plumb as documentSummary below) because the trip layout loader can't
	// see dayId. No other route returns this key, so it's empty off day pages.
	const parkingLotItems = $derived((page.data.parkingLotItems as Item[] | undefined) ?? []);

	// Same merged-page-data plumb: the day load carries the roster (with avatars)
	// and votes so the rail's parking cards render assignee bubbles + a vote count
	// pill (ADR-0011), consistent with the mobile parking lot.
	const railMembers = $derived((page.data.members as TripMember[] | undefined) ?? []);
	const railVotesByItem = $derived(
		(page.data.votesByItem as Record<string, Vote[]> | undefined) ?? {}
	);

	const today = $derived(tripToday(tripTz(trip ?? {})));

	const todayDay = $derived(days.find((d) => d.date.split(/[T ]/)[0] === today));

	const upcomingDays = $derived(
		days
			.filter((d) => d.date.split(/[T ]/)[0] >= today)
			.slice(0, 5)
	);

	const tripDuration = $derived.by(() => {
		if (!trip?.start_date || !trip?.end_date) return 0;
		const start = new Date(trip.start_date.split(/[T ]/)[0] + 'T00:00:00Z');
		const end = new Date(trip.end_date.split(/[T ]/)[0] + 'T00:00:00Z');
		return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
	});

	const daysUntilTrip = $derived.by(() => {
		if (!trip?.start_date) return null;
		const start = new Date(trip.start_date.split(/[T ]/)[0] + 'T00:00:00Z');
		const now = new Date(today + 'T00:00:00Z');
		const diff = Math.round((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
		if (diff < 0) return null;
		return diff;
	});

	const currentPhase = $derived(
		phases.find((p) => {
			const start = p.start_date.split(/[T ]/)[0];
			const end = p.end_date.split(/[T ]/)[0];
			return today >= start && today <= end;
		})
	);

	function phasesForDay(day: Day): Phase[] {
		return phases.filter((p) => day.phases.includes(p.id));
	}
</script>

<aside
	class="border-line bg-surface fixed right-0 top-0 hidden h-full w-[320px] flex-col overflow-y-auto border-l lg-desktop:flex"
	aria-label="Context panel"
>
	<!-- Trip overview header -->
	{#if trip}
		<div class="border-line space-y-2 border-b px-5 py-4">
			<h2 class="text-ink text-sm font-semibold">{trip.title}</h2>
			<div class="text-ink-muted flex items-center gap-2 text-xs">
				{#if trip.start_date}
					<span>{formatTripDate(trip.start_date)} — {formatTripDate(trip.end_date)}</span>
					<span class="text-line">|</span>
					<span>{tripDuration} days</span>
				{:else}
					<!-- #270: a forming (dateless) trip — never "Invalid Date". -->
					<span>No dates yet</span>
				{/if}
			</div>
			{#if daysUntilTrip !== null && daysUntilTrip > 0}
				<p class="text-moss text-xs font-medium">
					{daysUntilTrip} {daysUntilTrip === 1 ? 'day' : 'days'} away
				</p>
			{:else if daysUntilTrip === 0}
				<p class="text-moss text-xs font-medium">Starts today</p>
			{/if}
			{#if trip.location_summary}
				<p class="text-ink-muted text-xs">{trip.location_summary}</p>
			{/if}
		</div>
	{/if}

	<!-- Route-specific content -->
	{#if activeContext === 'itinerary'}
		<!-- Day at a glance -->
		{#if todayDay}
			{@const todayPhases = phasesForDay(todayDay)}
			<div class="border-line space-y-2 border-b px-5 py-4">
				<h3 class="text-ink-soft text-xs font-semibold uppercase tracking-wider">Today</h3>
				<p class="text-ink text-sm font-medium">{formatTripDate(todayDay.date, 'full')}</p>
				{#if todayPhases.length > 0}
					<div class="flex flex-wrap gap-1.5">
						{#each todayPhases as phase}
							<span
								class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
								style="background-color: var(--color-moss-tint); color: var(--color-moss)"
							>
								<span class="h-1.5 w-1.5 rounded-full" style="background-color: var(--color-moss)"></span>
								{phase.name}
							</span>
						{/each}
					</div>
				{/if}
				{#if todayDay.notes}
					<p class="text-ink-muted text-xs leading-relaxed">{todayDay.notes}</p>
				{/if}
			</div>
		{:else if currentPhase}
			<div class="border-line space-y-2 border-b px-5 py-4">
				<h3 class="text-ink-soft text-xs font-semibold uppercase tracking-wider">Current Phase</h3>
				<div class="flex items-center gap-2">
					<span class="h-2.5 w-2.5 rounded-full" style="background-color: var(--color-moss)"></span>
					<span class="text-ink text-sm font-medium">{currentPhase.name}</span>
				</div>
				{#if currentPhase.location}
					<p class="text-ink-muted text-xs">{currentPhase.location}</p>
				{/if}
			</div>
		{/if}

		<!-- Up next -->
		{#if upcomingDays.length > 0}
			<div class="space-y-1 px-5 py-4">
				<h3 class="text-ink-soft mb-2 text-xs font-semibold uppercase tracking-wider">Up Next</h3>
				{#each upcomingDays as day}
					{@const dayPhases = phasesForDay(day)}
					<a
						href="/trips/{slug}/days/{day.id}"
						class="hover:bg-paper -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors"
					>
						<div class="text-center">
							<div class="text-ink-muted text-[11px] uppercase">
								{new Date(day.date.split(/[T ]/)[0] + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}
							</div>
							<div class="text-ink text-sm font-semibold">
								{new Date(day.date.split(/[T ]/)[0] + 'T00:00:00Z').getUTCDate()}
							</div>
						</div>
						<div class="min-w-0 flex-1">
							{#if dayPhases.length > 0}
								<p class="text-moss truncate text-xs font-medium">
									{dayPhases.map(p => p.name).join(' · ')}
								</p>
							{:else}
								<p class="text-ink-muted text-xs">No phase</p>
							{/if}
						</div>
					</a>
				{/each}
			</div>
		{/if}

		<!-- Parking lot (day pages only) -->
		{#if isDayPage && parkingLotItems.length > 0}
			<div class="border-line space-y-2 border-t px-5 py-4">
				<h3 class="text-ink-soft text-xs font-semibold uppercase tracking-wider">Ideas</h3>
				<ParkingLotSection
					items={parkingLotItems}
					{phases}
					tripSlug={slug}
					members={railMembers}
					votesByItem={railVotesByItem}
				/>
			</div>
		{/if}

	{:else if activeContext === 'money'}
		<!-- Budget context — summary from phases -->
		<div class="space-y-2 px-5 py-4">
			<h3 class="text-ink-soft text-xs font-semibold uppercase tracking-wider">Budget Overview</h3>
			<p class="text-ink-muted text-xs">
				Track expenses across {phases.length} {phases.length === 1 ? 'phase' : 'phases'} and {tripDuration} days.
			</p>
			{#if phases.length > 0}
				<div class="space-y-1.5 pt-1">
					{#each phases as phase}
						<div class="flex items-center gap-2 text-xs">
							<span class="h-2 w-2 shrink-0 rounded-full" style="background-color: var(--color-moss)"></span>
							<span class="text-ink-soft flex-1 truncate">{phase.name}</span>
							<span class="text-ink-muted">{formatTripDate(phase.start_date)}</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>

	{:else if activeContext === 'members'}
		<!-- Members context — phases as reference -->
		<div class="space-y-2 px-5 py-4">
			<h3 class="text-ink-soft text-xs font-semibold uppercase tracking-wider">Trip Overview</h3>
			<p class="text-ink-muted text-xs">
				{tripDuration} days across {phases.length} {phases.length === 1 ? 'phase' : 'phases'}.
			</p>
			{#if phases.length > 0}
				<div class="space-y-2 pt-2">
					{#each phases as phase}
						<div class="flex items-start gap-2">
							<span class="mt-1 h-2 w-2 shrink-0 rounded-full" style="background-color: var(--color-moss)"></span>
							<div class="min-w-0">
								<p class="text-ink text-xs font-medium">{phase.name}</p>
								<p class="text-ink-muted text-[11px]">
									{formatTripDate(phase.start_date)} — {formatTripDate(phase.end_date)}
									{#if phase.location}
										· {phase.location}
									{/if}
								</p>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		{:else if activeContext === 'documents'}
			<!-- Documents summary — file count + per-type breakdown (PRD D3). Sourced
			     from the documents page load via page.data. -->
			{@const summary = page.data.documentSummary as { total: number; breakdown: { label: string; count: number }[] } | undefined}
			<div class="space-y-2 px-5 py-4">
				<h3 class="text-ink-soft text-xs font-semibold uppercase tracking-wider">Documents</h3>
				<p class="text-ink-muted text-xs">
					{summary?.total ?? 0} {(summary?.total ?? 0) === 1 ? 'file' : 'files'} on this trip.
				</p>
				{#if summary && summary.breakdown.length > 0}
					<div class="space-y-1.5 pt-1">
						{#each summary.breakdown as row}
							<div class="flex items-center gap-2 text-xs">
								<span class="text-ink-soft flex-1 truncate">{row.label}</span>
								<span class="text-ink-muted font-mono tabular-nums">{row.count}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</aside>
