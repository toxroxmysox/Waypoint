<script lang="ts">
	import { enhance } from '$app/forms';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import InlineQuickAdd from '$lib/itinerary/components/InlineQuickAdd.svelte';
	import { formatTime, formatDateRange } from '$lib/shell/format';
	import { itemDateRange } from '$lib/itinerary/multi-day';
	import type { Item, Day } from '$lib/types';

	let {
		item,
		tripId,
		dayId,
		phaseId,
		days = []
	}: {
		item: Item;
		tripId: string;
		dayId: string;
		phaseId: string;
		days?: Day[];
	} = $props();

	let localState = $state<'pending' | 'done' | 'skipped' | 'replacing'>('pending');
	let submitting = $state(false);
	let editingEnd = $state(false);

	const isDone = $derived(item.status === 'done' || localState === 'done');
	const isSkipped = $derived(localState === 'skipped');
	const isReplacing = $derived(localState === 'replacing');
	const isResolved = $derived(isDone || isSkipped);
	const range = $derived(itemDateRange(item, days));
</script>

<div class="border-border border-b last:border-b-0">
	<div
		class="flex items-center gap-3 px-3 py-3 transition-opacity"
		class:opacity-50={isResolved}
	>
		<TypeIcon type={item.type} size={28} />

		<div class="min-w-0 flex-1">
			<p class="text-ink text-sm font-medium" class:line-through={isSkipped}>
				{item.title}
			</p>
			{#if item.start_time}
				<p class="text-ink-muted text-xs">{formatTime(item.start_time)}</p>
			{/if}
			{#if range}
				<button
					type="button"
					onclick={() => (editingEnd = !editingEnd)}
					class="text-ink-muted text-xs hover:underline"
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
						class="mt-1 flex items-center gap-1"
					>
						<input type="hidden" name="item_id" value={item.id} />
						<input
							type="date"
							name="end_date"
							value={range.end}
							min={range.start}
							class="border-line bg-surface text-ink rounded border px-1.5 py-1 text-xs"
						/>
						<button type="submit" class="text-sky text-xs font-medium">Save</button>
					</form>
				{/if}
			{/if}
		</div>

		{#if !isResolved && !isReplacing}
			<div class="flex shrink-0 gap-1">
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
					<button
						type="submit"
						disabled={submitting}
						class="rounded-md bg-green-50 px-2.5 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
						title="Done as planned"
					>
						Done
					</button>
				</form>

				<button
					type="button"
					onclick={() => (localState = 'replacing')}
					class="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
					title="Did something else"
				>
					Swap
				</button>

				<button
					type="button"
					onclick={() => (localState = 'skipped')}
					class="text-ink-muted rounded-md px-2.5 py-1.5 text-xs hover:bg-gray-100"
					title="Skip — leave as planned"
				>
					Skip
				</button>
			</div>
		{:else if isDone}
			<span class="text-xs font-medium text-green-600">Done</span>
		{:else if isSkipped}
			<span class="text-ink-muted text-xs">Skipped</span>
		{/if}
	</div>

	{#if isReplacing}
		<div class="px-3 pb-3">
			<InlineQuickAdd
				{tripId}
				{dayId}
				{phaseId}
				originalItemId={item.id}
				onAdded={() => (localState = 'done')}
				onCancel={() => (localState = 'pending')}
			/>
		</div>
	{/if}
</div>
