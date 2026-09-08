<script lang="ts">
	import type { Day } from '$lib/types';

	let {
		days,
		currentDayId,
		tripSlug
	}: {
		days: Day[];
		currentDayId: string;
		tripSlug: string;
	} = $props();

	let currentIndex = $derived(days.findIndex((d) => d.id === currentDayId));
	let prevDay = $derived(currentIndex > 0 ? days[currentIndex - 1] : null);
	let nextDay = $derived(currentIndex < days.length - 1 ? days[currentIndex + 1] : null);

	function dayLabel(d: Day): string {
		return new Date(d.date.replace(' ', 'T')).toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}

</script>

<!-- #366: the arrows are sized to 44px rather than given a `hit-44` overlay.
     This row sits directly under the sticky header, and a centred overlay grows
     UPWARD into it — the header paints over that half, leaving ~30px of real
     hit area (measured at 375px). Row padding moves onto the links so the row
     height is driven by the 44px targets instead of stacking on top of them. -->
<!-- #386: equal-width outer tracks, so the counter is centred on the ROW rather
     than merely distributed between whatever the two links happen to contain.
     `justify-between` centred nothing: the placeholder for a missing arrow was
     zero-width while the link it stood in for is min-w-11 (44px), so day 1 and
     the last day pulled the counter sideways — and the two date labels differ
     in length on EVERY day, so it was never truly centred anywhere.
     minmax(0,…) not 1fr: a bare 1fr floors at min-content, so a long date label
     would widen its own track and push the counter off-centre again. -->
<nav
	class="border-line grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-b px-4"
>
	{#if prevDay}
		<a
			href="/trips/{tripSlug}/days/{prevDay.id}"
			class="text-ink-muted hover:text-ink active:text-ink flex min-h-11 min-w-11 items-center justify-start justify-self-start gap-1 text-sm"
			aria-label="Previous day: {dayLabel(prevDay)}"
		>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M15 18l-6-6 6-6" />
			</svg>
			<span class="hidden xs:inline">{dayLabel(prevDay)}</span>
		</a>
	{:else}
		<span class="min-h-11"></span>
	{/if}

	<span class="text-ink-muted font-mono text-xs">{currentIndex + 1} / {days.length}</span>

	{#if nextDay}
		<a
			href="/trips/{tripSlug}/days/{nextDay.id}"
			class="text-ink-muted hover:text-ink active:text-ink flex min-h-11 min-w-11 items-center justify-end justify-self-end gap-1 text-sm"
			aria-label="Next day: {dayLabel(nextDay)}"
		>
			<span class="hidden xs:inline">{dayLabel(nextDay)}</span>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M9 18l6-6-6-6" />
			</svg>
		</a>
	{:else}
		<span class="min-h-11"></span>
	{/if}
</nav>
