<script lang="ts">
	import { dayCardMetric, type DayCardMetric } from '$lib/shell/stores/day-card-metric';

	// Segmented control for the day card's second metric. Drives the persisted,
	// cross-surface preference — flipping it here updates every day card at once.

	const options: { value: DayCardMetric; label: string }[] = [
		{ value: 'booked', label: 'Booked' },
		{ value: 'budget', label: 'Budget' }
	];
</script>

<div
	class="border-line bg-surface inline-flex items-center gap-0.5 rounded-full border p-0.5"
	role="group"
	aria-label="Day metric"
>
	{#each options as opt (opt.value)}
		<button
			type="button"
			onclick={() => dayCardMetric.set(opt.value)}
			aria-pressed={$dayCardMetric === opt.value}
			class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors {$dayCardMetric ===
			opt.value
				? 'bg-ink text-paper'
				: 'text-ink-muted hover:text-ink-soft'}"
		>
			{opt.label}
		</button>
	{/each}
</div>
