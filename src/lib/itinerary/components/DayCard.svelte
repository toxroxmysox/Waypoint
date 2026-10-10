<script lang="ts">
	import type { Day } from '$lib/types';
	import { todayTreatment, type DayCardSummary } from '$lib/itinerary/day-card';
	import { dayHeadline } from '$lib/itinerary/drag-to-plan';
	import Card from '$lib/ui/Card.svelte';
	import MonoTypeIcon from '$lib/ui/MonoTypeIcon.svelte';
	import { dayCardMetric } from '$lib/shell/stores/day-card-metric';
	import { useChromeMode } from '$lib/shell/chrome-mode';
	import { formatCalendarDate } from '$lib/shell/format';

	// Unified day card for the trip overview and Phase Detail (CARD_CONTENT_SPEC
	// §1). The whole card is the tap target. Optional slots degrade gracefully —
	// omitted when empty, never rendered as empty placeholders.
	// Colour rule (#426, CARD_SYSTEM D10): colour means "act on this". Gold is the
	// open loop (`N needs booking`); the stay line is plain ink; today in Planning
	// Mode is the mode accent (moss) as an outline.

	let {
		day,
		href,
		summary,
		today
	}: {
		day: Day;
		href: string;
		summary: DayCardSummary;
		/** The trip-local date as 'YYYY-MM-DD' (`tripToday`, computed once by the parent). */
		today?: string;
	} = $props();

	// Planning Mode outlines today (the accent is moss there); Trip Mode keeps the pill.
	const chromeMode = useChromeMode();
	const treatment = $derived(todayTreatment(day.date, today, chromeMode()));

	const dow = $derived(formatCalendarDate(day.date, { weekday: 'short' }));
	const dayNum = $derived(formatCalendarDate(day.date, { day: 'numeric' }));
	const mon = $derived(formatCalendarDate(day.date, { month: 'short' }));

	// Headline priority (#355): the day's notes, else what the day actually
	// holds — its first item, "+ N more" for the rest. The count itself stays in
	// the meta row below (itemCount is the sole fullness signal), so the lead
	// tells you something that row can't. "Nothing planned yet" is reserved for
	// days that really are empty.
	const headline = $derived(dayHeadline(day, summary));
	const isEmpty = $derived(!day.notes?.trim() && !summary.leadTitle);

	const budgetLabel = $derived(
		new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			maximumFractionDigits: 0
		}).format(summary.budgetTotal)
	);
</script>

<Card {href} class={treatment === 'outline' ? 'outline-accent outline-2 -outline-offset-1' : ''}>
	<div class="flex items-center gap-3 px-3 py-2.5" data-day-card data-today={treatment}>
		<!-- Date anchor: centred vertically on the card (#426) -->
		<div class="flex w-11 shrink-0 flex-col items-center justify-center text-center">
			<span class="text-ink-muted text-[10px] font-bold tracking-wide uppercase">{dow}</span>
			<span class="text-ink font-mono text-lg leading-none font-semibold">{dayNum}</span>
			<span class="text-ink-muted text-[10px] uppercase">{mon}</span>
		</div>

		<div class="border-line/60 min-w-0 flex-1 self-stretch border-l pl-3">
			<div class="flex items-center gap-2">
				<p class="min-w-0 flex-1 truncate text-sm {isEmpty ? 'text-ink-muted italic' : 'text-ink'}">
					{headline}
				</p>
				{#if treatment === 'pill'}
					<span class="bg-accent text-paper shrink-0 rounded-full px-1.5 py-[1px] text-[9.5px] font-bold tracking-wide uppercase">
						Today
					</span>
				{/if}
			</div>

			<div class="text-ink-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px]">
				<span class:text-ink-soft={summary.itemCount > 0}>
					{summary.itemCount} item{summary.itemCount === 1 ? '' : 's'}
				</span>

				{#if $dayCardMetric === 'budget'}
					{#if summary.budgetTotal > 0}
						<span class="text-line">·</span>
						<span>{budgetLabel}</span>
					{/if}
				{:else if summary.needsBookingCount > 0}
					<span class="text-line">·</span>
					<!-- Same chip as the #420 strip: gold is the open loop, nothing else. -->
					<span
						class="bg-gold-tint border-gold/30 text-gold-deep inline-flex items-center gap-1 rounded-full border px-2 py-[1px] font-sans text-[11px] leading-4 font-semibold tracking-wide uppercase"
						data-day-needs-booking
					>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 17h.01" />
						</svg>
						<span aria-hidden="true">{summary.needsBookingCount} to book</span>
						<span class="sr-only">{summary.needsBookingCount} needs booking</span>
					</span>
				{:else if summary.bookableCount > 0}
					<!-- All set (Scott, 2026-10-09): a quiet count, no colour — nothing to act on. -->
					<span class="text-line">·</span>
					<span class="text-ink-soft" data-day-all-booked>✓ {summary.bookedCount}/{summary.bookableCount} booked</span>
				{/if}
			</div>

			{#if isEmpty}
				<!-- Spec #418 empty day: suggest the next step (adding / dragging happens on the day page this card opens). -->
				<p class="text-ink-muted mt-1 text-[12px]" data-day-empty-hint>Add something, or drag an idea here</p>
			{/if}

			{#each summary.stays as chip (chip.kind + chip.name)}
				<!-- Plain ink, lodging icon: a stay is context, not something to act on (D10). -->
				<p class="text-ink-soft mt-1 flex min-w-0 items-center gap-1.5 text-[12px]" data-day-stay>
					<span class="shrink-0"><MonoTypeIcon type="lodging" size={16} /></span>
					<span class="truncate">{chip.text}</span>
				</p>
			{/each}
		</div>
	</div>
</Card>
