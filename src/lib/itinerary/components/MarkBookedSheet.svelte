<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import BottomSheet from '$lib/ui/BottomSheet.svelte';
	import Button from '$lib/ui/Button.svelte';

	// #441 — Mark booked (spec stories 64, 65). An optional confirmation code and a
	// "Log what I paid next" box. Save writes `booked`; when ticked, the server action
	// redirects to the EXISTING Add expense, prefilled (ADR-0014: booked and paid are
	// separate facts, the sheet never writes an expense). A SvelteKit form action with
	// progressive enhancement, per the frontend patterns.
	let {
		open = $bindable(false),
		itemUrl,
		title,
		error = ''
	}: {
		open: boolean;
		/** `/trips/<slug>/items/<id>` — the action posts here. */
		itemUrl: string;
		title: string;
		/** A no-JS post that came back with an error. */
		error?: string;
	} = $props();

	let saving = $state(false);
	let failed = $state('');
	$effect(() => {
		if (open) failed = '';
	});
</script>

<BottomSheet bind:open title="Mark booked">
	<form
		method="POST"
		action="{itemUrl}?/markBooked"
		use:enhance={() => {
			saving = true;
			failed = '';
			return async ({ result, update }) => {
				saving = false;
				if (result.type === 'failure' || result.type === 'error') {
					failed = (result.type === 'failure' && (result.data as { bookError?: string })?.bookError) || "Couldn't mark this booked. Try again.";
					return;
				}
				open = false;
				// A redirect result navigates to the prefilled Add expense; a success reloads this page.
				if (result.type === 'success') await invalidateAll();
				else await update();
			};
		}}
		class="space-y-4"
		data-testid="mark-booked-form"
	>
		<p class="text-ink-soft text-sm">{title}</p>

		<div>
			<label for="mark-booked-code" class="text-ink-soft mb-1 block text-sm font-medium">
				Confirmation code <span class="text-ink-muted font-normal">(optional)</span>
			</label>
			<input
				id="mark-booked-code"
				name="code"
				type="text"
				autocomplete="off"
				autocapitalize="characters"
				maxlength="200"
				class="border-line bg-surface text-ink min-h-11 w-full rounded-md border px-3 py-2 font-mono text-base"
			/>
		</div>

		<label class="flex min-h-11 cursor-pointer items-center gap-3">
			<input type="checkbox" name="log_payment" class="accent-moss h-5 w-5 shrink-0" />
			<span class="text-ink text-sm font-medium">Log what I paid next</span>
		</label>

		{#if failed || error}
			<p role="alert" class="text-clay text-sm">{failed || error}</p>
		{/if}

		<div class="flex gap-2">
			<Button type="submit" variant="moss" size="md" class="min-h-11 flex-1" disabled={saving}>
				{saving ? 'Saving…' : 'Save'}
			</Button>
			<Button type="button" variant="outline" size="md" class="min-h-11 flex-1" onclick={() => (open = false)}>
				Cancel
			</Button>
		</div>
	</form>
</BottomSheet>
