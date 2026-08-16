<script lang="ts">
	import { goto } from '$app/navigation';
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

	let touchStartX = $state(0);

	function onTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX;
	}

	function onTouchEnd(e: TouchEvent) {
		const dx = e.changedTouches[0].clientX - touchStartX;
		if (Math.abs(dx) < 60) return;
		const target = dx > 0 ? prevDay : nextDay;
		if (target) goto(`/trips/${tripSlug}/days/${target.id}`);
	}
</script>

<!-- #366: the arrows are sized to 44px rather than given a `hit-44` overlay.
     This row sits directly under the sticky header, and a centred overlay grows
     UPWARD into it — the header paints over that half, leaving ~30px of real
     hit area (measured at 375px). Row padding moves onto the links so the row
     height is driven by the 44px targets instead of stacking on top of them. -->
<nav
	class="border-line flex items-center justify-between border-b px-4"
	style="touch-action: pan-y"
	ontouchstart={onTouchStart}
	ontouchend={onTouchEnd}
>
	{#if prevDay}
		<a
			href="/trips/{tripSlug}/days/{prevDay.id}"
			class="text-ink-muted hover:text-ink active:text-ink flex min-h-11 min-w-11 items-center justify-start gap-1 text-sm"
			aria-label="Previous day: {dayLabel(prevDay)}"
		>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M15 18l-6-6 6-6" />
			</svg>
			<span class="hidden xs:inline">{dayLabel(prevDay)}</span>
		</a>
	{:else}
		<span></span>
	{/if}

	<span class="text-ink-muted font-mono text-xs">{currentIndex + 1} / {days.length}</span>

	{#if nextDay}
		<a
			href="/trips/{tripSlug}/days/{nextDay.id}"
			class="text-ink-muted hover:text-ink active:text-ink flex min-h-11 min-w-11 items-center justify-end gap-1 text-sm"
			aria-label="Next day: {dayLabel(nextDay)}"
		>
			<span class="hidden xs:inline">{dayLabel(nextDay)}</span>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M9 18l6-6-6-6" />
			</svg>
		</a>
	{:else}
		<span></span>
	{/if}
</nav>
