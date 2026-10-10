<script lang="ts">
	import { enhance } from '$app/forms';
	import { validateForm } from '$lib/shell/actions/validate-form';
	import ServerErrorAlert from '$lib/ui/ServerErrorAlert.svelte';
	import NavBar from '$lib/ui/NavBar.svelte';
	import SaveBar from '$lib/ui/SaveBar.svelte';
	import Button from '$lib/ui/Button.svelte';
	import { toast } from '$lib/shell/stores/toast';
	import UnsavedChangesGuard from '$lib/ui/UnsavedChangesGuard.svelte';
	import ItemForm from '$lib/itinerary/components/ItemForm.svelte';
	import type { ItemFormData } from '$lib/itinerary/components/ItemFormFields';
	import { buildEmptyFormData } from '$lib/itinerary/item-fields';
	import { page } from '$app/state';
	import type { ItemType } from '$lib/types';

	let { data, form } = $props();

	// Back/cancel target mirrors where a successful submit returns (#178):
	//   - Edit & Approve (?suggestion=) → Inbox (where approve also lands)
	//   (Trip-Mode quick-add used to be a branch here; #361's `?from=` carries that
	//    origin now, and resolveBack prefers it over this fallback.)
	//   - entered from a day (?day=) → that day view (was teleporting to Overview)
	//   - otherwise → the trip Overview
	let backHref = $derived(
		page.url.searchParams.get('suggestion')
			? `/trips/${data.trip.slug}/inbox`
			: data.preselectedDay
				? `/trips/${data.trip.slug}/days/${data.preselectedDay}`
				: `/trips/${data.trip.slug}`
	);

	let dirty = $state(false);
	let submitting = $state(false);
	let loading = $state(false);

	// #444 — Suggestion edit view: Reject (needs a one-line note) / Save (stays
	// pending) / Approve. `intent` rides on the submitter button.
	let rejectOpen = $state(false);
	let rejectNote = $state('');

	let submitAsSuggestion = $derived(data.submitAsSuggestion ?? false);
	let prefill = $derived(data.prefill ?? null);
	let suggestionId = $derived((prefill as Record<string, unknown> | null)?._suggestion_id as string ?? '');
	let prefillAuthorName = $derived((prefill as Record<string, unknown> | null)?._author_name as string ?? '');
	let prefillDayLabel = $derived((prefill as Record<string, unknown> | null)?._proposed_day_label as string ?? '');

	let buttonLabel = $derived(
		loading
			? (submitAsSuggestion ? 'Submitting…' : suggestionId ? 'Approving…' : 'Creating…')
			: (submitAsSuggestion ? 'Submit suggestion' : suggestionId ? 'Approve' : 'Create item')
	);

	// #367 — the navigation guard and its beforeunload twin now live in
	// UnsavedChangesGuard (rendered at the bottom of this page), which replaces
	// the browser's own confirm dialog. In the installed PWA that rendered as
	// "app.vandenwarsen.com says…" in the middle of a form.
	const guardDirty = $derived(dirty && !submitting);

	// #177 — prefill ALL payload fields the traveler proposed, not just half.
	// Previously day/phase/cost/subtype/end_date/assignee were dropped, so an
	// Edit & Approve overwrote the original payload with empties (and a phase=''
	// item fell into the no-surface limbo). day + phase flow through the
	// create-mode context preselect (server seeds them from the payload), so
	// they're not repeated here; everything else is set on initialData.
	// #263 — Goal → "Plan this": when the composer arrives seeded from a goal
	// (and not an Edit & Approve), the goal title/notes seed the item and the
	// originating goal is pre-checked under "Addresses goal(s)".
	let goalPrefillId = $derived(data.prefillGoalId ?? '');
	let goalPrefillTitle = $derived(data.prefillGoalTitle ?? '');
	let goalPrefillDescription = $derived(data.prefillGoalDescription ?? '');

	let initialData: ItemFormData = $derived({
		...buildEmptyFormData((prefill?.type as ItemType) ?? 'activity'),
		type: (prefill?.type as ItemType) ?? 'activity',
		subtype: (prefill?.subtype as string) ?? '',
		title: (prefill?.title as string) ?? goalPrefillTitle,
		description: (prefill?.description as string) ?? goalPrefillDescription,
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
		linked_goal_ids: goalPrefillId ? [goalPrefillId] : [],
	});
</script>

<NavBar title="New item" subtitle={data.trip.title} back {backHref} />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8 space-y-4">
	<ServerErrorAlert {form} />

	{#if submitAsSuggestion}
		<div class="border-sky/30 bg-sky/10 text-sky-700 rounded-md border p-3 text-sm">
			You're a traveler on this trip. Your item will be submitted as a suggestion for the owner to review.
		</div>
	{/if}

	{#if suggestionId && prefillAuthorName}
		<div class="border-moss/30 bg-moss-tint text-moss rounded-md border p-3 text-sm">
			Proposed by <strong>{prefillAuthorName}</strong>{#if prefillDayLabel}
				for <strong>{prefillDayLabel}</strong>{/if}. Edit as needed, then Save (it stays pending) or Approve.
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
				if (result.type === 'success' && (result.data as { saved?: boolean } | undefined)?.saved) {
					// #444 — Save keeps the Suggestion pending and keeps us here: no
					// form reset (it would wipe what was just typed), dirty clears.
					loading = false;
					submitting = false;
					dirty = false;
					toast.show('Saved. Still pending.');
					await update({ reset: false });
					return;
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

		{#if suggestionId}
			<SaveBar {loading} label={buttonLabel}>
				<div class="space-y-2">
					{#if rejectOpen}
						<!-- Reject keeps its one-line note rule. -->
						<label for="reject-note-edit" class="text-ink-soft block text-xs font-medium">
							Reason for rejecting (required)
						</label>
						<input
							id="reject-note-edit"
							name="review_note"
							type="text"
							bind:value={rejectNote}
							placeholder="Why isn’t this a fit?"
							class="border-line bg-surface text-ink block min-h-[44px] w-full rounded-md border px-3 text-sm"
						/>
						<div class="flex gap-2">
							<Button type="button" variant="ghost" size="lg" class="flex-1" disabled={loading} onclick={() => { rejectOpen = false; rejectNote = ''; }}>
								Cancel
							</Button>
							<Button type="submit" name="intent" value="reject" variant="outline" size="lg" class="flex-1" disabled={loading || !rejectNote.trim()}>
								Confirm reject
							</Button>
						</div>
					{:else}
						<div class="flex gap-2">
							<Button type="button" variant="ghost" size="lg" class="flex-1" disabled={loading} onclick={() => (rejectOpen = true)}>
								Reject
							</Button>
							<Button type="submit" name="intent" value="save" variant="outline" size="lg" class="flex-1" disabled={loading}>
								Save
							</Button>
							<Button type="submit" name="intent" value="approve" variant="moss" size="lg" class="flex-1" disabled={loading} {loading}>
								{buttonLabel}
							</Button>
						</div>
					{/if}
				</div>
			</SaveBar>
		{:else}
			<SaveBar {loading} label={buttonLabel} />
		{/if}
	</form>
	<div class="save-bar-spacer" aria-hidden="true"></div>
</main>

<UnsavedChangesGuard
	dirty={guardDirty}
	body="This item has not been created yet. Leaving now discards what you have typed."
/>

<style>
	/* Reserve scroll room so the last fields clear the fixed SaveBar (see SaveBar.svelte).
	   Heights track SaveBar's padding: mobile clears the BottomNav (+5rem); >=900px there
	   is no BottomNav so a small clearance suffices. */
	.save-bar-spacer {
		height: calc(env(safe-area-inset-bottom, 0px) + 8.5rem);
	}
	@media (min-width: 900px) {
		.save-bar-spacer {
			height: 4rem;
		}
	}
</style>
