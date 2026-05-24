<script lang="ts">
	import { enhance } from '$app/forms';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let { form } = $props();

	let submitting = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();
	let preview = $state<{ title: string; dates: string; phases: number; items: number } | null>(
		null
	);

	function handleFileChange() {
		const file = fileInput?.files?.[0];
		if (!file) {
			preview = null;
			return;
		}

		const reader = new FileReader();
		reader.onload = () => {
			try {
				const data = JSON.parse(reader.result as string);
				if (data._waypoint_version === 1 && data.trip?.title) {
					preview = {
						title: data.trip.title,
						dates: `${data.trip.start_date} to ${data.trip.end_date}`,
						phases: Array.isArray(data.phases) ? data.phases.length : 0,
						items: Array.isArray(data.items) ? data.items.length : 0
					};
				} else {
					preview = null;
				}
			} catch {
				preview = null;
			}
		};
		reader.readAsText(file);
	}
</script>

<svelte:head>
	<title>Import Trip</title>
</svelte:head>

<NavBar title="Import Trip" back backHref="/trips" />

<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-8">
	{#if form?.error}
		<div class="border-error/30 bg-error/10 text-error-deep mb-4 rounded-md border p-3 text-sm">
			{form.error}
		</div>
	{/if}

	<form
		method="POST"
		action="?/import"
		enctype="multipart/form-data"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				submitting = false;
				await update();
			};
		}}
		class="space-y-4"
	>
		<div>
			<label for="file" class="text-ink-soft block text-sm font-medium">
				Select a Waypoint JSON export file
			</label>
			<input
				bind:this={fileInput}
				type="file"
				id="file"
				name="file"
				accept=".json,application/json"
				onchange={handleFileChange}
				class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1 file:text-sm"
			/>
		</div>

		{#if preview}
			<div class="bg-surface border-border rounded-lg border p-4 space-y-1">
				<p class="text-ink text-sm font-semibold">{preview.title}</p>
				<p class="text-ink-muted text-xs">{preview.dates}</p>
				<p class="text-ink-muted text-xs">{preview.phases} phases, {preview.items} items</p>
			</div>
		{/if}

		<Button type="submit" disabled={submitting || !fileInput?.files?.length} variant="moss" size="md" class="w-full">
			{submitting ? 'Importing...' : 'Import Trip'}
		</Button>
	</form>

	<p class="text-ink-muted mt-6 text-center text-xs">
		Import creates a new trip from a previously exported Waypoint JSON file. Confirmation codes and costs are included if present in the export.
	</p>
</main>
