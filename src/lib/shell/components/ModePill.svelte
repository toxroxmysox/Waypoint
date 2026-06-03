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
	<button
		onclick={onToggle}
		class="rounded-full px-4 py-1.5 text-xs font-medium shadow-sm transition-colors
			{mode === 'trip'
				? 'bg-moss-tint text-moss hover:bg-moss-tint/80'
				: 'bg-clay-tint text-clay hover:bg-clay-tint/80'}"
	>
		{mode === 'trip' ? 'Edit plan' : 'Trip view'}
	</button>
</div>
