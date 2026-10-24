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
	class="overflow-hidden rounded-lg border border-line bg-surface shadow-card"
	aria-label="Trip wrap-up"
>
	<!-- Header: quiet status line. The trip is over; this is the resting wrap-up state. -->
	<div class="border-b border-line px-4 py-3">
		<p class="text-[9.5px] font-bold tracking-[0.14em] text-ink-muted uppercase">Trip wrapped up</p>
		<p class="mt-1 text-sm font-semibold text-ink">Your trip has ended</p>
		<p class="mt-0.5 font-mono text-[12px] text-ink-soft">{dateRange}</p>
	</div>

	<!-- Equal-weight action rows, divided within the single border. Each appears only
	     when outstanding; they share the same visual weight (no primary/secondary). -->
	<div class="divide-y divide-line">
		{#if balanceOwed}
			<a
				href="/trips/{slug}/money"
				data-testid="wrapup-settle"
				class="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2 active:bg-surface-2"
			>
				<span
					class="flex size-9 shrink-0 items-center justify-center rounded-full bg-moss-tint text-moss"
					aria-hidden="true"
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<line x1="12" y1="1" x2="12" y2="23" />
						<path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
					</svg>
				</span>
				<span class="min-w-0 flex-1">
					<span class="block text-sm font-semibold text-ink">Settle up</span>
					<span class="block text-xs text-ink-muted">Square the balance while it's fresh</span>
				</span>
				<svg
					class="shrink-0 text-ink-muted"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<polyline points="9 18 15 12 9 6" />
				</svg>
			</a>
		{/if}

		<a
			href="/trips/{slug}/closeout"
			data-testid="wrapup-closeout"
			class="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2 active:bg-surface-2"
		>
			<span
				class="flex size-9 shrink-0 items-center justify-center rounded-full bg-clay-tint text-clay"
				aria-hidden="true"
			>
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M9 11l3 3L22 4" />
					<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
				</svg>
			</span>
			<span class="min-w-0 flex-1">
				<span class="block text-sm font-semibold text-ink">Close out</span>
				<span class="block text-xs text-ink-muted">Walk the trip and finish the record</span>
			</span>
			<svg
				class="shrink-0 text-ink-muted"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<polyline points="9 18 15 12 9 6" />
			</svg>
		</a>
	</div>
</section>
