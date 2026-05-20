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

	let touchStartX = $state(0);

	function onTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX;
	}

	function onTouchEnd(e: TouchEvent) {
		const dx = e.changedTouches[0].clientX - touchStartX;
		if (Math.abs(dx) < 60) return;
		const target = dx > 0 ? prevDay : nextDay;
		if (target) window.location.href = `/trips/${tripSlug}/days/${target.id}`;
	}
</script>

<nav
	class="border-line flex items-center justify-between border-b px-4 py-2"
	style="touch-action: pan-y"
	ontouchstart={onTouchStart}
	ontouchend={onTouchEnd}
>
	{#if prevDay}
		<a
			href="/trips/{tripSlug}/days/{prevDay.id}"
			class="text-ink-muted hover:text-ink flex items-center gap-1 text-sm"
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

	<span class="text-ink-muted font-mono text-[11px]">{currentIndex + 1} / {days.length}</span>

	{#if nextDay}
		<a
			href="/trips/{tripSlug}/days/{nextDay.id}"
			class="text-ink-muted hover:text-ink flex items-center gap-1 text-sm"
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
