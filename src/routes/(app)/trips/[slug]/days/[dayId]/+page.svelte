<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Item, Slot } from '$lib/types';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import Button from '$lib/ui/Button.svelte';
	import SectionH from '$lib/ui/SectionH.svelte';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import FAB from '$lib/shell/components/FAB.svelte';
	import { toast } from '$lib/shell/stores/toast';
	import DayNav from '$lib/shell/components/DayNav.svelte';
	import PhaseChip from '$lib/ui/PhaseChip.svelte';
	import { titleCase, formatTime } from '$lib/shell/format';

	let { data, form } = $props();

	let editingNotes = $state(false);
	let notesLoading = $state(false);
	let error = $derived(form?.error ?? '');

	const slots: { id: Slot; label: string }[] = [
		{ id: 'morning', label: 'Morning' },
		{ id: 'afternoon', label: 'Afternoon' },
		{ id: 'evening', label: 'Evening' },
		{ id: 'anytime', label: 'Anytime' }
	];

	function itemsForSlot(slot: Slot): Item[] {
		return data.dayItems.filter((item: Item) => item.slot === slot);
	}

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
						<PhaseChip name={p.name} color={p.color} size={18} />
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

	<!-- Slot groups -->
	{#each slots as slot}
		{@const items = itemsForSlot(slot.id)}
		<section class="space-y-1.5">
			<SectionH>
				{#snippet right()}
					<a
						href="/trips/{data.trip.slug}/items/new?day={data.day.id}&slot={slot.id}"
						class="text-ink-muted hover:text-ink-soft"
						aria-label="Add item to {slot.label}"
					>
						+ Add
					</a>
				{/snippet}
				{slot.label}
			</SectionH>

			{#if items.length > 0}
				<div class="space-y-2">
					{#each items as item}
						<Card href="/trips/{data.trip.slug}/items/{item.id}">
							<div class="flex items-start gap-3 p-3">
								<TypeIcon type={item.type} sub={item.subtype} size={32} />
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<h4 class="text-ink truncate text-sm font-semibold">{item.title}</h4>
										{#if item.booked}
											<Pill variant="booked" size="sm">Booked</Pill>
										{/if}
										{#if data.voteCounts[item.id]}
											<span class="text-moss inline-flex items-center gap-0.5 text-[11px] font-semibold">
												<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
													<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
													<path d="M1 21h4V10H1z" />
												</svg>
												{data.voteCounts[item.id]}
											</span>
										{/if}
									</div>
									{#if item.start_time || item.location_name}
										<p class="text-ink-muted mt-0.5 text-[12px]">
											{#if item.start_time}
												<span class="font-mono"
													>{formatTime(item.start_time)}{item.end_time
														? ` – ${formatTime(item.end_time)}`
														: ''}</span
												>
											{/if}
											{#if item.start_time && item.location_name}
												<span class="text-line">·</span>
											{/if}
											{#if item.location_name}{item.location_name}{/if}
										</p>
									{/if}
									{#if item.subtype}
										<p class="text-ink-muted mt-1 text-[11px] uppercase tracking-wide">
											{titleCase(item.subtype)}
										</p>
									{/if}
								</div>
							</div>
						</Card>
					{/each}
				</div>
			{:else}
				<a
					href="/trips/{data.trip.slug}/items/new?day={data.day.id}&slot={slot.id}"
					class="border-line text-ink-muted hover:border-ink-muted hover:text-ink-soft block rounded-lg border border-dashed px-3 py-2 text-xs"
				>
					Empty. Tap to add one.
				</a>
			{/if}
		</section>
	{/each}
</main>

<FAB href="/trips/{data.trip.slug}/items/new?day={data.day.id}" label="Add item" />
