<script lang="ts">
	import { itineraryDensity, type ItineraryDensity } from '$lib/shell/stores/itinerary-density';

	// #401 — Compact / Details for the Overview itinerary.
	const options: { value: ItineraryDensity; label: string }[] = [
		{ value: 'compact', label: 'Compact' },
		{ value: 'details', label: 'Details' }
	];
</script>

<div class="border-line bg-surface inline-flex items-center gap-0.5 rounded-full border p-0.5" role="group" aria-label="Itinerary density">
	{#each options as opt (opt.value)}
		<button
			type="button"
			onclick={() => itineraryDensity.set(opt.value)}
			aria-pressed={$itineraryDensity === opt.value}
			class="min-h-8 rounded-full px-3 text-[11px] font-semibold transition-colors {$itineraryDensity === opt.value
				? 'bg-ink text-paper'
				: 'text-ink-muted hover:text-ink-soft active:text-ink-soft'}"
		>
			{opt.label}
		</button>
	{/each}
</div>
