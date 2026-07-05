<script lang="ts">
	// #337 — the phase sketch as a miniature tiled strip (spec §Surface "The shape
	// of it"). Read-only; reuses the day-strip editor's visual language (ADR-0021 /
	// #330): each leg tinted by its order (moss → sky → gold → clay), width
	// proportional to its nights, duration-labeled. Durations, not real phases.
	import type { PhaseSketchSegment } from '$lib/ideation/types';
	import { paletteFor } from '$lib/itinerary/phase-calendar';

	let { sketch = [] }: { sketch?: PhaseSketchSegment[] } = $props();

	// Tint + ink per palette slot — the same moss/sky/gold/clay family the phase
	// calendar tints its runs with, at tint strength so the strip reads quietly.
	const TINT: Record<string, { bg: string; ink: string }> = {
		moss: { bg: 'var(--color-moss-tint)', ink: 'var(--color-moss-deep, #3a4a34)' },
		sky: { bg: 'var(--color-sky-tint)', ink: 'var(--color-sky-deep, #2e4a63)' },
		gold: { bg: 'var(--color-gold-tint)', ink: 'var(--color-gold-deep, #7a5a1e)' },
		clay: { bg: 'var(--color-clay-tint)', ink: 'var(--color-clay-deep, #7a3a2e)' }
	};

	const total = $derived(sketch.reduce((sum, s) => sum + Math.max(1, Math.round(s.days || 0)), 0));
</script>

{#if sketch.length > 0}
	<div
		class="flex h-7 overflow-hidden rounded-md"
		role="img"
		aria-label="Phase sketch: {sketch.map((s) => `${s.name} ${s.days} nights`).join(', ')}"
	>
		{#each sketch as seg, i (i)}
			{@const pal = paletteFor(i)}
			{@const days = Math.max(1, Math.round(seg.days || 0))}
			<div
				class="flex min-w-0 items-center justify-center gap-1 border-r-2 border-[var(--color-paper)] px-1.5 text-[10px] whitespace-nowrap last:border-r-0"
				style="flex: {days}; background: {TINT[pal].bg}; color: {TINT[pal].ink};"
				title="{seg.name} · {days} {days === 1 ? 'night' : 'nights'}"
			>
				<span class="truncate font-medium">{seg.name}</span>
				<span class="font-mono opacity-70">·{days}</span>
			</div>
		{/each}
	</div>
{/if}
