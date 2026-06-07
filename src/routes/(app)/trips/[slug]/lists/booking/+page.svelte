<script lang="ts">
	import { fade } from 'svelte/transition';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import SmartRow from '$lib/itinerary/components/SmartRow.svelte';

	let { data } = $props();

	const listsBase = $derived(`/trips/${data.trip.slug}/lists`);

	// Optimistic: a row marked booked shows the "Booked" pill + dims, then the
	// projection refetch drops it (out:fade ~300ms).
	let booking = $state(new Set<string>());
	function markBooking(id: string) {
		booking = new Set(booking).add(id);
	}
</script>

<NavBar title="Booking" subtitle="Auto · read-only" back backHref={listsBase} />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8">
	<!-- Lens banner -->
	<div class="border-gold bg-gold-tint mb-3.5 flex gap-3 rounded-xl border px-3.5 py-3">
		<span class="mt-0.5 shrink-0">
			<svg width="15" height="15" viewBox="0 0 20 20" fill="none">
				<path d="M10 2L11.5 7L16 8L11.5 9L10 14L8.5 9L4 8L8.5 7L10 2z" fill="var(--color-gold-deep)" />
			</svg>
		</span>
		<p class="text-ink-soft text-[12px] leading-relaxed">
			<strong class="text-gold-deep font-bold">A lens over your itinerary.</strong> These rows are planned items
			that still need a reservation. Check one to mark it <strong class="text-ink">booked</strong> — it then leaves
			this list.
		</p>
	</div>

	{#if data.rows.length > 0}
		<Card>
			<div class="px-4">
				{#each data.rows as row, i (row.id)}
					<div out:fade={{ duration: 300 }}>
						<SmartRow
							itemId={row.id}
							type={row.type}
							subtype={row.subtype}
							title={row.title}
							meta={row.meta}
							href="/trips/{data.trip.slug}/items/{row.id}"
							bookAction="?/book"
							pending={booking.has(row.id)}
							onBook={() => markBooking(row.id)}
							divider={i < data.rows.length - 1}
						/>
					</div>
				{/each}
			</div>
		</Card>
	{:else}
		<p class="text-ink-muted font-display mt-6 px-1 text-sm italic">
			All booked. Nothing left to reserve.
		</p>
	{/if}

	<div class="text-ink-muted mt-3 flex items-center gap-1.5 px-1">
		<svg width="14" height="14" viewBox="0 0 20 20" fill="none">
			<path d="M10 3a7 7 0 1 0 7 7M10 3v0a7 7 0 0 1 7 7M14 3v3h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
		<span class="font-display text-[11px] italic">Updates automatically as you plan. Nothing to add by hand.</span>
	</div>
</main>
