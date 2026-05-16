<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import type { Day, Phase, Slot } from '$lib/types';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let {
		open = $bindable(false),
		days = [] as Day[],
		phases = [] as Phase[],
		currentDay = '',
		currentSlot = 'anytime' as Slot,
		currentPhase = '',
		actionUrl = ''
	}: {
		open?: boolean;
		days?: Day[];
		phases?: Phase[];
		currentDay?: string;
		currentSlot?: Slot;
		currentPhase?: string;
		actionUrl?: string;
	} = $props();

	let selectedDay = $state(untrack(() => currentDay));
	let selectedSlot = $state<Slot>(untrack(() => currentSlot));
	let selectedPhase = $state(untrack(() => currentPhase));
	let submitting = $state(false);

	const slotOptions: { id: Slot; label: string }[] = [
		{ id: 'morning', label: 'Morning' },
		{ id: 'afternoon', label: 'Afternoon' },
		{ id: 'evening', label: 'Evening' },
		{ id: 'anytime', label: 'Anytime' }
	];

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
			selectedSlot = currentSlot;
			selectedPhase = currentPhase;
		}
	});
</script>

<BottomSheet bind:open title="Move Item">
	<form
		method="POST"
		action="{actionUrl}?/moveItem"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				submitting = false;
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

		<div>
			<label for="move-slot" class="text-ink-soft block text-sm font-medium">Time slot</label>
			<select
				id="move-slot"
				name="slot"
				bind:value={selectedSlot}
				class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
			>
				{#each slotOptions as s}
					<option value={s.id}>{s.label}</option>
				{/each}
			</select>
		</div>

		{#if phases.length > 0}
			<div>
				<label for="move-phase" class="text-ink-soft block text-sm font-medium">Phase</label>
				<select
					id="move-phase"
					name="phase"
					bind:value={selectedPhase}
					class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
				>
					<option value="">No phase</option>
					{#each phases as p}
						<option value={p.id}>{p.name}</option>
					{/each}
				</select>
			</div>
		{/if}

		<Button type="submit" disabled={submitting} variant="moss" size="md" class="w-full">
			{submitting ? 'Moving...' : 'Move'}
		</Button>
	</form>
</BottomSheet>
