<script lang="ts">
	import { withOrigin } from '$lib/shell/back-nav';
	import { page } from '$app/state';
	// Flights Smart List (#225) — a read-only chronological lens over the trip's
	// flight items. Each flight is a Row (#433): the title, then `Thu Oct 1 · 2:05p →
	// 4:20p · MKE → DEN` (the arrival time drops first when it won't fit), with the
	// passengers as the trailing value. NO check-off, NO write actions: it is a view,
	// not a checklist. Mirrors the Booking list's chrome (NavBar + lens banner + Card).
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Row from '$lib/ui/Row.svelte';
	import PersonBubble from '$lib/ui/PersonBubble.svelte';
	import FlightSubLine from '$lib/itinerary/components/FlightSubLine.svelte';
	import { rowTrailing } from '$lib/itinerary/row';

	let { data } = $props();

	const listsBase = $derived(`/trips/${data.trip.slug}/lists`);
	const MAX_BUBBLES = 3;
</script>

<NavBar title="Flights" subtitle="Auto · read-only" back backHref={listsBase} />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8">
	<!-- Lens banner -->
	<div class="border-sky bg-sky-tint mb-3.5 flex gap-3 rounded-xl border px-3.5 py-3">
		<span class="mt-0.5 shrink-0">
			<svg width="15" height="15" viewBox="0 0 20 20" fill="none">
				<path
					d="M2 11l16-6-5 13-2.5-5L2 11z"
					stroke="var(--color-sky)"
					stroke-width="1.5"
					stroke-linejoin="round"
				/>
			</svg>
		</span>
		<p class="text-ink-soft text-[12px] leading-relaxed">
			<strong class="text-sky font-bold">A lens over your itinerary.</strong> Every flight you've added,
			in departure order, with who's on board. Read-only — edit a flight from its own card.
		</p>
	</div>

	{#if data.rows.length > 0}
		<Card>
			<div class="px-4">
				{#each data.rows as row, i (row.id)}
					{#snippet subline()}
						<FlightSubLine sub={row.sub} />
					{/snippet}
					{#snippet trailing()}
						<span class="flex items-center" aria-label="{row.assignees.length} on this flight">
							<span class="flex -space-x-1.5">
								{#each row.assignees.slice(0, MAX_BUBBLES) as a, j (j)}
									<PersonBubble name={a.name} initial={a.initial} img={a.img} />
								{/each}
							</span>
							{#if row.assignees.length > MAX_BUBBLES}
								<span class="text-ink-soft ml-1 text-[11px] font-semibold">+{row.assignees.length - MAX_BUBBLES}</span>
							{/if}
						</span>
					{/snippet}
					<Row
						type="flight"
						title={row.title}
						{subline}
						href={withOrigin(`/trips/${data.trip.slug}/items/${row.id}`, page.url.pathname)}
						trailing={rowTrailing({ people: row.assignees.length }) === 'people' ? trailing : undefined}
						divider={i < data.rows.length - 1}
					/>
				{/each}
			</div>
		</Card>
	{:else}
		<p class="text-ink-muted font-display mt-6 px-1 text-sm italic">
			No flights yet. Add a flight to your itinerary and it shows up here.
		</p>
	{/if}

	<div class="text-ink-muted mt-3 flex items-center gap-1.5 px-1">
		<svg width="14" height="14" viewBox="0 0 20 20" fill="none">
			<path
				d="M10 3a7 7 0 1 0 7 7M10 3v0a7 7 0 0 1 7 7M14 3v3h3"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
		<span class="font-display text-[11px] italic">
			Updates automatically as you plan. Nothing to check off.
		</span>
	</div>
</main>
