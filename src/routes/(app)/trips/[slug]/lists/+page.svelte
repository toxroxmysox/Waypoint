<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import NavBar from '$lib/ui/NavBar.svelte';
	import SubTabs from '$lib/ui/SubTabs.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import BottomSheet from '$lib/ui/BottomSheet.svelte';
	import ListIndexRow from '$lib/itinerary/components/ListIndexRow.svelte';
	import AutoChip from '$lib/itinerary/components/AutoChip.svelte';
	import { memberDisplayName, memberInitial } from '$lib/itinerary/member-name';
	import type { Phase } from '$lib/types';

	let { data, form } = $props();

	let createOpen = $state(false);
	let creating = $state(false);

	const listsBase = $derived(`/trips/${data.trip.slug}/lists`);

	function phaseName(phaseId: string): string | null {
		return data.phases.find((p: Phase) => p.id === phaseId)?.name ?? null;
	}

	function assigneesFor(ids: string[]) {
		return ids.map((id) => {
			const m = data.members.find((x) => x.id === id);
			return { initial: memberInitial(m), name: memberDisplayName(m), img: m?.avatarUrl ?? '' };
		});
	}
</script>

<NavBar
	title={data.trip.title}
	subtitle={data.trip.location_summary || undefined}
	subtitleStyle="tagline"
	back
	backHref="/trips/{data.trip.slug}"
/>
<SubTabs
	tabs={[
		{ id: 'overview', label: 'Overview', href: `/trips/${data.trip.slug}` },
		{ id: 'phases', label: 'Phases', href: `/trips/${data.trip.slug}/phases` },
		{ id: 'lists', label: 'Lists', href: `/trips/${data.trip.slug}/lists` },
		{ id: 'goals', label: 'Goals', href: `/trips/${data.trip.slug}/goals` }
	]}
/>

<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-8 md-desktop:max-w-2xl">
	<div class="mb-3 flex items-baseline justify-between px-0.5">
		<h1 class="font-display text-[22px] font-semibold text-ink">Lists</h1>
		<span class="text-[11.5px] font-medium text-ink-muted">
			{data.lists.length} list{data.lists.length === 1 ? '' : 's'}
		</span>
	</div>

	<Card>
		<!-- Booking smart list — pinned first, system-maintained (content lands in #50) -->
		<a
			href="{listsBase}/booking"
			class="flex items-center gap-3 border-b border-l-[3px] border-gold border-line bg-gold-tint px-[15px] py-[13px]"
		>
			<span
				class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold bg-gold-tint"
			>
				<svg width="13" height="13" viewBox="0 0 20 20" fill="none">
					<path d="M10 2L11.5 7L16 8L11.5 9L10 14L8.5 9L4 8L8.5 7L10 2z" fill="var(--color-gold)" />
				</svg>
			</span>
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<span class="text-[14.5px] font-semibold text-ink">Booking</span>
					<AutoChip />
				</div>
				<div class="mt-0.5 text-[11px] text-gold-deep">Auto · from your itinerary</div>
			</div>
			<span class="shrink-0 font-mono text-xs font-semibold text-gold-deep tabular-nums">
				{data.bookingCount} left
			</span>
		</a>

		<!-- Flights smart list (#225) — read-only chronological lens, sibling to Booking -->
		<a
			href="{listsBase}/flights"
			class="border-l-[3px] border-sky bg-sky-tint {data.lists.length > 0
				? 'border-b border-line'
				: ''} flex items-center gap-3 px-[15px] py-[13px]"
		>
			<span
				class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-sky bg-sky-tint"
			>
				<svg width="13" height="13" viewBox="0 0 20 20" fill="none">
					<path
						d="M2 11l16-6-5 13-2.5-5L2 11z"
						stroke="var(--color-sky)"
						stroke-width="1.6"
						stroke-linejoin="round"
					/>
				</svg>
			</span>
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<span class="text-[14.5px] font-semibold text-ink">Flights</span>
					<AutoChip />
				</div>
				<div class="mt-0.5 text-[11px] text-sky">Auto · read-only · in departure order</div>
			</div>
			<span class="shrink-0 font-mono text-xs font-semibold text-sky tabular-nums">
				{data.flightsCount} flight{data.flightsCount === 1 ? '' : 's'}
			</span>
		</a>

		{#each data.lists as l, i (l.id)}
			<ListIndexRow
				title={l.title}
				phaseName={l.phase ? phaseName(l.phase) : null}
				done={l.done}
				total={l.total}
				assignees={assigneesFor(l.assigneeIds)}
				href="{listsBase}/{l.id}"
				divider={i < data.lists.length - 1}
			/>
		{/each}
	</Card>

	<button
		type="button"
		onclick={() => (createOpen = true)}
		class="mt-2.5 flex w-full items-center gap-2.5 rounded-[14px] border-[1.5px] border-dashed border-line px-[15px] py-3 text-moss"
	>
		<span
			class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-moss text-moss"
		>
			<svg width="13" height="13" viewBox="0 0 14 14" fill="none">
				<path
					d="M7 2.5v9M2.5 7h9"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
				/>
			</svg>
		</span>
		<span class="text-[13.5px] font-semibold">New list</span>
	</button>

	{#if data.lists.length === 0}
		<p class="mt-6 px-1 font-display text-sm text-ink-muted italic">
			No lists yet. Make one, or let Waypoint track your bookings.
		</p>
	{/if}
</main>

<BottomSheet bind:open={createOpen} title="New list">
	{#if form?.error}
		<p class="mb-3 text-sm text-error">{form.error}</p>
	{/if}
	<form
		method="POST"
		action="?/create"
		use:enhance={() => {
			creating = true;
			return async ({ result, update }) => {
				creating = false;
				if (result.type === 'success' && result.data?.listId) {
					createOpen = false;
					await goto(`${listsBase}/${result.data.listId}`);
				} else {
					await update();
				}
			};
		}}
		class="space-y-3"
	>
		<div>
			<label for="list_title" class="block text-sm font-medium text-ink-soft">Name</label>
			<input
				id="list_title"
				name="title"
				type="text"
				required
				placeholder="Packing, Groceries, Before we fly…"
				class="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
			/>
		</div>
		<div>
			<label for="list_scope" class="block text-sm font-medium text-ink-soft">Scope</label>
			<select
				id="list_scope"
				name="scope"
				class="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
			>
				<option value="trip">Whole trip</option>
				{#each data.phases as p (p.id)}
					<option value={p.id}>{p.name}</option>
				{/each}
			</select>
		</div>
		<Button type="submit" variant="moss" size="md" class="w-full" disabled={creating}>
			{creating ? 'Creating…' : 'Create list'}
		</Button>
	</form>
</BottomSheet>
