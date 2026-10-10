<script lang="ts">
	import type { TripViewMode } from '$lib/trip-mode/activation';

	let {
		mode,
		onToggle
	}: {
		mode: TripViewMode;
		onToggle: () => void;
	} = $props();
</script>

<div class="flex justify-center">
	<!-- #501: names the DESTINATION ("To …"), so it can't read as the current mode.
	     A 1px border instead of shadow-sm: the soft shadow on a tint, behind
	     tint-colored text, read as blur on iOS. -->
	<button
		onclick={onToggle}
		class="hit-44 rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors
			{mode === 'trip'
				? 'border-moss/30 bg-moss-tint text-moss hover:bg-moss-tint/80 active:bg-moss-tint/80'
				: 'border-clay/30 bg-clay-tint text-clay hover:bg-clay-tint/80 active:bg-clay-tint/80'}"
	>
		{mode === 'trip' ? 'To Planning Mode' : 'To Trip Mode'}
	</button>
</div>
