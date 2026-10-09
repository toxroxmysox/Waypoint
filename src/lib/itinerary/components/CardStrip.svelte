<script lang="ts">
	// The Card's strip (#420; spec §Card anatomy): info and pills on the left in
	// priority order, people on the right (`right` snippet). When the left overflows
	// the lowest-priority entry shrinks to its icon, then drops (`fitStrip`). Widths
	// are estimated from text length (`estimateTextWidth`) against the measured
	// strip, so the rule is deterministic and unit-tested; before measurement
	// everything shows in full.
	//
	// #429: the Trip Mode `✓ {code}` chip is a real button (tap to copy). It sits
	// above the card's stretched link (relative z-10), and its 44px hit area comes
	// from padding cancelled by an equal negative margin, so the strip keeps its
	// height. That is also why the left box clips on x only: `overflow-hidden`
	// would clip the expanded hit area back to the strip's 20px.
	import type { Snippet } from 'svelte';
	import { estimateTextWidth, fitStrip, type StripEntry } from '$lib/itinerary/card-anatomy';
	import { toast } from '$lib/shell/stores/toast';

	let { entries, right, muted = false }: { entries: StripEntry[]; right?: Snippet; muted?: boolean } = $props();

	let stripWidth = $state(0);
	let rightWidth = $state(0);

	async function copyCode(value: string) {
		try {
			await navigator.clipboard.writeText(value);
			toast.show('Code copied');
		} catch {
			toast.show('Could not copy — open the item to copy the code');
		}
	}

	const ICON = 12;
	const measures = $derived(
		entries.map((e) => {
			const pad = e.kind === 'needs-booking' ? 16 : e.kind === 'code' ? 8 : 0;
			// Code text is mono (wider than the sans estimate).
			const text = e.kind === 'code' ? Math.ceil(e.text.length * 11 * 0.62) : estimateTextWidth(e.text, 11);
			return { key: e.key, full: ICON + 4 + text + pad, icon: ICON + (pad ? 8 : 0) };
		})
	);
	const fit = $derived(
		stripWidth > 0 ? fitStrip(measures, stripWidth - rightWidth - (rightWidth ? 8 : 0), 8) : {}
	);
	// Earlier today (#429): ink-muted, never opacity. Gold stays: an open loop is still open.
	const toneClass = $derived({
		red: 'text-error',
		ink: muted ? 'text-ink-muted' : 'text-ink-soft',
		gold: 'text-gold-deep',
		quiet: muted ? 'text-ink-muted' : 'text-ink-soft'
	});
</script>

{#snippet glyph(kind: StripEntry['kind'])}
	<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		{#if kind === 'overlap'}
			<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" />
		{:else if kind === 'needs-booking'}
			<circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 17h.01" />
		{:else if kind === 'booked' || kind === 'code'}
			<path d="m5 12 5 5 9-10" />
		{:else}
			<path d="m21 12-8.6 8.6a5 5 0 0 1-7-7L14 5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L15 8" />
		{/if}
	</svg>
{/snippet}

{#if entries.length > 0 || right}
	<div class="mt-1.5 flex min-h-5 items-center justify-between gap-2" bind:clientWidth={stripWidth} data-card-strip>
		<div class="flex min-w-0 items-center gap-2 overflow-x-clip whitespace-nowrap">
			{#each entries as e (e.key)}
				{@const f = fit[e.key] ?? 'full'}
				{#if f !== 'dropped'}
					{#if e.kind === 'code' && e.copy}
						<button
							type="button"
							onclick={() => copyCode(e.copy!)}
							class="{muted ? 'text-ink-muted' : 'text-ink-soft'} hover:text-ink active:bg-surface-2 relative z-10 -my-3.5 inline-flex min-w-0 shrink-0 items-center gap-1 rounded-md px-1 py-3.5 text-[11px] leading-4 font-medium"
							data-strip="code"
							aria-label={e.label}
							title={f === 'icon' ? e.label : undefined}
						>
							{@render glyph(e.kind)}
							{#if f === 'full'}<span class="truncate font-mono" aria-hidden="true">{e.text}</span>{/if}
						</button>
					{:else}
						<span
							class="inline-flex min-w-0 shrink-0 items-center gap-1 text-[11px] leading-4 font-medium {toneClass[e.tone]} {e.kind ===
							'needs-booking'
								? 'bg-gold-tint border-gold/30 rounded-full border px-2 py-[1px] font-semibold tracking-wide uppercase'
								: ''}"
							data-strip={e.kind}
							aria-label={e.label}
							title={f === 'icon' ? e.label : undefined}
						>
							{@render glyph(e.kind)}
							{#if f === 'full'}<span class="truncate" aria-hidden="true">{e.text}</span>{/if}
						</span>
					{/if}
				{/if}
			{/each}
		</div>
		{#if right}
			<div class="ml-auto shrink-0" bind:clientWidth={rightWidth}>{@render right()}</div>
		{/if}
	</div>
{/if}
