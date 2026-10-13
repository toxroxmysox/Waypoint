<script lang="ts">
	import type { Item } from '$lib/types';
	import type { PhaseStaying } from '$lib/itinerary/phase-logistics';
	import { withOrigin } from '$lib/shell/back-nav';
	import { formatClock } from '$lib/shell/format';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';

	// #401 — Phase Detail's answers to "how do we get in, where do we sleep, how do
	// we get out": In (Arrival) / Staying / Out (Departure). Filled rows link to the
	// items; an empty row offers Add (owner/co_owner) preset to the right type/day.
	let {
		arrival,
		departure,
		staying,
		tripSlug,
		firstDayId,
		lastDayId,
		lastDate,
		canAdd,
		originPath
	}: {
		arrival: Item[];
		departure: Item[];
		staying: PhaseStaying;
		tripSlug: string;
		firstDayId: string;
		lastDayId: string;
		/** 'YYYY-MM-DD' — a new stay's checkout. */
		lastDate: string;
		canAdd: boolean;
		originPath: string;
	} = $props();

	const newItem = (params: Record<string, string>) =>
		withOrigin(`/trips/${tripSlug}/items/new?${new URLSearchParams(params)}`, originPath);
	const itemHref = (it: Item) => withOrigin(`/trips/${tripSlug}/items/${it.id}`, originPath);
	const partial = $derived(staying.totalNights > 0 && staying.coveredNights < staying.totalNights);
</script>

{#snippet moving(items: Item[], dayId: string)}
	{#if items.length > 0}
		<ul class="min-w-0 flex-1 space-y-1">
			{#each items as it (it.id)}
				<li>
					<a href={itemHref(it)} class="text-ink flex min-h-11 items-center gap-2 text-sm">
						<TypeIcon type={it.type} size={16} />
						<span class="min-w-0 truncate">{it.title}</span>
						{#if formatClock(it.start_time)}
							<span class="text-ink-muted shrink-0 font-mono text-xs">{formatClock(it.start_time)}</span>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<span class="text-ink-muted flex-1 text-sm italic">Not planned</span>
		{#if canAdd && dayId}
			<a href={newItem({ type: 'transportation', day: dayId })} class="text-moss min-h-11 px-2 text-sm leading-[44px] font-semibold">Add</a>
		{/if}
	{/if}
{/snippet}

<dl class="divide-line border-line divide-y rounded-lg border">
	<div class="flex items-start gap-3 px-3 py-1" data-logistics="in">
		<dt class="text-moss w-16 shrink-0 pt-3 text-[11px] font-bold tracking-[0.15em] uppercase">In</dt>
		<dd class="flex min-w-0 flex-1 items-center">{@render moving(arrival, firstDayId)}</dd>
	</div>

	<div class="flex items-start gap-3 px-3 py-1" data-logistics="staying">
		<dt class="text-moss w-16 shrink-0 pt-3 text-[11px] font-bold tracking-[0.15em] uppercase">Staying</dt>
		<dd class="min-w-0 flex-1">
			{#if staying.totalNights === 0}
				<p class="text-ink-muted min-h-11 text-sm leading-[44px] italic">No nights</p>
			{:else}
				{#if staying.lines.length > 0}
					<ul class="space-y-1">
						{#each staying.lines as line (line.item.id)}
							<li>
								<a href={itemHref(line.item)} class="text-ink flex min-h-11 items-center gap-2 text-sm">
									<TypeIcon type="lodging" size={16} />
									<span class="min-w-0 truncate">{line.item.title}</span>
									<span class="text-ink-muted shrink-0 text-xs">{line.nights} night{line.nights === 1 ? '' : 's'}</span>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
				{#if staying.lines.length === 0 || partial}
					<div class="flex items-center">
						<span class="text-ink-muted flex-1 text-sm {staying.lines.length === 0 ? 'italic' : ''}">
							{staying.lines.length === 0 ? 'Nowhere yet' : `${staying.coveredNights} of ${staying.totalNights} nights covered`}
						</span>
						{#if canAdd && firstDayId}
							<a href={newItem({ type: 'lodging', day: firstDayId, end: lastDate })} class="text-moss min-h-11 px-2 text-sm leading-[44px] font-semibold">Add</a>
						{/if}
					</div>
				{/if}
			{/if}
		</dd>
	</div>

	<div class="flex items-start gap-3 px-3 py-1" data-logistics="out">
		<dt class="text-moss w-16 shrink-0 pt-3 text-[11px] font-bold tracking-[0.15em] uppercase">Out</dt>
		<dd class="flex min-w-0 flex-1 items-center">{@render moving(departure, lastDayId)}</dd>
	</div>
</dl>
