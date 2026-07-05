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
	class="bg-surface-2 mt-2 flex flex-col gap-2 rounded-lg p-3"
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
			class="border-border bg-surface text-ink min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
			required
		/>
		<select
			bind:value={type}
			name="type"
			aria-label="Item type"
			class="border-border bg-surface text-ink rounded-md border px-2 py-2 text-sm"
		>
			<option value="activity">Activity</option>
			<option value="meal">Meal</option>
			<option value="lodging">Lodging</option>
			<option value="transportation">Transport</option>
			<option value="note">Note</option>
		</select>
	</div>

	<div class="flex justify-end gap-2">
		<button
			type="button"
			onclick={onCancel}
			class="text-ink-muted px-3 py-1.5 text-sm"
		>
			Cancel
		</button>
		<button
			type="submit"
			disabled={submitting || !title.trim()}
			class="bg-ink text-paper rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40"
		>
			{submitting ? 'Adding...' : 'Add replacement'}
		</button>
	</div>
</form>
