<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/ui/Button.svelte';
	import { toast } from '$lib/shell/stores/toast';

	// #401 — one notes editor for trip, phase and day (the Level Header's notes).
	// Filled notes read as plain text with no label; a pencil edits them. Empty
	// notes show only the prompt ("Add phase notes") — or nothing, for a viewer.
	let {
		notes,
		action,
		canEdit,
		emptyPrompt,
		savedToast = 'Notes saved'
	}: {
		notes: string;
		action: string;
		canEdit: boolean;
		emptyPrompt: string;
		savedToast?: string;
	} = $props();

	let editing = $state(false);
	let saving = $state(false);
	let error = $state('');
</script>

{#if editing}
	<form
		method="POST"
		{action}
		use:enhance={() => {
			saving = true;
			error = '';
			return async ({ result, update }) => {
				saving = false;
				if (result.type === 'success') {
					editing = false;
					toast.show(savedToast);
					await update();
				} else if (result.type === 'failure') {
					error = (result.data?.error as string) || "Couldn't save notes.";
				} else {
					await update();
				}
			};
		}}
	>
		<!-- svelte-ignore a11y_autofocus -->
		<textarea
			name="notes"
			rows="3"
			maxlength="5000"
			autofocus
			aria-label="Notes"
			class="block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
			>{notes}</textarea
		>
		{#if error}
			<p class="mt-1 text-xs text-error-deep" role="alert">{error}</p>
		{/if}
		<div class="mt-2 flex gap-2">
			<Button type="submit" variant="primary" size="sm" disabled={saving} loading={saving}>
				{saving ? 'Saving…' : 'Save'}
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onclick={() => ((editing = false), (error = ''))}>Cancel</Button
			>
		</div>
	</form>
{:else if notes}
	<div class="flex items-start gap-1">
		<p class="min-w-0 flex-1 pt-2.5 text-sm whitespace-pre-wrap text-ink-soft">{notes}</p>
		{#if canEdit}
			<button
				type="button"
				aria-label="Edit notes"
				onclick={() => (editing = true)}
				class="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:text-ink-soft"
			>
				<svg
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M16.86 3.49a2.1 2.1 0 113 3L7.5 18.85 3 20l1.15-4.5L16.86 3.49z"
					/>
				</svg>
			</button>
		{/if}
	</div>
{:else if canEdit}
	<button
		type="button"
		onclick={() => (editing = true)}
		class="-ml-1 flex min-h-11 items-center gap-1.5 px-1 text-sm text-ink-muted hover:text-ink-soft"
	>
		<svg
			class="h-4 w-4"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14" />
		</svg>
		{emptyPrompt}
	</button>
{/if}
