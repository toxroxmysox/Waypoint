<script lang="ts">
	import { enhance } from '$app/forms';
	import { validateForm } from '$lib/shell/actions/validate-form';
	import ServerErrorAlert from '$lib/ui/ServerErrorAlert.svelte';
	import { goto } from '$app/navigation';
	import NavBar from '$lib/ui/NavBar.svelte';
	import SaveBar from '$lib/ui/SaveBar.svelte';
	import UnsavedChangesGuard from '$lib/ui/UnsavedChangesGuard.svelte';
	import ItemForm from '$lib/itinerary/components/ItemForm.svelte';
	import type { ItemFormData } from '$lib/itinerary/components/ItemFormFields';
	import { untrack } from 'svelte';
	import { ITEM_ACTION_ERRORS } from '$lib/itinerary/item-actions';

	let { data, form } = $props();

	let dirty = $state(false);
	let submitting = $state(false);
	let loading = $state(false);
	let deleting = $state(false);
	let confirmDelete = $state(false);
	let deleteError = $state('');

	// #367 — the navigation guard and its beforeunload twin now live in
	// UnsavedChangesGuard (rendered at the bottom of this page), which replaces
	// the browser's own confirm dialog. In the installed PWA that rendered as
	// "app.vandenwarsen.com says…" in the middle of a form.
	// `deleting` counts as a save, not an abandonment — it must not prompt.
	const guardDirty = $derived(dirty && !submitting && !deleting);

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
		// #130 — preserve stored flight tz across edits (never shown).
		start_tz: data.item.start_tz ?? '',
		end_tz: data.item.end_tz ?? '',
		flight_number: data.item.flight_number ?? '',
		location_name: data.item.location_name ?? '',
		location_address: data.item.location_address ?? '',
		location_coords: data.item.location_coords ?? null,
		google_place_id: data.item.google_place_id ?? '',
		booked: data.item.booked ?? false,
		requires_booking: data.item.requires_booking ?? false,
		reservation_url: data.item.reservation_url ?? '',
		free_cancellation: data.item.free_cancellation ?? false,
		cost_estimate_usd: data.item.cost_estimate_usd ?? 0,
		confirmation_codes: data.item.confirmation_codes ?? [],
		assigned_to: data.item.assigned_to ?? [],
		status: data.item.status ?? 'planned',
		linked_goal_ids: data.item.linked_goal_ids ?? []
	}));
</script>

<NavBar
	title="Edit"
	subtitle={data.item.title}
	back
	backHref="/trips/{data.trip.slug}/items/{data.item.id}"
/>

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8 space-y-4">
	<ServerErrorAlert {form} />

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
					await update();
				} else if (result.type === 'redirect') {
					// replaceState so back skips the edit form and returns to the
					// screen the user came from, not the edit page (#214 / ADR-0012).
					await goto(result.location, { replaceState: true });
				} else {
					await update();
				}
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
				goals: data.goals,
				tripStartDate: data.tripStartDate,
				tripEndDate: data.tripEndDate
			}}
			bind:dirty
			typeEditable={true}
		/>

		<SaveBar {loading} label={loading ? 'Saving…' : 'Save changes'} />
	</form>

	{#if data.canDelete}
		<div class="border-error/30 rounded-lg border p-4">
			<h3 class="text-error text-sm font-semibold">Delete item</h3>
			{#if !confirmDelete}
				<button
					type="button"
					onclick={() => (confirmDelete = true)}
					class="hit-44 border-error/40 text-error hover:bg-error/10 active:bg-error/10 mt-2 rounded-md border px-3 py-1.5 text-sm font-semibold"
				>
					Delete
				</button>
			{:else}
				<form
					method="POST"
					action="?/delete"
					use:enhance={() => {
						deleting = true;
						deleteError = '';
						return async ({ result, update }) => {
							if (result.type === 'redirect' || result.type === 'success') {
								await update();
							} else {
								deleteError = ITEM_ACTION_ERRORS.delete;
							}
							deleting = false;
						};
					}}
					class="mt-2 flex items-center gap-2"
				>
					<button
						type="submit"
						disabled={deleting}
						class="hit-44 bg-error text-paper hover:bg-error/90 active:bg-error/90 rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
					>
						{deleting ? 'Deleting…' : 'Confirm delete'}
					</button>
					<button
						type="button"
						onclick={() => {
							confirmDelete = false;
							deleteError = '';
						}}
						class="hit-44 text-ink-muted hover:text-ink-soft active:text-ink-soft text-sm"
					>
						Cancel
					</button>
				</form>
			{/if}
			{#if deleteError || form?.deleteError}
				<p role="alert" class="text-error mt-2 text-sm">{deleteError || form?.deleteError}</p>
			{/if}
		</div>
	{/if}
	<div class="save-bar-spacer" aria-hidden="true"></div>
</main>

<UnsavedChangesGuard
	dirty={guardDirty}
	body="Your edits to this item have not been saved yet."
/>

<style>
	/* Reserve scroll room so the last fields + Delete clear the fixed SaveBar
	   (see SaveBar.svelte). Heights track SaveBar's padding: mobile clears the
	   BottomNav (+5rem); >=900px there is no BottomNav so a small clearance suffices. */
	.save-bar-spacer {
		height: calc(env(safe-area-inset-bottom, 0px) + 8.5rem);
	}
	@media (min-width: 900px) {
		.save-bar-spacer {
			height: 4rem;
		}
	}
</style>
