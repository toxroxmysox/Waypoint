<script lang="ts">
	import { enhance } from '$app/forms';
	import TypeIcon from '$lib/components/ui/TypeIcon.svelte';
	import InlineQuickAdd from '$lib/components/InlineQuickAdd.svelte';
	import { titleCase } from '$lib/utils/format';
	import type { Item } from '$lib/types';

	let {
		item,
		tripId,
		dayId,
		phaseId
	}: {
		item: Item;
		tripId: string;
		dayId: string;
		phaseId: string;
	} = $props();

	let localState = $state<'pending' | 'done' | 'skipped' | 'replacing'>('pending');
	let submitting = $state(false);

	const isDone = $derived(item.status === 'done' || localState === 'done');
	const isSkipped = $derived(localState === 'skipped');
	const isReplacing = $derived(localState === 'replacing');
	const isResolved = $derived(isDone || isSkipped);
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
				<p class="text-ink-muted text-xs">{item.start_time}</p>
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
				slot={item.slot}
				originalItemId={item.id}
				onAdded={() => (localState = 'done')}
				onCancel={() => (localState = 'pending')}
			/>
		</div>
	{/if}
</div>
