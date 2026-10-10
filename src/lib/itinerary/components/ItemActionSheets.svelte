<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { toast } from '$lib/shell/stores/toast';
	import { useChromeMode } from '$lib/shell/chrome-mode';
	import { skipDestination, ITEM_ACTION_ERRORS } from '$lib/itinerary/item-actions';
	import BottomSheet from '$lib/ui/BottomSheet.svelte';
	import Button from '$lib/ui/Button.svelte';
	import MoveItemSheet from '$lib/itinerary/components/MoveItemSheet.svelte';
	import type { Day, Phase } from '$lib/types';

	// #437 — the sheets behind the `⋯` menu: Move, Skip and Delete. Each is mounted
	// only when the permissions gave the viewer that entry (`can*`), and a refused or
	// failed action says so inside the sheet that tried it (#416 ITEM_ACTION_ERRORS)
	// — these replace the old bottom-of-page Skip / Delete panels.

	let {
		moveOpen = $bindable(false),
		skipOpen = $bindable(false),
		deleteOpen = $bindable(false),
		canMove,
		canSkip,
		canDelete,
		slug,
		itemId,
		typeLabel,
		docCount = 0,
		days = [] as Day[],
		phases = [] as Phase[],
		currentDay = '',
		currentPhase = '',
		moveTitle = 'Move Item',
		form = null,
		onskipped
	}: {
		moveOpen?: boolean;
		skipOpen?: boolean;
		deleteOpen?: boolean;
		canMove: boolean;
		canSkip: boolean;
		canDelete: boolean;
		slug: string;
		itemId: string;
		/** Lower-cased type word for the copy: "activity", "meal". */
		typeLabel: string;
		docCount?: number;
		days?: Day[];
		phases?: Phase[];
		currentDay?: string;
		currentPhase?: string;
		/** #442 — "Add to a day" on an idea opens this same sheet under that name. */
		moveTitle?: string;
		/** The page's `form` result — covers a no-JS post that came back with an error. */
		form?: { skipError?: string; deleteError?: string } | null;
		/** A host that is itself the Skip destination (Now's Hero, #428) refreshes in place
		 *  and gets this call, instead of navigating to itself. */
		onskipped?: () => void;
	} = $props();

	const chromeMode = useChromeMode();
	const itemUrl = $derived(`/trips/${slug}/items/${itemId}`);

	let skipping = $state(false);
	let skipError = $state('');
	let deleting = $state(false);
	let deleteError = $state('');

	$effect(() => {
		if (skipOpen) skipError = '';
	});
	$effect(() => {
		if (deleteOpen) deleteError = '';
	});
</script>

{#if canMove}
	<MoveItemSheet
		bind:open={moveOpen}
		{days}
		{phases}
		{currentDay}
		{currentPhase}
		actionUrl={itemUrl}
		title={moveTitle}
	/>
{/if}

<!-- #246 Door 2 — Skip is reversible and distinct from Delete: the item leaves its
     day and returns to its phase's ideas. Trip Mode then goes to Now, where the
     ideas strip offers a replacement; Planning Mode stays here (#416). -->
{#if canSkip}
	<BottomSheet bind:open={skipOpen} title="Not happening?">
		<form
			method="POST"
			action="{itemUrl}?/skipItem"
			use:enhance={() => {
				skipping = true;
				skipError = '';
				return async ({ result, update }) => {
					skipping = false;
					if (result.type !== 'success') {
						skipError = ITEM_ACTION_ERRORS.skip;
						return;
					}
					skipOpen = false;
					if (onskipped) {
						await invalidateAll();
						onskipped();
						return;
					}
					// Trip Mode → Now (the ideas strip opens there). Planning Mode →
					// stay: reload this page, where the item is an idea again.
					const destination = skipDestination(chromeMode(), slug);
					if (destination) {
						await goto(destination);
					} else {
						await update();
						toast.show("Skipped. It's back in your ideas.");
					}
				};
			}}
			class="space-y-4"
		>
			<p class="text-ink-soft text-sm">
				Skip this {typeLabel}? It returns to your ideas so you can do it later or pick a
				replacement. Nothing is deleted.
			</p>
			{#if skipError || form?.skipError}
				<p role="alert" class="text-clay text-sm">{skipError || form?.skipError}</p>
			{/if}
			<div class="flex gap-2">
				<Button type="submit" variant="moss" size="md" class="min-h-11 flex-1" disabled={skipping}>
					{skipping ? 'Skipping…' : 'Skip'}
				</Button>
				<Button
					type="button"
					variant="outline"
					size="md"
					class="min-h-11 flex-1"
					onclick={() => (skipOpen = false)}
				>
					Cancel
				</Button>
			</div>
		</form>
	</BottomSheet>
{/if}

<!-- Delete — owner/co_owner only (items.pb.js delete gate). Irreversible, so it
     confirms in its own sheet. -->
{#if canDelete}
	<BottomSheet bind:open={deleteOpen} title="Delete this {typeLabel}?">
		<form
			method="POST"
			action="{itemUrl}?/delete"
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
			class="space-y-4"
		>
			<p class="text-ink-soft text-sm">
				{#if docCount > 0}
					Delete this {typeLabel} and its {docCount} document{docCount === 1 ? '' : 's'}? This
					can't be undone.
				{:else}
					Delete this {typeLabel}? This can't be undone.
				{/if}
			</p>
			{#if deleteError || form?.deleteError}
				<p role="alert" class="text-clay text-sm">{deleteError || form?.deleteError}</p>
			{/if}
			<div class="flex gap-2">
				<button
					type="submit"
					disabled={deleting}
					class="min-h-11 bg-clay text-paper hover:bg-clay/90 active:bg-clay/90 flex-1 rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-40"
				>
					{deleting ? 'Deleting…' : 'Delete'}
				</button>
				<Button
					type="button"
					variant="outline"
					size="md"
					class="min-h-11 flex-1"
					onclick={() => (deleteOpen = false)}
				>
					Cancel
				</Button>
			</div>
		</form>
	</BottomSheet>
{/if}
