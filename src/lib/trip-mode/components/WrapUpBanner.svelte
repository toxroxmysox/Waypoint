<script lang="ts">
	// Wrap-up banner (#239/#195): ONE bordered banner that replaces the top of the
	// Overview (the trip-details card + Flights & Stays) when a trip is past its end
	// date but not archived. Itinerary/Days stay below it. Equal-weight action rows
	// live INSIDE the single border; each row is shown ONLY when outstanding and falls
	// away as completed — never a forced three-at-once. Quiet, group-facing: a calm
	// "the trip's over — here's what's left", not a celebration or an alarm.
	//
	// - Settle up — only when a balance is owed (gated on balance, not lifecycle), so
	//   closing out never strands a debt. Deep-links to the Money page.
	// - Close out — launches the EXISTING closeout wizard (/closeout). Always shown in
	//   wrap-up (it's the deliberate transition OUT of wrap-up); it disappears only once
	//   the trip is archived, at which point the banner itself stops rendering.

	let {
		slug,
		dateRange,
		balanceOwed = false
	}: {
		slug: string;
		dateRange: string;
		balanceOwed?: boolean;
	} = $props();
</script>

<section
	class="border-line bg-surface shadow-card overflow-hidden rounded-lg border"
	aria-label="Trip wrap-up"
>
	<!-- Header: quiet status line. The trip is over; this is the resting wrap-up state. -->
	<div class="border-line border-b px-4 py-3">
		<p class="text-ink-muted text-[9.5px] font-bold tracking-[0.14em] uppercase">Trip wrapped up</p>
		<p class="text-ink mt-1 text-sm font-semibold">Your trip has ended</p>
		<p class="text-ink-soft font-mono mt-0.5 text-[12px]">{dateRange}</p>
	</div>

	<!-- Equal-weight action rows, divided within the single border. Each appears only
	     when outstanding; they share the same visual weight (no primary/secondary). -->
	<div class="divide-line divide-y">
		{#if balanceOwed}
			<a
				href="/trips/{slug}/money"
				data-testid="wrapup-settle"
				class="hover:bg-surface-2 active:bg-surface-2 flex items-center gap-3 px-4 py-3.5"
			>
				<span
					class="bg-moss-tint text-moss flex size-9 shrink-0 items-center justify-center rounded-full"
					aria-hidden="true"
				>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="12" y1="1" x2="12" y2="23" />
						<path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
					</svg>
				</span>
				<span class="min-w-0 flex-1">
					<span class="text-ink block text-sm font-semibold">Settle up</span>
					<span class="text-ink-muted block text-xs">Square the balance while it's fresh</span>
				</span>
				<svg class="text-ink-muted shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<polyline points="9 18 15 12 9 6" />
				</svg>
			</a>
		{/if}

		<a
			href="/trips/{slug}/closeout"
			data-testid="wrapup-closeout"
			class="hover:bg-surface-2 active:bg-surface-2 flex items-center gap-3 px-4 py-3.5"
		>
			<span
				class="bg-clay-tint text-clay flex size-9 shrink-0 items-center justify-center rounded-full"
				aria-hidden="true"
			>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M9 11l3 3L22 4" />
					<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
				</svg>
			</span>
			<span class="min-w-0 flex-1">
				<span class="text-ink block text-sm font-semibold">Close out</span>
				<span class="text-ink-muted block text-xs">Walk the trip and finish the record</span>
			</span>
			<svg class="text-ink-muted shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<polyline points="9 18 15 12 9 6" />
			</svg>
		</a>
	</div>
</section>
