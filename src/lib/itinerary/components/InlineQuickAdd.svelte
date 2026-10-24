<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ItemType } from '$lib/types';

	let {
		tripId,
		dayId,
		phaseId,
		originalItemId,
		onAdded,
		onCancel
	}: {
		tripId: string;
		dayId: string;
		phaseId: string;
		originalItemId: string;
		onAdded: () => void;
		onCancel: () => void;
	} = $props();

	let title = $state('');
	let type = $state<ItemType>('activity');
	let submitting = $state(false);
	let titleInput: HTMLInputElement | undefined = $state();

	$effect(() => {
		titleInput?.focus();
	});
</script>

<form
	method="POST"
	action="?/addReplacement"
	class="mt-2 flex flex-col gap-2 rounded-lg bg-surface-2 p-3"
	use:enhance={() => {
		submitting = true;
		return async ({ result }) => {
			submitting = false;
			if (result.type === 'success') onAdded();
		};
	}}
>
	<input type="hidden" name="trip_id" value={tripId} />
	<input type="hidden" name="day_id" value={dayId} />
	<input type="hidden" name="phase_id" value={phaseId} />
	<input type="hidden" name="original_item_id" value={originalItemId} />

	<div class="flex gap-2">
		<input
			bind:this={titleInput}
			bind:value={title}
			name="title"
			type="text"
			placeholder="What did you do instead?"
			class="border-border min-w-0 flex-1 rounded-md border bg-surface px-3 py-2 text-sm text-ink"
			required
		/>
		<select
			bind:value={type}
			name="type"
			aria-label="Item type"
			class="border-border rounded-md border bg-surface px-2 py-2 text-sm text-ink"
		>
			<option value="activity">Activity</option>
			<option value="meal">Meal</option>
			<option value="lodging">Lodging</option>
			<option value="transportation">Transport</option>
			<option value="note">Note</option>
		</select>
	</div>

	<div class="flex justify-end gap-2">
		<button type="button" onclick={onCancel} class="px-3 py-1.5 text-sm text-ink-muted">
			Cancel
		</button>
		<button
			type="submit"
			disabled={submitting || !title.trim()}
			class="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper disabled:opacity-40"
		>
			{submitting ? 'Adding...' : 'Add replacement'}
		</button>
	</div>
</form>
