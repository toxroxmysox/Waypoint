<script lang="ts">
	import { enhance } from '$app/forms';
	import { validateForm } from '$lib/shell/actions/validate-form';
	import { beforeNavigate } from '$app/navigation';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Button from '$lib/ui/Button.svelte';
	import ItemForm from '$lib/itinerary/components/ItemForm.svelte';
	import type { ItemFormData } from '$lib/itinerary/components/ItemFormFields';
	import { untrack } from 'svelte';

	let { data, form } = $props();

	let dirty = $state(false);
	let submitting = $state(false);
	let loading = $state(false);
	let deleting = $state(false);
	let confirmDelete = $state(false);
	let error = $derived(form?.error ?? '');

	beforeNavigate(({ cancel }) => {
		if (dirty && !submitting && !confirm('You have unsaved changes. Leave anyway?')) cancel();
	});

	$effect(() => {
		if (!dirty) return;
		const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	});

	let initialData: ItemFormData = untrack(() => ({
		type: data.item.type,
		subtype: data.item.subtype ?? '',
		title: data.item.title ?? '',
		description: data.item.description ?? '',
		day: data.item.day ?? '',
		phase: data.item.phase ?? '',
		start_time: data.item.start_time ?? '',
		end_time: data.item.end_time ?? '',
		end_date: data.item.end_date ?? '',
		location_name: data.item.location_name ?? '',
		location_address: data.item.location_address ?? '',
		location_coords: data.item.location_coords ?? null,
		google_place_id: data.item.google_place_id ?? '',
		booked: data.item.booked ?? false,
		reservation_url: data.item.reservation_url ?? '',
		free_cancellation: data.item.free_cancellation ?? false,
		cost_estimate_usd: data.item.cost_estimate_usd ?? 0,
		cost_actual_usd: data.item.cost_actual_usd ?? 0,
		confirmation_codes: data.item.confirmation_codes ?? [],
		assigned_to: data.item.assigned_to ?? [],
		status: data.item.status ?? 'planned'
	}));
</script>

<NavBar
	title="Edit"
	subtitle={data.item.title}
	back
	backHref="/trips/{data.trip.slug}/items/{data.item.id}"
/>

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8 space-y-4">
	{#if error}
		<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">{error}</div>
	{/if}

	<form
		method="POST"
		action="?/update"
		use:validateForm
		use:enhance={() => {
			loading = true;
			submitting = true;
			return async ({ update, result }) => {
				if (result.type === 'failure') {
					loading = false;
					submitting = false;
				}
				await update();
			};
		}}
		class="space-y-4"
	>
		<ItemForm
			mode="edit"
			{initialData}
			context={{
				days: data.days,
				phases: data.phases,
				members: data.members,
				tripStartDate: data.tripStartDate,
				tripEndDate: data.tripEndDate
			}}
			bind:dirty
			typeEditable={true}
		/>

		<div class="sticky bottom-20 md-desktop:bottom-4 z-sticky bg-paper -mx-4 px-4 pt-2 pb-2">
			<Button type="submit" disabled={loading} loading={loading} variant="moss" size="lg" class="w-full">
				{loading ? 'Saving…' : 'Save changes'}
			</Button>
		</div>
	</form>

	<div class="border-clay/30 rounded-lg border p-4">
		<h3 class="text-clay text-sm font-semibold">Delete item</h3>
		{#if !confirmDelete}
			<button
				type="button"
				onclick={() => (confirmDelete = true)}
				class="border-clay/40 text-clay hover:bg-clay/10 mt-2 rounded-md border px-3 py-1.5 text-sm font-semibold"
			>
				Delete
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
				class="mt-2 flex items-center gap-2"
			>
				<button
					type="submit"
					disabled={deleting}
					class="bg-clay text-paper hover:bg-clay/90 rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
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
