<script lang="ts">
	// #337 — the phase sketch editor for the composer. Add/remove/rename named legs
	// with a night count. When dates exist the editor keeps segment-days summing to
	// the window (auto-stretch the last segment), matching the promotion layout
	// (spec §Surface). Serializes to a hidden JSON input the action reads.
	import type { PhaseSketchSegment } from '$lib/ideation/types';
	import { nightsBetween, normalizeSketchToWindow } from '$lib/ideation/scenario-planning';
	import ScenarioSketchStrip from './ScenarioSketchStrip.svelte';

	let {
		segments = $bindable([]),
		dateStart = '',
		dateEnd = ''
	}: {
		segments?: PhaseSketchSegment[];
		dateStart?: string;
		dateEnd?: string;
	} = $props();

	const window = $derived(dateStart && dateEnd ? nightsBetween(dateStart, dateEnd) : 0);
	const total = $derived(segments.reduce((s, seg) => s + Math.max(1, seg.days || 0), 0));
	const serialized = $derived(JSON.stringify(segments));

	function add() {
		segments = [...segments, { name: '', days: window > 0 && segments.length === 0 ? window : 1 }];
	}
	function remove(i: number) {
		segments = segments.filter((_, idx) => idx !== i);
	}
	function normalize() {
		if (window > 0 && segments.length > 0) {
			segments = normalizeSketchToWindow(segments, dateStart, dateEnd);
		}
	}
</script>

<input type="hidden" name="sketch" value={serialized} />

<div class="space-y-2">
	{#if segments.length > 0}
		<ScenarioSketchStrip sketch={segments.filter((s) => s.name.trim())} />
	{/if}

	{#each segments as seg, i (i)}
		<div class="flex items-center gap-2">
			<input
				type="text"
				placeholder="Leg name (e.g. Bangkok)"
				bind:value={seg.name}
				maxlength="60"
				class="border-line bg-surface text-ink min-w-0 flex-1 rounded-md border px-2.5 py-1.5 text-sm"
			/>
			<div class="flex items-center gap-1">
				<input
					type="number"
					min="1"
					bind:value={seg.days}
					aria-label="Nights for {seg.name || 'this leg'}"
					class="border-line bg-surface text-ink w-16 rounded-md border px-2 py-1.5 text-center text-sm"
				/>
				<span class="text-ink-muted text-xs">nt</span>
			</div>
			<button
				type="button"
				onclick={() => remove(i)}
				aria-label="Remove {seg.name || 'leg'}"
				class="text-ink-muted hover:text-clay px-1 text-lg leading-none"
			>
				×
			</button>
		</div>
	{/each}

	<div class="flex items-center justify-between">
		<button
			type="button"
			onclick={add}
			class="text-moss hover:text-ink inline-flex items-center gap-1 text-xs font-semibold"
		>
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
			Add a leg
		</button>
		{#if window > 0 && segments.length > 0}
			<span class="text-ink-muted text-[11px]">
				{total} / {window} nights
				{#if total !== window}
					<button type="button" onclick={normalize} class="text-moss ml-1 font-semibold underline">fit to dates</button>
				{/if}
			</span>
		{/if}
	</div>
</div>
