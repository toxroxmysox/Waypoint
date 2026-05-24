<script lang="ts">
	import { enhance } from '$app/forms';
	import CloseoutItemRow from '$lib/components/CloseoutItemRow.svelte';
	import { titleCase } from '$lib/utils/format';
	import type { Day, Item, Phase } from '$lib/types';

	let {
		day,
		items,
		phases,
		tripId
	}: {
		day: Day;
		items: Item[];
		phases: Phase[];
		tripId: string;
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

	const slotOrder = ['morning', 'afternoon', 'evening', 'anytime'] as const;

	const itemsBySlot = $derived.by(() => {
		const grouped = new Map<string, Item[]>();
		for (const slot of slotOrder) {
			const slotItems = items.filter((i) => (i.slot || 'anytime') === slot);
			if (slotItems.length > 0) grouped.set(slot, slotItems);
		}
		return grouped;
	});

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
		{#each slotOrder as slot}
			{@const slotItems = itemsBySlot.get(slot)}
			{#if slotItems && slotItems.length > 0}
				<div>
					<div class="bg-surface-2 px-4 py-1.5">
						<span class="text-ink-muted text-xs font-medium uppercase tracking-wide">{titleCase(slot)}</span>
					</div>
					{#each slotItems as item (item.id)}
						<CloseoutItemRow
							{item}
							{tripId}
							dayId={day.id}
							phaseId={day.phases?.[0] || ''}
						/>
					{/each}
				</div>
			{/if}
		{/each}
	{/if}
</div>
