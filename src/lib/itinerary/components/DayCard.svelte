<script lang="ts">
	import type { Day } from '$lib/types';
	import type { DayCardSummary, StayKind } from '$lib/itinerary/day-card';
	import Card from '$lib/ui/Card.svelte';
	import { dayCardMetric } from '$lib/shell/stores/day-card-metric';

	// Unified day card for the trip overview and Phase Detail (CARD_CONTENT_SPEC
	// §1). The whole card is the tap target. Optional slots degrade gracefully —
	// omitted when empty, never rendered as empty placeholders.

	let {
		day,
		href,
		summary,
		today
	}: {
		day: Day;
		href: string;
		summary: DayCardSummary;
		/** Today's date as 'YYYY-MM-DD' (computed once by the parent). */
		today?: string;
	} = $props();

	const dateOnly = $derived(day.date.split(/[T ]/)[0]);
	const isToday = $derived(today != null && dateOnly === today);
	const d = $derived(new Date(dateOnly + 'T00:00:00.000Z'));

	const dow = $derived(d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }));
	const dayNum = $derived(d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' }));
	const mon = $derived(d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }));

	const headline = $derived(day.notes?.trim() ? day.notes.trim() : 'Nothing planned yet');
	const isEmpty = $derived(!day.notes?.trim());

	const budgetLabel = $derived(
		new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			maximumFractionDigits: 0
		}).format(summary.budgetTotal)
	);

	const stayLabel: Record<StayKind, string> = {
		'check-in': 'Check-in',
		staying: 'Staying',
		'check-out': 'Check-out'
	};

	// Only check-in and check-out chips are ever emitted; 'staying' is kept in the
	// map for type completeness but is never rendered (#221).

</script>

<Card {href}>
	<div class="flex items-stretch gap-3 px-3 py-2.5">
		<!-- Date anchor -->
		<div class="flex w-11 shrink-0 flex-col items-center justify-center text-center">
			<span class="text-ink-muted text-[10px] font-bold tracking-wide uppercase">{dow}</span>
			<span class="text-ink font-mono text-lg leading-none font-semibold">{dayNum}</span>
			<span class="text-ink-muted text-[10px] uppercase">{mon}</span>
		</div>

		<div class="border-line/60 min-w-0 flex-1 border-l pl-3">
			<div class="flex items-center gap-2">
				<p class="min-w-0 flex-1 truncate text-sm {isEmpty ? 'text-ink-muted italic' : 'text-ink'}">
					{headline}
				</p>
				{#if isToday}
					<span class="bg-clay text-paper shrink-0 rounded-full px-1.5 py-[1px] text-[9.5px] font-bold tracking-wide uppercase">
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
				{:else if summary.bookableCount > 0}
					<span class="text-line">·</span>
					<span>{summary.bookedCount}/{summary.bookableCount} booked</span>
				{/if}

				{#each summary.stays as chip (chip.kind + chip.name)}
					<span class="text-line">·</span>
					<span class="text-moss inline-flex min-w-0 items-center gap-1">
						<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
							<path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" />
						</svg>
						<span class="truncate">{stayLabel[chip.kind]}{chip.name ? ` · ${chip.name}` : ''}</span>
					</span>
				{/each}
			</div>
		</div>
	</div>
</Card>
