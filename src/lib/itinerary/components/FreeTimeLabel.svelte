<script lang="ts">
	// `2h free · 4:30p to 6:30p` (#420; D8/D9): text only on the rail. No line, no
	// tap target; a screen reader hears "Free, 4:30p to 6:30p".
	import { freeTimeLabel, freeTimeSpoken, type FreeGap } from '$lib/itinerary/card-anatomy';

	// #445: while an idea is dragged over the day the gap says what it offers
	// (`Drop to plan · 2h free · 4:30p to 6:30p`), in the planning accent.
	let { gap, dropLabel }: { gap: FreeGap; dropLabel?: string } = $props();
</script>

<div
	role="separator"
	aria-label={freeTimeSpoken(gap)}
	class="px-[3px] py-1 text-[11px] leading-4 {dropLabel ? 'font-semibold' : 'text-ink-muted italic'}"
	style={dropLabel ? 'color: var(--color-accent)' : ''}
	data-free-time
	data-drop-target={dropLabel ? '' : undefined}
>
	<span aria-hidden="true">{dropLabel ?? freeTimeLabel(gap)}</span>
</div>
