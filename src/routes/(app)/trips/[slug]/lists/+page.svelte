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
	import type { Phase, TripMember } from '$lib/types';

	let { data, form } = $props();

	let createOpen = $state(false);
	let creating = $state(false);

	const listsBase = $derived(`/trips/${data.trip.slug}/lists`);

	function phaseName(phaseId: string): string | null {
		return data.phases.find((p: Phase) => p.id === phaseId)?.name ?? null;
	}

	function assigneesFor(ids: string[]) {
		return ids.map((id) => {
			const m = data.members.find((x: TripMember) => x.id === id);
			return { initial: memberInitial(m), name: memberDisplayName(m) };
		});
	}
</script>

<NavBar
	title={data.trip.title}
	subtitle={data.trip.location_summary || undefined}
	subtitleStyle="tagline"
	back
	backHref="/trips"
/>
<SubTabs
	tabs={[
		{ id: 'overview', label: 'Overview', href: `/trips/${data.trip.slug}` },
		{ id: 'phases', label: 'Phases', href: `/trips/${data.trip.slug}/phases` },
		{ id: 'lists', label: 'Lists', href: `/trips/${data.trip.slug}/lists` }
	]}
/>

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8">
	<div class="mb-3 flex items-baseline justify-between px-0.5">
		<h1 class="font-display text-ink text-[22px] font-semibold">Lists</h1>
		<span class="text-ink-muted text-[11.5px] font-medium">
			{data.lists.length} list{data.lists.length === 1 ? '' : 's'}
		</span>
	</div>

	<Card>
		<!-- Booking smart list — pinned first, system-maintained (content lands in #50) -->
		<a
			href="{listsBase}/booking"
			class="border-gold border-l-[3px] {data.lists.length > 0 ? 'border-line border-b' : ''} flex items-center gap-3 bg-[rgba(200,155,60,0.07)] px-[15px] py-[13px]"
		>
			<span class="border-gold bg-gold-tint flex h-7 w-7 shrink-0 items-center justify-center rounded-full border">
				<svg width="13" height="13" viewBox="0 0 20 20" fill="none">
					<path d="M10 2L11.5 7L16 8L11.5 9L10 14L8.5 9L4 8L8.5 7L10 2z" fill="var(--color-gold)" />
				</svg>
			</span>
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<span class="text-ink text-[14.5px] font-semibold">Booking</span>
					<AutoChip />
				</div>
				<div class="text-gold-deep mt-0.5 text-[11px]">Auto · from your itinerary</div>
			</div>
			<span class="text-gold-deep shrink-0 font-mono text-xs font-semibold tabular-nums">
				{data.bookingCount} left
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
		class="border-line text-moss mt-2.5 flex w-full items-center gap-2.5 rounded-[14px] border-[1.5px] border-dashed px-[15px] py-3"
	>
		<span class="border-moss text-moss flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed">
			<svg width="13" height="13" viewBox="0 0 14 14" fill="none">
				<path d="M7 2.5v9M2.5 7h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
			</svg>
		</span>
		<span class="text-[13.5px] font-semibold">New list</span>
	</button>

	{#if data.lists.length === 0}
		<p class="text-ink-muted font-display mt-6 px-1 text-sm italic">
			No lists yet. Make one, or let Waypoint track your bookings.
		</p>
	{/if}
</main>

<BottomSheet bind:open={createOpen} title="New list">
	{#if form?.error}
		<p class="text-clay mb-3 text-sm">{form.error}</p>
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
			<label for="list_title" class="text-ink-soft block text-sm font-medium">Name</label>
			<input
				id="list_title"
				name="title"
				type="text"
				required
				placeholder="Packing, Groceries, Before we fly…"
				class="border-line bg-surface text-ink mt-1 w-full rounded-md border px-3 py-2 text-sm"
			/>
		</div>
		<div>
			<label for="list_scope" class="text-ink-soft block text-sm font-medium">Scope</label>
			<select
				id="list_scope"
				name="scope"
				class="border-line bg-surface text-ink mt-1 w-full rounded-md border px-3 py-2 text-sm"
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
