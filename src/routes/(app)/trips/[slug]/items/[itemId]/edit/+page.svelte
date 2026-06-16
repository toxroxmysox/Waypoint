<script lang="ts">
	import { enhance } from '$app/forms';
	import { validateForm } from '$lib/shell/actions/validate-form';
	import { beforeNavigate, goto } from '$app/navigation';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Button from '$lib/ui/Button.svelte';
	import ItemForm from '$lib/itinerary/components/ItemForm.svelte';
	import type { ItemFormData } from '$lib/itinerary/components/ItemFormFields';
	import { markReplaceNavigation } from '$lib/shell/stores/nav-depth';
	import { untrack } from 'svelte';

	let { data, form } = $props();

	let dirty = $state(false);
	let submitting = $state(false);
	let loading = $state(false);
	let deleting = $state(false);
	let confirmDelete = $state(false);
	let error = $derived(form?.error ?? '');

	// #236: the sticky Save bar must collapse its BottomNav-clearance when the soft
	// keyboard is open. BottomNav unmounts on input focus (to clear the keyboard),
	// so a fixed `bottom: 5rem` clearance becomes dead space — the bar then floats
	// mid-viewport and jitters as iOS resizes the visual viewport during scroll.
	// Mirror BottomNav's own focus detection: keyboard open → pin to the true
	// bottom (safe-area only); keyboard closed → sit above BottomNav (matches FAB).
	let inputFocused = $state(false);
	function handleFocusIn(e: FocusEvent) {
		const tag = (e.target as HTMLElement)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') inputFocused = true;
	}
	function handleFocusOut() {
		inputFocused = false;
	}

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
		// #130 — preserve stored flight tz across edits (never shown).
		start_tz: data.item.start_tz ?? '',
		end_tz: data.item.end_tz ?? '',
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

<svelte:window onfocusin={handleFocusIn} onfocusout={handleFocusOut} />

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
					await update();
				} else if (result.type === 'redirect') {
					// replaceState so back skips the edit form and returns to the
					// screen the user came from, not the edit page (#214 / ADR-0012).
					// #235: a replaceState goto adds NO history entry, but afterNavigate
					// can't detect that — announce it so the depth counter doesn't
					// overcount (which made back land on the replaced entry: flash, no
					// move). Must precede the goto so the next afterNavigate consumes it.
					markReplaceNavigation();
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

		<div
			class="save-bar sticky z-sticky bg-paper -mx-4 px-4 pt-2"
			class:save-bar--keyboard={inputFocused}
		>
			<Button type="submit" disabled={loading} loading={loading} variant="moss" size="lg" class="w-full">
				{loading ? 'Saving…' : 'Save changes'}
			</Button>
		</div>
	</form>

	<div class="border-error/30 rounded-lg border p-4">
		<h3 class="text-error text-sm font-semibold">Delete item</h3>
		{#if !confirmDelete}
			<button
				type="button"
				onclick={() => (confirmDelete = true)}
				class="border-error/40 text-error hover:bg-error/10 mt-2 rounded-md border px-3 py-1.5 text-sm font-semibold"
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
					class="bg-error text-paper hover:bg-error/90 rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
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

<style>
	/* #236: anchored Save bar.
	   - Keyboard CLOSED (mobile): sit just above the fixed BottomNav, matching the
	     FAB's offset (safe-area + 5rem). The internal bottom padding carries the
	     home-indicator safe area so the button is never under it.
	   - Keyboard OPEN (mobile): BottomNav unmounts on input focus, so drop the
	     clearance and pin to the true bottom (safe-area only). The bar then rides
	     directly above the keyboard with no mid-viewport float/jitter on scroll.
	   - Desktop (>=900px): no soft keyboard — a small static 1rem offset. */
	.save-bar {
		bottom: calc(env(safe-area-inset-bottom, 0px) + 5rem);
		padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 0.5rem);
	}
	.save-bar.save-bar--keyboard {
		bottom: env(safe-area-inset-bottom, 0px);
	}
	@media (min-width: 900px) {
		.save-bar,
		.save-bar.save-bar--keyboard {
			bottom: 1rem;
			padding-bottom: 0.5rem;
		}
	}
</style>
