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
					<a href={itemHref(it)} class="flex min-h-11 items-center gap-2 text-sm text-ink">
						<TypeIcon type={it.type} size={16} />
						<span class="min-w-0 truncate">{it.title}</span>
						{#if formatClock(it.start_time)}
							<span class="shrink-0 font-mono text-xs text-ink-muted"
								>{formatClock(it.start_time)}</span
							>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<span class="flex-1 text-sm text-ink-muted italic">Not planned</span>
		{#if canAdd && dayId}
			<a
				href={newItem({ type: 'transportation', day: dayId })}
				class="min-h-11 px-2 text-sm leading-[44px] font-semibold text-moss">Add</a
			>
		{/if}
	{/if}
{/snippet}

<dl class="divide-y divide-line rounded-lg border border-line">
	<div class="flex items-start gap-3 px-3 py-1" data-logistics="in">
		<dt class="w-16 shrink-0 pt-3 text-[11px] font-bold tracking-[0.15em] text-moss uppercase">
			In
		</dt>
		<dd class="flex min-w-0 flex-1 items-center">{@render moving(arrival, firstDayId)}</dd>
	</div>

	<div class="flex items-start gap-3 px-3 py-1" data-logistics="staying">
		<dt class="w-16 shrink-0 pt-3 text-[11px] font-bold tracking-[0.15em] text-moss uppercase">
			Staying
		</dt>
		<dd class="min-w-0 flex-1">
			{#if staying.totalNights === 0}
				<p class="min-h-11 text-sm leading-[44px] text-ink-muted italic">No nights</p>
			{:else}
				{#if staying.lines.length > 0}
					<ul class="space-y-1">
						{#each staying.lines as line (line.item.id)}
							<li>
								<a
									href={itemHref(line.item)}
									class="flex min-h-11 items-center gap-2 text-sm text-ink"
								>
									<TypeIcon type="lodging" size={16} />
									<span class="min-w-0 truncate">{line.item.title}</span>
									<span class="shrink-0 text-xs text-ink-muted"
										>{line.nights} night{line.nights === 1 ? '' : 's'}</span
									>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
				{#if staying.lines.length === 0 || partial}
					<div class="flex items-center">
						<span
							class="flex-1 text-sm text-ink-muted {staying.lines.length === 0 ? 'italic' : ''}"
						>
							{staying.lines.length === 0
								? 'Nowhere yet'
								: `${staying.coveredNights} of ${staying.totalNights} nights covered`}
						</span>
						{#if canAdd && firstDayId}
							<a
								href={newItem({ type: 'lodging', day: firstDayId, end: lastDate })}
								class="min-h-11 px-2 text-sm leading-[44px] font-semibold text-moss">Add</a
							>
						{/if}
					</div>
				{/if}
			{/if}
		</dd>
	</div>

	<div class="flex items-start gap-3 px-3 py-1" data-logistics="out">
		<dt class="w-16 shrink-0 pt-3 text-[11px] font-bold tracking-[0.15em] text-moss uppercase">
			Out
		</dt>
		<dd class="flex min-w-0 flex-1 items-center">{@render moving(departure, lastDayId)}</dd>
	</div>
</dl>
