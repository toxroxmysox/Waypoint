<script lang="ts">
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Pill from '$lib/components/ui/Pill.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FAB from '$lib/components/ui/FAB.svelte';

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
		data.active.length === 0 && data.upcoming.length === 0 && data.past.length === 0
	);
</script>

<NavBar title="Waypoint">
	{#snippet right()}
		<form method="POST" action="/logout">
			<button
				type="submit"
				class="text-ink-muted hover:text-ink-soft text-[12px] font-medium"
			>
				Sign out
			</button>
		</form>
	{/snippet}
</NavBar>

<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-24">
	{#if isEmpty}
		<div class="py-16 text-center">
			<p class="font-display text-ink text-lg italic">No trips yet.</p>
			<p class="text-ink-muted mt-1 text-sm">Plan your first one.</p>
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
