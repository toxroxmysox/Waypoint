<script lang="ts">
	import { enhance } from '$app/forms';
	import CloseoutItemRow from '$lib/itinerary/components/CloseoutItemRow.svelte';
	import type { Day, Item, Phase } from '$lib/types';

	let {
		day,
		items,
		phases,
		tripId,
		days = []
	}: {
		day: Day;
		items: Item[];
		phases: Phase[];
		tripId: string;
		days?: Day[];
	} = $props();

	const phaseMap = $derived(new Map(phases.map((p) => [p.id, p])));

	const dayDate = $derived(
		new Date(day.date.replace(' ', 'T')).toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'long',
			day: 'numeric'
		})
	);

	const phaseName = $derived.by(() => {
		if (!day.phases || day.phases.length === 0) return null;
		return phaseMap.get(day.phases[0])?.name || null;
	});

	const sortedItems = $derived([...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));

	const pendingItems = $derived(items.filter((i) => i.status !== 'done'));
	let bulkSubmitting = $state(false);
	let bulkDone = $state(false);
</script>

<div class="bg-surface border-border overflow-hidden rounded-xl border shadow-sm">
	<div class="flex items-center justify-between border-b border-border/50 px-4 py-3">
		<div>
			<h3 class="text-ink text-base font-semibold">{dayDate}</h3>
			{#if phaseName}
				<p class="text-ink-muted text-xs">{phaseName}</p>
			{/if}
		</div>

		{#if pendingItems.length > 0 && !bulkDone}
			<form
				method="POST"
				action="?/markDoneAll"
				use:enhance={() => {
					bulkSubmitting = true;
					return async ({ result }) => {
						bulkSubmitting = false;
						if (result.type === 'success') {
							bulkDone = true;
							window.location.reload();
						}
					};
				}}
			>
				{#each pendingItems as item}
					<input type="hidden" name="item_ids" value={item.id} />
				{/each}
				<button
					type="submit"
					disabled={bulkSubmitting}
					class="rounded-lg bg-moss-tint px-3 py-1.5 text-xs font-medium text-moss hover:bg-moss-tint/70 disabled:opacity-40"
				>
					{bulkSubmitting ? 'Marking...' : 'All done'}
				</button>
			</form>
		{/if}
	</div>

	{#if items.length === 0}
		<p class="text-ink-muted px-4 py-6 text-center text-sm">No items for this day.</p>
	{:else}
		{#each sortedItems as item (item.id)}
			<CloseoutItemRow
				{item}
				{tripId}
				dayId={day.id}
				phaseId={day.phases?.[0] || ''}
				{days}
			/>
		{/each}
	{/if}
</div>
