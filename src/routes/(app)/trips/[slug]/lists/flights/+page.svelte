<script lang="ts">
	// Flights Smart List (#225) — a read-only chronological lens over the trip's
	// flight items. Route (from → to) · departure/arrival date-times · per-flight
	// passenger avatars. NO check-off, NO write actions: it is a view, not a
	// checklist. Mirrors the Booking list's chrome (NavBar + lens banner + Card).
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import Avatar from '$lib/ui/Avatar.svelte';

	let { data } = $props();

	const listsBase = $derived(`/trips/${data.trip.slug}/lists`);
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
					<div
						class="flex items-center gap-3 py-[13px] {i < data.rows.length - 1
							? 'border-line border-b'
							: ''}"
					>
						<TypeIcon type="flight" size={34} />

						<div class="min-w-0 flex-1">
							<!-- Route: from → to -->
							<div class="text-ink flex items-center gap-1.5 text-sm leading-tight font-semibold">
								<span class="truncate">{row.from || row.title}</span>
								<svg
									class="text-ink-muted shrink-0"
									width="13"
									height="13"
									viewBox="0 0 20 20"
									fill="none"
									aria-label="to"
								>
									<path
										d="M4 10h11M11 6l4 4-4 4"
										stroke="currentColor"
										stroke-width="1.8"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								<span class="truncate">{row.to || '—'}</span>
							</div>

							<!-- Departure / arrival date-times -->
							<div class="text-ink-muted mt-0.5 truncate font-mono text-[11px] tracking-tight">
								{#if row.dep.date || row.dep.time}
									<span>{[row.dep.date, row.dep.time].filter(Boolean).join(' · ')}</span>
								{:else}
									<span class="italic">No departure set</span>
								{/if}
								{#if row.arr.date || row.arr.time}
									<span class="text-line">&nbsp;→&nbsp;</span>
									<span>{[row.arr.date, row.arr.time].filter(Boolean).join(' · ')}</span>
								{/if}
							</div>
						</div>

						<!-- Passenger avatars (placeholder → initials) -->
						{#if row.assignees.length > 0}
							<span class="flex shrink-0 items-center" aria-label="Passengers">
								{#each row.assignees.slice(0, 4) as a, j (j)}
									<span
										class="ring-surface inline-flex rounded-full ring-[1.5px]"
										style="margin-left:{j === 0 ? 0 : -6}px;"
									>
										<Avatar img={a.img} initial={a.initial} alt={a.name} size={20} />
									</span>
								{/each}
								{#if row.assignees.length > 4}
									<span
										class="border-line bg-surface-2 text-ink-muted ring-surface inline-flex h-5 w-5 items-center justify-center rounded-full border text-[8px] font-bold ring-[1.5px]"
										style="margin-left:-6px;"
									>
										+{row.assignees.length - 4}
									</span>
								{/if}
							</span>
						{/if}

						<a
							href="/trips/{data.trip.slug}/items/{row.id}"
							class="text-sky inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold"
						>
							Open
							<svg width="13" height="13" viewBox="0 0 20 20" fill="none">
								<path
									d="M8 5l5 5-5 5"
									stroke="currentColor"
									stroke-width="1.8"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						</a>
					</div>
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
