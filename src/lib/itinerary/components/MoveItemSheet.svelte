<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import type { Day, Phase } from '$lib/types';
	import BottomSheet from '$lib/ui/BottomSheet.svelte';
	import Button from '$lib/ui/Button.svelte';
	import { ITEM_ACTION_ERRORS } from '$lib/itinerary/item-actions';

	let {
		open = $bindable(false),
		days = [] as Day[],
		phases = [] as Phase[],
		currentDay = '',
		currentPhase = '',
		actionUrl = '',
		title = 'Move Item'
	}: {
		open?: boolean;
		days?: Day[];
		phases?: Phase[];
		currentDay?: string;
		currentPhase?: string;
		actionUrl?: string;
		title?: string;
	} = $props();

	let selectedDay = $state(untrack(() => currentDay));
	let selectedPhase = $state(untrack(() => currentPhase));
	let submitting = $state(false);
	// #416 — a refused move (or a dropped connection) keeps the sheet open and
	// says so here, where the user acted. It used to close and show nothing.
	let moveError = $state('');

	// #196/#172 — an unscheduled item must keep a phase (every parking surface is
	// phase-scoped). Require a phase when no day is picked and phases exist.
	let phaseRequired = $derived(selectedDay === '' && phases.length > 0);

	function dayLabel(d: Day): string {
		return new Date(d.date.replace(' ', 'T')).toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}

	// Reset selections when sheet opens
	$effect(() => {
		if (open) {
			selectedDay = currentDay;
			selectedPhase = currentPhase;
			moveError = '';
		}
	});
</script>

<BottomSheet bind:open {title}>
	<form
		method="POST"
		action="{actionUrl}?/moveItem"
		use:enhance={() => {
			submitting = true;
			moveError = '';
			return async ({ result, update }) => {
				submitting = false;
				if (result.type !== 'success') {
					moveError = ITEM_ACTION_ERRORS.move;
					return;
				}
				open = false;
				await update();
			};
		}}
		class="space-y-4"
	>
		<div>
			<label for="move-day" class="text-ink-soft block text-sm font-medium">Day</label>
			<select
				id="move-day"
				name="day"
				bind:value={selectedDay}
				class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
			>
				<option value="">No day (unscheduled)</option>
				{#each days as d}
					<option value={d.id}>{dayLabel(d)}</option>
				{/each}
			</select>
		</div>

{#if phases.length > 0}
			<div>
				<label for="move-phase" class="text-ink-soft block text-sm font-medium">
					Phase{#if phaseRequired}<span class="text-clay" aria-hidden="true"> *</span>{/if}
				</label>
				<select
					id="move-phase"
					name="phase"
					bind:value={selectedPhase}
					required={phaseRequired}
					class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
				>
					<option value="">{phaseRequired ? 'Select a phase…' : 'No phase'}</option>
					{#each phases as p}
						<option value={p.id}>{p.name}</option>
					{/each}
				</select>
				{#if phaseRequired}
					<p class="text-ink-muted mt-1 text-xs">
						An unscheduled idea needs a phase to show up in its parking lot.
					</p>
				{/if}
			</div>
		{/if}

		{#if moveError}
			<p role="alert" class="text-clay text-sm">{moveError}</p>
		{/if}

		<Button type="submit" disabled={submitting} variant="moss" size="md" class="w-full">
			{submitting ? 'Moving...' : 'Move'}
		</Button>
	</form>
</BottomSheet>
