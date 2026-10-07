<script lang="ts">
	// `2h free · 4:30p to 6:30p` (#420; D8/D9): text only on the rail. No line, no
	// tap target; a screen reader hears "Free, 4:30p to 6:30p".
	import { freeTimeLabel, freeTimeSpoken, type FreeGap } from '$lib/itinerary/card-anatomy';

	let { gap }: { gap: FreeGap } = $props();
</script>

<div
	role="separator"
	aria-label={freeTimeSpoken(gap)}
	class="text-ink-muted px-[3px] py-1 text-[11px] leading-4 italic"
	data-free-time
>
	<span aria-hidden="true">{freeTimeLabel(gap)}</span>
</div>
