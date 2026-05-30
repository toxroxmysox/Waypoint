<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import type { Day } from '$lib/types';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import SectionH from '$lib/ui/SectionH.svelte';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import PhaseColorPicker from '$lib/itinerary/components/PhaseColorPicker.svelte';
	import { phasePalette } from '$lib/utils/phase-palette';
	import { toast } from '$lib/shell/stores/toast';
	import { titleCase } from '$lib/shell/format';

	let { data, form } = $props();

	let editing = $state(false);
	let loading = $state(false);
	let error = $derived(form?.error ?? '');
	let editColor = $state(untrack(() => data.phase.color || phasePalette[0].hex));

	const parkingLotItems = $derived(data.phaseItems.filter((it) => it.parking_lot_scope === 'phase'));

	function dayLabel(d: Day): string {
		return new Date(d.date.replace(' ', 'T')).toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}

	function daysNightsLabel(start: string, end: string): string {
		const s = new Date(start.substring(0, 10) + 'T00:00:00.000Z');
		const e = new Date(end.substring(0, 10) + 'T00:00:00.000Z');
		const days = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
		if (days <= 1) return '1 day';
		return `${days} days · ${days - 1} night${days - 1 === 1 ? '' : 's'}`;
	}
</script>

<NavBar title={data.phase.name} subtitle={data.trip.title} back backHref="/trips/{data.trip.slug}/phases" />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8 space-y-4">
	{#if error}
		<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">{error}</div>
	{/if}

	<Card accent={data.phase.color}>
		<div class="p-4">
			<div class="flex items-start justify-between gap-2">
				<h2 class="font-display text-ink text-lg leading-tight font-semibold">{data.phase.name}</h2>
				<Button onclick={() => (editing = !editing)} variant="ghost" size="sm">
					{editing ? 'Cancel' : 'Edit'}
				</Button>
			</div>
			{#if data.phase.location}
				<p class="text-ink-soft mt-1 text-sm">{data.phase.location}</p>
			{/if}
			<p class="text-ink-muted font-mono mt-1 text-[11.5px]">
				{new Date(data.phase.start_date.replace(' ', 'T')).toLocaleDateString('en-US', {
					month: 'short',
					day: 'numeric',
					timeZone: 'UTC'
				})}
				–
				{new Date(data.phase.end_date.replace(' ', 'T')).toLocaleDateString('en-US', {
					month: 'short',
					day: 'numeric',
					year: 'numeric',
					timeZone: 'UTC'
				})}
				<span class="text-line">·</span>
				{daysNightsLabel(data.phase.start_date, data.phase.end_date)}
			</p>
		</div>
	</Card>

	{#if editing}
		<Card>
			<form
				method="POST"
				action="?/update"
				use:enhance={() => {
					loading = true;
					return async ({ result, update }) => {
						loading = false;
						if (result.type === 'success') {
							editing = false;
							toast.show('Phase updated');
						}
						await update();
					};
				}}
				class="p-4 space-y-3"
			>
				<div>
					<label for="name" class="text-ink-soft block text-sm font-medium">Name</label>
					<input
						type="text"
						id="name"
						name="name"
						required
						value={data.phase.name}
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					/>
				</div>

				<div>
					<label for="location" class="text-ink-soft block text-sm font-medium">Location</label>
					<input
						type="text"
						id="location"
						name="location"
						value={data.phase.location}
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					/>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="min-w-0">
						<label for="start_date" class="text-ink-soft block text-sm font-medium">Start</label>
						<input
							type="date"
							id="start_date"
							name="start_date"
							required
							value={data.phase.start_date.split('T')[0].split(' ')[0]}
							class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-3 py-2 text-sm"
						/>
					</div>
					<div class="min-w-0">
						<label for="end_date" class="text-ink-soft block text-sm font-medium">End</label>
						<input
							type="date"
							id="end_date"
							name="end_date"
							required
							value={data.phase.end_date.split('T')[0].split(' ')[0]}
							class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-3 py-2 text-sm"
						/>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<label for="country_code" class="text-ink-soft block text-sm font-medium">Country</label>
						<input
							type="text"
							id="country_code"
							name="country_code"
							maxlength="2"
							value={data.phase.country_code}
							class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm uppercase"
						/>
					</div>
					<PhaseColorPicker bind:value={editColor} />
				</div>

				<Button type="submit" disabled={loading} loading={loading} variant="moss" size="md" class="w-full">
					{loading ? 'Saving…' : 'Save changes'}
				</Button>
			</form>
		</Card>
	{/if}

	{#if parkingLotItems.length > 0}
		<section class="space-y-1.5">
			<SectionH>Parking lot ({parkingLotItems.length})</SectionH>
			{#each parkingLotItems as item (item.id)}
				<Card href="/trips/{data.trip.slug}/items/{item.id}">
					<div class="flex items-center gap-3 px-3 py-2">
						<TypeIcon type={item.type} size={18} />
						<div class="min-w-0 flex-1">
							<p class="text-ink truncate text-sm">{item.title}</p>
						</div>
						<span class="bg-paper text-ink-muted shrink-0 rounded px-1.5 py-0.5 text-[11px]">
							{titleCase(item.type)}
						</span>
					</div>
				</Card>
			{/each}
		</section>
	{/if}

	<section class="space-y-1.5">
		<SectionH>Days ({data.phaseDays.length})</SectionH>
		{#if data.phaseDays.length === 0}
			<p class="text-ink-muted text-sm italic">No days fall within this phase's date range.</p>
		{:else}
			<div class="space-y-1">
				{#each data.phaseDays as day}
					{@const dayItems = data.phaseItems.filter((it) => it.day === day.id)}
					<Card href="/trips/{data.trip.slug}/days/{day.id}">
						<div class="flex items-center justify-between px-3 py-2">
							<span class="text-ink text-sm">{dayLabel(day)}</span>
							{#if dayItems.length > 0}
								<span class="text-ink-muted font-mono text-[11.5px]">{dayItems.length} items</span>
							{/if}
						</div>
					</Card>
				{/each}
			</div>
		{/if}
	</section>
</main>
