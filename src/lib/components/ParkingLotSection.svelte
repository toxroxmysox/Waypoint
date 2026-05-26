<script lang="ts">
	import type { Item, Phase } from '$lib/types';
	import TypeIcon from '$lib/components/ui/TypeIcon.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import SectionH from '$lib/components/ui/SectionH.svelte';
	import { titleCase } from '$lib/utils/format';

	let {
		items,
		phases,
		tripSlug
	}: {
		items: Item[];
		phases: Phase[];
		tripSlug: string;
	} = $props();

	const phaseMap = $derived(new Map(phases.map((p) => [p.id, p])));

	const tripLevel = $derived(items.filter((i) => i.parking_lot_scope === 'trip'));
	const phaseLevel = $derived(items.filter((i) => i.parking_lot_scope === 'phase'));
	const dayLevel = $derived(items.filter((i) => i.parking_lot_scope === 'day'));

	const phaseGroups = $derived.by(() => {
		const groups = new Map<string, Item[]>();
		for (const item of phaseLevel) {
			const key = item.phase || 'unassigned';
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(item);
		}
		return groups;
	});
</script>

{#if items.length === 0}
	<p class="text-ink-muted text-sm italic">No parking lot items.</p>
{:else}
	{#if tripLevel.length > 0}
		<section class="space-y-1.5">
			<SectionH>Trip-level ({tripLevel.length})</SectionH>
			{#each tripLevel as item (item.id)}
				<Card href="/trips/{tripSlug}/items/{item.id}">
					<div class="flex items-center gap-3 px-3 py-2">
						<TypeIcon type={item.type} size={18} />
						<div class="min-w-0 flex-1">
							<p class="text-ink truncate text-sm" title={item.title}>{item.title}</p>
							{#if item.location_name}
								<p class="text-ink-muted truncate text-xs">{item.location_name}</p>
							{/if}
						</div>
						<span class="bg-paper text-ink-muted shrink-0 rounded px-1.5 py-0.5 text-[11px]">
							{titleCase(item.type)}
						</span>
					</div>
				</Card>
			{/each}
		</section>
	{/if}

	{#if phaseLevel.length > 0}
		<section class="space-y-1.5">
			<SectionH>Phase-level ({phaseLevel.length})</SectionH>
			{#each [...phaseGroups.entries()] as [phaseId, phaseItems] (phaseId)}
				{@const phase = phaseMap.get(phaseId)}
				<div class="space-y-1">
					{#if phase}
						<p class="text-ink-soft text-xs font-medium">{phase.name}</p>
					{/if}
					{#each phaseItems as item (item.id)}
						<Card href="/trips/{tripSlug}/items/{item.id}">
							<div class="flex items-center gap-3 px-3 py-2">
								<TypeIcon type={item.type} size={18} />
								<div class="min-w-0 flex-1">
									<p class="text-ink truncate text-sm" title={item.title}>{item.title}</p>
								</div>
								<span class="bg-paper text-ink-muted shrink-0 rounded px-1.5 py-0.5 text-[11px]">
									{titleCase(item.type)}
								</span>
							</div>
						</Card>
					{/each}
				</div>
			{/each}
		</section>
	{/if}

	{#if dayLevel.length > 0}
		<section class="space-y-1.5">
			<SectionH>Day-level ({dayLevel.length})</SectionH>
			{#each dayLevel as item (item.id)}
				<Card href="/trips/{tripSlug}/items/{item.id}">
					<div class="flex items-center gap-3 px-3 py-2">
						<TypeIcon type={item.type} size={18} />
						<div class="min-w-0 flex-1">
							<p class="text-ink truncate text-sm" title={item.title}>{item.title}</p>
						</div>
						<span class="bg-paper text-ink-muted shrink-0 rounded px-1.5 py-0.5 text-[11px]">
							{titleCase(item.type)}
						</span>
					</div>
				</Card>
			{/each}
		</section>
	{/if}
{/if}
