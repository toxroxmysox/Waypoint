<script lang="ts">
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Avatar from '$lib/ui/Avatar.svelte';
	import FAB from '$lib/shell/components/FAB.svelte';
	import { clearOfflineCaches } from '$lib/documents/offline-cache';

	let { data } = $props();

	function formatDateRange(start: string, end: string): string {
		const s = new Date(start.replace(' ', 'T'));
		const e = new Date(end.replace(' ', 'T'));
		const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };
		const startStr = s.toLocaleDateString('en-US', opts);
		const endStr = e.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
		return `${startStr} – ${endStr}`;
	}

	let isEmpty = $derived(
		data.active.length === 0 &&
			data.upcoming.length === 0 &&
			data.forming.length === 0 &&
			data.past.length === 0
	);
</script>

<NavBar title="Waypoint" homeLink={false}>
	{#snippet right()}
		<div class="flex items-center gap-3">
			<form method="POST" action="/logout" onsubmit={() => clearOfflineCaches()}>
				<button
					type="submit"
					class="text-ink-muted hover:text-ink-soft text-[12px] font-medium"
				>
					Sign out
				</button>
			</form>
			<a
				href="/account"
				class="hover:opacity-80"
				aria-label="Profile"
				data-sveltekit-preload-data="hover"
			>
				<Avatar img={data.avatarUrl} initial={(data.profileName || '?').slice(0, 1)} alt={data.profileName} size={32} />
			</a>
		</div>
	{/snippet}
</NavBar>

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-24">
	{#if data.pendingClaims > 0}
		<!-- #179c: pending placeholder claims skipped at login are otherwise
		     stranded until the next fresh login. This card re-enters the flow. -->
		<a href="/claim" class="mb-4 block" data-sveltekit-preload-data="hover">
			<Card strong accent="var(--color-moss)">
				<div class="flex items-center gap-3 p-4">
					<span
						class="bg-moss-tint text-moss flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
						aria-hidden="true"
					>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M20 6 9 17l-5-5" />
						</svg>
					</span>
					<div class="min-w-0 flex-1">
						<p class="text-ink text-sm font-semibold">
							{#if data.pendingClaims === 1}
								You've been added to {data.firstClaimTitle || 'a trip'}
							{:else}
								{data.pendingClaims} trips are waiting for you
							{/if}
						</p>
						<p class="text-ink-muted text-xs">Tap to review and join.</p>
					</div>
					<svg class="text-ink-muted shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="m9 18 6-6-6-6" />
					</svg>
				</div>
			</Card>
		</a>
	{/if}

	{#if isEmpty}
		<!-- #277 Organic-path polish (ONBOARDING_PRD §7). A direct/creator user with no
		     trips lands here. Make the empty state a clear on-ramp INTO a trip + the shared
		     intro — not a dead-end "No trips yet." Creating a trip drops a fresh user
		     (`onboarded_at == null`) onto the overview, where the SAME member-keyed welcome
		     card auto-shows: the convergence point invited + organic users both reach. The
		     copy previews that card's doors ("see the plan · weigh in · add what you want")
		     so the on-ramp signals what's on the other side. Minimal — NOT the deferred
		     curated-create / "were you invited?" fork (#278). -->
		<div class="py-16 text-center" data-testid="trips-empty-onramp">
			<p class="font-display text-ink text-lg italic">Start your first trip.</p>
			<p class="text-ink-muted mx-auto mt-2 max-w-xs text-sm">
				Spin one up and you'll land on its home, where you can
				<strong class="text-ink-soft">see the plan</strong>,
				<strong class="text-ink-soft">weigh in on ideas</strong>, and
				<strong class="text-ink-soft">add what you want</strong> out of it.
			</p>
			<div class="mt-5 space-y-2">
				<Button href="/trips/new" variant="moss" size="md">New trip</Button>
				<p>
					<a href="/trips/import" class="text-ink-muted text-xs font-medium hover:text-ink-soft">
						or import from JSON
					</a>
				</p>
			</div>
		</div>
	{:else}
		<div class="space-y-6">
			{#if data.active.length > 0}
				<section class="space-y-2">
					<div class="flex items-baseline justify-between pt-1">
						<h2 class="text-moss text-[11px] font-bold tracking-[0.2em] uppercase">On trip</h2>
					</div>
					{#each data.active as { trip }}
						<Card href="/trips/{trip?.slug}" strong accent="var(--color-clay)">
							<div class="p-4">
								<div class="flex items-start justify-between gap-2">
									<h3 class="font-display text-ink text-lg leading-tight font-semibold">
										{trip?.title}
									</h3>
									<Pill variant="trip" size="sm">Now</Pill>
								</div>
								<p class="text-ink-muted font-mono mt-1 text-[12px]">
									{formatDateRange(trip?.start_date ?? '', trip?.end_date ?? '')}
								</p>
								{#if trip?.location_summary}
									<p class="font-display text-ink-soft mt-1 text-sm italic">
										{trip.location_summary}
									</p>
								{/if}
							</div>
						</Card>
					{/each}
				</section>
			{/if}

			{#if data.upcoming.length > 0}
				<section class="space-y-2">
					<div class="flex items-baseline justify-between pt-1">
						<h2 class="text-moss text-[11px] font-bold tracking-[0.2em] uppercase">Upcoming</h2>
					</div>
					{#each data.upcoming as { trip }}
						<Card href="/trips/{trip?.slug}">
							<div class="p-4">
								<h3 class="font-display text-ink text-lg leading-tight font-semibold">
									{trip?.title}
								</h3>
								<p class="text-ink-muted font-mono mt-1 text-[12px]">
									{formatDateRange(trip?.start_date ?? '', trip?.end_date ?? '')}
								</p>
								{#if trip?.location_summary}
									<p class="font-display text-ink-soft mt-1 text-sm italic">
										{trip.location_summary}
									</p>
								{/if}
							</div>
						</Card>
					{/each}
				</section>
			{/if}

			{#if data.forming.length > 0}
				<!-- #270 / ADR-0022 — dateless (forming) trips: still alive, sorted ahead
				     of past. Subtle "No dates yet" badge where a date range would sit. -->
				<section class="space-y-2">
					<div class="flex items-baseline justify-between pt-1">
						<h2 class="text-moss text-[11px] font-bold tracking-[0.2em] uppercase">
							Taking shape
						</h2>
					</div>
					{#each data.forming as { trip }}
						<Card href="/trips/{trip?.slug}">
							<div class="p-4">
								<div class="flex items-start justify-between gap-2">
									<h3 class="font-display text-ink text-lg leading-tight font-semibold">
										{trip?.title}
									</h3>
									<Pill size="sm">No dates yet</Pill>
								</div>
								{#if trip?.location_summary}
									<p class="font-display text-ink-soft mt-1 text-sm italic">
										{trip.location_summary}
									</p>
								{/if}
							</div>
						</Card>
					{/each}
				</section>
			{/if}

			{#if data.past.length > 0}
				<section class="space-y-2">
					<div class="flex items-baseline justify-between pt-1">
						<h2 class="text-ink-muted text-[11px] font-bold tracking-[0.2em] uppercase">
							Past
						</h2>
					</div>
					{#each data.past as { trip }}
						<Card href="/trips/{trip?.slug}" class="opacity-80">
							<div class="p-4">
								<h3 class="text-ink-soft text-base leading-tight font-medium">{trip?.title}</h3>
								<p class="text-ink-muted font-mono mt-1 text-[12px]">
									{formatDateRange(trip?.start_date ?? '', trip?.end_date ?? '')}
								</p>
							</div>
						</Card>
					{/each}
				</section>
			{/if}
		</div>
	{/if}
</main>

{#if !isEmpty}
	<div class="fixed bottom-20 left-0 right-0 text-center">
		<a href="/trips/import" class="text-ink-muted text-xs font-medium hover:text-ink-soft">
			Import from JSON
		</a>
	</div>
	<FAB href="/trips/new" label="New trip" />
{/if}
