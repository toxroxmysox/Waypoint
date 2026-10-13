<script lang="ts">
	import type { Day } from '$lib/types';
	import { formatCalendarDate } from '$lib/shell/format';

	// #401 — the Overview's compact itinerary row: `Thu 18 [⇄] … N planned`.
	let { day, href, plannedCount, travel }: { day: Day; href: string; plannedCount: number; travel: boolean } =
		$props();
	const label = $derived(
		`${formatCalendarDate(day.date, { weekday: 'short' })} ${formatCalendarDate(day.date, { day: 'numeric' })}`
	);
</script>

<a
	{href}
	data-compact-day
	class="hover:bg-surface-2 flex min-h-11 items-center justify-between gap-3 rounded-md px-2 text-sm"
>
	<span class="text-ink font-medium">
		{label}{#if travel}<span class="text-ink-muted ml-1.5 text-xs" aria-label="travel day">⇄</span>{/if}
	</span>
	<span class={plannedCount > 0 ? 'text-ink-soft' : 'text-ink-muted'}>{plannedCount} planned</span>
</a>
