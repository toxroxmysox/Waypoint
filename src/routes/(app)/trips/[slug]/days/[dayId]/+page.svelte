<script lang="ts">
	import { enhance } from '$app/forms';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import Button from '$lib/ui/Button.svelte';
	import SectionH from '$lib/ui/SectionH.svelte';
	import FAB from '$lib/shell/components/FAB.svelte';
	import { toast } from '$lib/shell/stores/toast';
	import DayNav from '$lib/shell/components/DayNav.svelte';
	import PhaseChip from '$lib/ui/PhaseChip.svelte';
	import DayTimeline from '$lib/itinerary/components/DayTimeline.svelte';
	import ParkingLotSection from '$lib/itinerary/components/ParkingLotSection.svelte';
	import DragDropTimeline from '$lib/itinerary/components/DragDropTimeline.svelte';
	import MultiDayBanner from '$lib/itinerary/components/MultiDayBanner.svelte';

	let { data, form } = $props();

	let editingNotes = $state(false);
	let notesLoading = $state(false);
	let error = $derived(form?.error ?? '');

	function dayLabel(): string {
		return new Date(data.day.date.replace(' ', 'T')).toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}

	function shortDayLabel(): string {
		return new Date(data.day.date.replace(' ', 'T')).toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}

	let backHref = $derived(
		data.dayPhases.length > 0
			? `/trips/${data.trip.slug}/phases/${data.dayPhases[0].id}`
			: `/trips/${data.trip.slug}`
	);
</script>

<NavBar title={shortDayLabel()} subtitle={data.trip.title} back {backHref} />
<DayNav days={data.days} currentDayId={data.day.id} tripSlug={data.trip.slug} />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-24 space-y-4">
	<div>
		<h2 class="font-display text-ink text-xl leading-tight font-semibold">{dayLabel()}</h2>
		{#if data.dayPhases.length > 0}
			<div class="mt-1 flex flex-wrap items-center gap-2">
				{#each data.dayPhases as p, idx}
					<div class="flex items-center gap-1.5">
						<PhaseChip name={p.name} size={18} />
						<span class="text-ink-soft text-sm">{p.name}</span>
					</div>
					{#if idx < data.dayPhases.length - 1}
						<svg class="text-line h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
						</svg>
					{/if}
				{/each}
				{#if data.dayPhases.length > 1}
					<Pill variant="info" size="sm">Travel day</Pill>
				{/if}
			</div>
		{/if}
	</div>

	{#if error}
		<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">{error}</div>
	{/if}

	<!-- Day notes -->
	<Card>
		<div class="p-3">
			<div class="flex items-center justify-between">
				<h3 class="text-moss text-[11px] font-bold tracking-[0.2em] uppercase">Notes</h3>
				<button
					type="button"
					onclick={() => (editingNotes = !editingNotes)}
					class="text-ink-muted hover:text-ink-soft text-xs"
				>
					{editingNotes ? 'Cancel' : 'Edit'}
				</button>
			</div>
			{#if editingNotes}
				<form
					method="POST"
					action="?/updateNotes"
					use:enhance={() => {
						notesLoading = true;
						return async ({ result, update }) => {
							notesLoading = false;
							if (result.type === 'success') {
								editingNotes = false;
								toast.show('Notes saved');
							}
							await update();
						};
					}}
					class="mt-2"
				>
					<textarea
						name="notes"
						rows="3"
						class="border-line bg-surface text-ink block w-full rounded-md border px-3 py-2 text-sm"
					>{data.day.notes}</textarea>
					<Button type="submit" disabled={notesLoading} loading={notesLoading} variant="primary" size="sm" class="mt-2">
						{notesLoading ? 'Saving…' : 'Save'}
					</Button>
				</form>
			{:else if data.day.notes}
				<p class="text-ink-soft mt-1 text-sm whitespace-pre-wrap">{data.day.notes}</p>
			{:else}
				<p class="text-ink-muted mt-1 text-xs italic">No notes for this day.</p>
			{/if}
		</div>
	</Card>

	{#if data.spanningItems.length > 0}
		<div class="space-y-2">
			{#each data.spanningItems as item (item.id)}
				<MultiDayBanner
					{item}
					days={data.allDays}
					dayDate={data.day.date.split(/[T ]/)[0]}
					tripSlug={data.trip.slug}
				/>
			{/each}
		</div>
	{/if}

	<DragDropTimeline
		dayItems={data.dayItems}
		parkingLotItems={data.parkingLotItems}
		tripSlug={data.trip.slug}
		dayId={data.day.id}
	>
		{#snippet children({ draggedItemId, onDragStart, onDragOver, onDropTimeline, onDropParking, onDragEnd })}
			<!-- Items -->
			<section class="space-y-1.5">
				<SectionH>
					{#snippet right()}
						<a
							href="/trips/{data.trip.slug}/items/new?day={data.day.id}"
							class="text-ink-muted hover:text-ink-soft"
							aria-label="Add item"
						>
							+ Add
						</a>
					{/snippet}
					Items
				</SectionH>

				<DayTimeline
					items={data.dayItems}
					tripSlug={data.trip.slug}
					dayId={data.day.id}
					votesByItem={data.votesByItem}
					members={data.members}
					{draggedItemId}
					{onDragStart}
					{onDragOver}
					{onDropTimeline}
					{onDragEnd}
				/>
			</section>

			<!-- Parking lot (mobile) -->
			{#if data.parkingLotItems && data.parkingLotItems.length > 0}
				<section
					class="space-y-1.5 lg-desktop:hidden"
					role="none"
					ondragover={(e) => e.preventDefault()}
					ondrop={() => onDropParking()}
				>
					<SectionH>Ideas</SectionH>
					<ParkingLotSection
						items={data.parkingLotItems}
						phases={data.dayPhases}
						tripSlug={data.trip.slug}
					/>
				</section>
			{/if}
		{/snippet}
	</DragDropTimeline>
</main>

<FAB href="/trips/{data.trip.slug}/items/new?day={data.day.id}" label="Add item" />
