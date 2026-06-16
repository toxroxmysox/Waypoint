<script lang="ts">
	import { enhance } from '$app/forms';
	import { validateForm } from '$lib/shell/actions/validate-form';
	import { beforeNavigate } from '$app/navigation';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Button from '$lib/ui/Button.svelte';
	import ItemForm from '$lib/itinerary/components/ItemForm.svelte';
	import type { ItemFormData } from '$lib/itinerary/components/ItemFormFields';
	import { buildEmptyFormData } from '$lib/itinerary/item-fields';
	import { fromTrip } from '$lib/shell/nav-tabs';
	import { page } from '$app/state';
	import type { ItemType } from '$lib/types';

	let { data, form } = $props();

	// Back/cancel target mirrors where a successful submit returns (#178):
	//   - Edit & Approve (?suggestion=) → Inbox (where approve also lands)
	//   - Trip-Mode quick-add (?from=trip) → Today (#197 / #169)
	//   - entered from a day (?day=) → that day view (was teleporting to Overview)
	//   - otherwise → the trip Overview
	let backHref = $derived(
		page.url.searchParams.get('suggestion')
			? `/trips/${data.trip.slug}/inbox`
			: fromTrip(page.url)
				? `/trips/${data.trip.slug}/today`
				: data.preselectedDay
					? `/trips/${data.trip.slug}/days/${data.preselectedDay}`
					: `/trips/${data.trip.slug}`
	);

	let dirty = $state(false);
	let submitting = $state(false);
	let loading = $state(false);
	let error = $derived(form?.error ?? '');

	// #236: same anchored Save bar as edit — collapse the BottomNav-clearance when
	// the soft keyboard is open (BottomNav unmounts on input focus), so the sticky
	// bar pins to the true bottom and stops floating/jittering on scroll.
	let inputFocused = $state(false);
	function handleFocusIn(e: FocusEvent) {
		const tag = (e.target as HTMLElement)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') inputFocused = true;
	}
	function handleFocusOut() {
		inputFocused = false;
	}

	let submitAsSuggestion = $derived(data.submitAsSuggestion ?? false);
	let prefill = $derived(data.prefill ?? null);
	let suggestionId = $derived((prefill as Record<string, unknown> | null)?._suggestion_id as string ?? '');
	let prefillAuthorName = $derived((prefill as Record<string, unknown> | null)?._author_name as string ?? '');
	let prefillDayLabel = $derived((prefill as Record<string, unknown> | null)?._proposed_day_label as string ?? '');

	let buttonLabel = $derived(
		loading
			? (submitAsSuggestion ? 'Submitting…' : suggestionId ? 'Approving…' : 'Creating…')
			: (submitAsSuggestion ? 'Submit suggestion' : suggestionId ? 'Approve with edits' : 'Create item')
	);

	beforeNavigate(({ cancel }) => {
		if (dirty && !submitting && !confirm('You have unsaved changes. Leave anyway?')) cancel();
	});

	$effect(() => {
		if (!dirty) return;
		const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	});

	// #177 — prefill ALL payload fields the traveler proposed, not just half.
	// Previously day/phase/cost/subtype/end_date/assignee were dropped, so an
	// Edit & Approve overwrote the original payload with empties (and a phase=''
	// item fell into the no-surface limbo). day + phase flow through the
	// create-mode context preselect (server seeds them from the payload), so
	// they're not repeated here; everything else is set on initialData.
	let initialData: ItemFormData = $derived({
		...buildEmptyFormData((prefill?.type as ItemType) ?? 'activity'),
		type: (prefill?.type as ItemType) ?? 'activity',
		subtype: (prefill?.subtype as string) ?? '',
		title: (prefill?.title as string) ?? '',
		description: (prefill?.description as string) ?? '',
		start_time: (prefill?.start_time as string) ?? '',
		end_time: (prefill?.end_time as string) ?? '',
		end_date: (prefill?.end_date as string) ?? '',
		location_name: (prefill?.location_name as string) ?? '',
		location_address: (prefill?.location_address as string) ?? '',
		location_coords: prefill?.location_coords ?? null,
		google_place_id: (prefill?.google_place_id as string) ?? '',
		confirmation_codes: Array.isArray(prefill?.confirmation_codes) ? prefill.confirmation_codes : [],
		booked: prefill?.booked === true,
		requires_booking: prefill?.requires_booking === true,
		reservation_url: (prefill?.reservation_url as string) ?? '',
		free_cancellation: prefill?.free_cancellation === true,
		cost_estimate_usd: Number(prefill?.cost_estimate_usd) || 0,
		assigned_to: Array.isArray(prefill?.assigned_to) ? (prefill.assigned_to as string[]) : [],
	});
</script>

<svelte:window onfocusin={handleFocusIn} onfocusout={handleFocusOut} />

<NavBar title="New item" subtitle={data.trip.title} back {backHref} />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8 space-y-4">
	{#if error}
		<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">{error}</div>
	{/if}

	{#if submitAsSuggestion}
		<div class="border-sky/30 bg-sky/10 text-sky-700 rounded-md border p-3 text-sm">
			You're a traveler on this trip. Your item will be submitted as a suggestion for the owner to review.
		</div>
	{/if}

	{#if suggestionId && prefillAuthorName}
		<div class="border-moss/30 bg-moss-tint text-moss rounded-md border p-3 text-sm">
			Proposed by <strong>{prefillAuthorName}</strong>{#if prefillDayLabel}
				for <strong>{prefillDayLabel}</strong>{/if}. Edit as needed, then approve.
		</div>
	{/if}

	<form
		method="POST"
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
		{#if suggestionId}
			<input type="hidden" name="suggestion_id" value={suggestionId} />
		{/if}

		<ItemForm
			mode="create"
			{initialData}
			context={{
				days: data.days,
				phases: data.phases,
				members: data.members,
				goals: data.goals,
				preselectedDay: data.preselectedDay,
				preselectedPhase: data.preselectedPhase,
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
				{buttonLabel}
			</Button>
		</div>
	</form>
</main>

<style>
	/* #236: anchored Save bar — see edit/+page.svelte for the full rationale.
	   Pinned to bottom:0 with the BottomNav clearance as INTERNAL padding-bottom, so
	   the opaque bg-paper fills the strip to the viewport bottom (content behind it
	   never peeks through a gap) while the button clears the nav. Keyboard closed:
	   safe-area + 5rem. Keyboard open: BottomNav gone → safe-area only. Desktop: 1rem. */
	.save-bar {
		bottom: 0;
		padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 5.5rem);
	}
	.save-bar.save-bar--keyboard {
		padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 0.5rem);
	}
	@media (min-width: 900px) {
		.save-bar,
		.save-bar.save-bar--keyboard {
			padding-bottom: 1rem;
		}
	}
</style>
