<script lang="ts">
	import { enhance } from '$app/forms';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TripTabs from '$lib/components/TripTabs.svelte';

	let { data, form } = $props();

	let loading = $state(false);
	let deleting = $state(false);
	let confirmDelete = $state(false);
	let error = $derived(form?.error ?? '');
	let success = $derived(form?.success ?? false);
</script>

<NavBar title="Settings" subtitle={data.trip.title} back backHref="/trips/{data.trip.slug}" />
<TripTabs slug={data.trip.slug} />

<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-8 space-y-6">
	{#if error}
		<div class="border-clay/30 bg-clay/10 text-clay rounded-md border p-3 text-sm">{error}</div>
	{/if}

	{#if success}
		<div class="border-moss/30 bg-moss-tint text-moss rounded-md border p-3 text-sm">Trip updated.</div>
	{/if}

	<Card>
		<form
			method="POST"
			action="?/update"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}
			class="p-4 space-y-4"
		>
			<div>
				<label for="title" class="text-ink-soft block text-sm font-medium">Trip name</label>
				<input
					type="text"
					id="title"
					name="title"
					required
					value={data.trip.title}
					class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
				/>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="min-w-0">
					<label for="start_date" class="text-ink-soft block text-sm font-medium">Start date</label>
					<input
						type="date"
						id="start_date"
						name="start_date"
						required
						value={data.trip.start_date.split('T')[0].split(' ')[0]}
						class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-3 py-2 text-sm"
					/>
				</div>
				<div class="min-w-0">
					<label for="end_date" class="text-ink-soft block text-sm font-medium">End date</label>
					<input
						type="date"
						id="end_date"
						name="end_date"
						required
						value={data.trip.end_date.split('T')[0].split(' ')[0]}
						class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-3 py-2 text-sm"
					/>
				</div>
			</div>

			<div>
				<label for="timezone" class="text-ink-soft block text-sm font-medium">Timezone</label>
				<input
					type="text"
					id="timezone"
					name="timezone"
					value={data.trip.timezone}
					class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					placeholder="Europe/Madrid"
				/>
			</div>

			<div>
				<label for="location_summary" class="text-ink-soft block text-sm font-medium">Location</label>
				<input
					type="text"
					id="location_summary"
					name="location_summary"
					value={data.trip.location_summary}
					class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					placeholder="Spain"
				/>
			</div>

			<Button type="submit" disabled={loading} variant="moss" size="md" class="w-full">
				{loading ? 'Saving…' : 'Save changes'}
			</Button>
		</form>
	</Card>

	<div class="border-clay/30 rounded-lg border p-4">
		<h3 class="text-clay text-sm font-semibold">Danger zone</h3>
		<p class="text-clay/80 mt-1 text-xs">
			Deleting a trip removes all phases, days, and items permanently.
		</p>
		{#if !confirmDelete}
			<button
				type="button"
				onclick={() => (confirmDelete = true)}
				class="border-clay/40 text-clay hover:bg-clay/10 mt-3 rounded-md border px-3 py-1.5 text-sm font-semibold"
			>
				Delete trip
			</button>
		{:else}
			<form
				method="POST"
				action="?/delete"
				use:enhance={() => {
					deleting = true;
					return async ({ update }) => {
						deleting = false;
						await update();
					};
				}}
				class="mt-3 flex items-center gap-2"
			>
				<button
					type="submit"
					disabled={deleting}
					class="bg-clay text-paper hover:bg-clay/90 rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
				>
					{deleting ? 'Deleting…' : 'Confirm delete'}
				</button>
				<button
					type="button"
					onclick={() => (confirmDelete = false)}
					class="text-ink-muted hover:text-ink-soft text-sm"
				>
					Cancel
				</button>
			</form>
		{/if}
	</div>
</main>
