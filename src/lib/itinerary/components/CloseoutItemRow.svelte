<script lang="ts">
	// A Closeout item as a Row (#434; spec §Row, CARD_SYSTEM D11). Done, Swap and Skip are
	// three IDENTICAL bordered pills under the sub-line, inside the row, each a 44px
	// hit area: none reads as the default. The multi-day date adjust is kept as built.
	import { enhance } from '$app/forms';
	import Row from '$lib/ui/Row.svelte';
	import InlineQuickAdd from '$lib/itinerary/components/InlineQuickAdd.svelte';
	import { formatDateRange } from '$lib/shell/format';
	import { itemDateRange } from '$lib/itinerary/multi-day';
	import { rowSub } from '$lib/itinerary/row';
	import type { Item, Day } from '$lib/types';

	let {
		item,
		tripId,
		dayId,
		phaseId,
		days = [],
		// #273 — clamp the trim-end picker to the trip end (an item can't extend past
		// the trip). Empty = dateless trip → no upper bound.
		tripEndDate = ''
	}: {
		item: Item;
		tripId: string;
		dayId: string;
		phaseId: string;
		days?: Day[];
		tripEndDate?: string;
	} = $props();

	let localState = $state<'pending' | 'done' | 'skipped' | 'replacing'>('pending');
	let submitting = $state(false);
	let editingEnd = $state(false);

	const isDone = $derived(item.status === 'done' || localState === 'done');
	const isSkipped = $derived(localState === 'skipped');
	const isReplacing = $derived(localState === 'replacing');
	const isResolved = $derived(isDone || isSkipped);
	const range = $derived(itemDateRange(item, days));

	// Same pill for all three: bordered, ink, 44px tall.
	const pill =
		'border-line bg-surface text-ink hover:bg-surface-2 active:bg-surface-2 inline-flex min-h-11 items-center justify-center rounded-full border px-5 text-xs font-semibold disabled:opacity-40';
</script>

{#snippet trailing()}
	<span class="text-ink-muted text-xs font-medium">{isSkipped ? 'Skipped' : 'Done'}</span>
{/snippet}

{#snippet pills()}
	{#if range}
		<div class="mb-1">
			<button
				type="button"
				onclick={() => (editingEnd = !editingEnd)}
				class="text-ink-muted inline-flex min-h-11 items-center text-xs hover:underline active:underline"
			>
				{formatDateRange(range.start, range.end)} · adjust
			</button>
			{#if editingEnd}
				<form
					method="POST"
					action="?/trimEnd"
					use:enhance={() => {
						return async ({ result, update }) => {
							if (result.type === 'success') editingEnd = false;
							await update();
						};
					}}
					class="flex items-center gap-1"
				>
					<input type="hidden" name="item_id" value={item.id} />
					<input
						type="date"
						name="end_date"
						value={range.end}
						min={range.start}
						max={tripEndDate || undefined}
						class="border-line bg-surface text-ink rounded border px-1.5 py-1 text-xs"
					/>
					<button type="submit" class="text-sky inline-flex min-h-11 items-center px-2 text-xs font-medium">Save</button>
				</form>
			{/if}
		</div>
	{/if}

	{#if isReplacing}
		<div class="pr-3">
			<InlineQuickAdd
				{tripId}
				{dayId}
				{phaseId}
				originalItemId={item.id}
				onAdded={() => (localState = 'done')}
				onCancel={() => (localState = 'pending')}
			/>
		</div>
	{:else if !isResolved}
		<div class="flex flex-wrap gap-2">
			<form
				method="POST"
				action="?/markDone"
				use:enhance={() => {
					submitting = true;
					return async ({ result }) => {
						submitting = false;
						if (result.type === 'success') localState = 'done';
					};
				}}
			>
				<input type="hidden" name="item_id" value={item.id} />
				<button type="submit" disabled={submitting} class={pill} title="Done as planned">Done</button>
			</form>
			<button type="button" onclick={() => (localState = 'replacing')} class={pill} title="Did something else">Swap</button>
			<button type="button" onclick={() => (localState = 'skipped')} class={pill} title="Skip — leave as planned">Skip</button>
		</div>
	{/if}
{/snippet}

<Row
	type={item.type}
	subtype={item.subtype}
	title={item.title}
	sub={rowSub(item)}
	trailing={isResolved ? trailing : undefined}
	strike={isSkipped}
	dim={isResolved}
	below={isResolved && !range ? undefined : pills}
	class="px-3 last:border-b-0"
/>
