<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Item, Slot } from '$lib/types';

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
			year: 'numeric',
			timeZone: 'UTC'
		});
	}

	function titleCase(s: string): string {
		return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}

	const typeIcons: Record<string, string> = {
		lodging: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
		transportation:
			'M8 7h8m-8 5h8m-4-10v2m0 12v2m-5-6H3m18 0h-2M6.343 6.343l1.414 1.414m8.486 8.486l1.414 1.414M6.343 17.657l1.414-1.414m8.486-8.486l1.414-1.414',
		activity: 'M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
		meal: 'M12 6v6m0 0v6m0-6h6m-6 0H6',
		note: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
		checklist: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4'
	};
</script>

<div class="space-y-4">
	{#if data.dayPhases.length > 0}
		<a
			href="/trips/{data.trip.slug}/phases/{data.dayPhases[0].id}"
			class="text-sm text-slate-500 hover:text-slate-700"
		>
			&larr; {data.dayPhases[0].name}
		</a>
	{:else}
		<a
			href="/trips/{data.trip.slug}"
			class="text-sm text-slate-500 hover:text-slate-700"
		>
			&larr; Trip overview
		</a>
	{/if}

	<div class="flex items-start justify-between">
		<div>
			<h2 class="text-lg font-semibold text-slate-900">{dayLabel()}</h2>
			{#if data.dayPhases.length > 0}
				<div class="mt-1 flex flex-wrap items-center gap-2">
					{#each data.dayPhases as p, idx}
						<div class="flex items-center gap-1.5">
							{#if p.color}
								<span
									class="h-2.5 w-2.5 rounded-full"
									style="background-color: {p.color}"
								></span>
							{/if}
							<span class="text-sm text-slate-500">{p.name}</span>
						</div>
						{#if idx < data.dayPhases.length - 1}
							<svg class="h-3 w-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
							</svg>
						{/if}
					{/each}
					{#if data.dayPhases.length > 1}
						<span class="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
							Travel day
						</span>
					{/if}
				</div>
			{/if}
		</div>
		<a
			href="/trips/{data.trip.slug}/items/new?day={data.day.id}"
			class="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
		>
			Add Item
		</a>
	</div>

	{#if error}
		<div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
	{/if}

	<!-- Day notes -->
	<div class="rounded-lg border border-slate-200 bg-white p-3">
		<div class="flex items-center justify-between">
			<h3 class="text-xs font-medium text-slate-500 uppercase">Notes</h3>
			<button
				type="button"
				onclick={() => (editingNotes = !editingNotes)}
				class="text-xs text-slate-400 hover:text-slate-600"
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
						if (result.type === 'success') editingNotes = false;
						await update();
					};
				}}
				class="mt-2"
			>
				<textarea
					name="notes"
					rows="3"
					class="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				>{data.day.notes}</textarea>
				<button
					type="submit"
					disabled={notesLoading}
					class="mt-2 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
				>
					{notesLoading ? 'Saving...' : 'Save'}
				</button>
			</form>
		{:else if data.day.notes}
			<p class="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{data.day.notes}</p>
		{:else}
			<p class="mt-1 text-xs text-slate-400 italic">No notes for this day.</p>
		{/if}
	</div>

	<!-- Slot groups (render all 4 slots always; empty slots show a subtle add-CTA) -->
	{#each slots as slot}
		{@const items = itemsForSlot(slot.id)}
		<section>
			<div class="mb-1.5 flex items-center justify-between">
				<h3 class="text-xs font-medium text-slate-500 uppercase">{slot.label}</h3>
				<a
					href="/trips/{data.trip.slug}/items/new?day={data.day.id}&slot={slot.id}"
					class="text-xs text-slate-400 hover:text-slate-700"
					aria-label="Add item to {slot.label}"
				>
					+ Add
				</a>
			</div>
			{#if items.length > 0}
				<div class="space-y-2">
					{#each items as item}
						<a
							href="/trips/{data.trip.slug}/items/{item.id}"
							class="block rounded-lg border border-slate-200 bg-white p-3"
						>
							<div class="flex items-start gap-2">
								<svg
									class="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="1.5"
									aria-hidden="true"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d={typeIcons[item.type] || typeIcons.note}
									/>
								</svg>
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2">
										<h4 class="text-sm font-medium text-slate-900 truncate">{item.title}</h4>
										{#if item.booked}
											<span class="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
												Booked
											</span>
										{/if}
									</div>
									{#if item.start_time || item.location_name}
										<p class="mt-0.5 text-xs text-slate-500">
											{#if item.start_time}
												{item.start_time}{item.end_time ? ` - ${item.end_time}` : ''}
											{/if}
											{#if item.start_time && item.location_name} &middot; {/if}
											{#if item.location_name}{item.location_name}{/if}
										</p>
									{/if}
									{#if item.subtype}
										<span class="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
											{titleCase(item.subtype)}
										</span>
									{/if}
								</div>
							</div>
						</a>
					{/each}
				</div>
			{:else}
				<a
					href="/trips/{data.trip.slug}/items/new?day={data.day.id}&slot={slot.id}"
					class="block rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400 hover:border-slate-300 hover:text-slate-600"
				>
					No items yet. Tap to add one.
				</a>
			{/if}
		</section>
	{/each}
</div>
