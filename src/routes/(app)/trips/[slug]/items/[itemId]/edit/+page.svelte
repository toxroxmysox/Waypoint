<script lang="ts">
	import { enhance } from '$app/forms';
	import { beforeNavigate } from '$app/navigation';
	import { untrack } from 'svelte';
	import { itemFieldConfig, itemTypeLabels, slotOptions } from '$lib/config/item-fields';
	import type { ConfirmationCode } from '$lib/types';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import SectionH from '$lib/components/ui/SectionH.svelte';
	import Pill from '$lib/components/ui/Pill.svelte';
	import PlacesAutocomplete from '$lib/components/PlacesAutocomplete.svelte';
	import FlightLookup from '$lib/components/FlightLookup.svelte';
	import { titleCase } from '$lib/utils/format';

	let { data, form } = $props();

	let dirty = $state(false);
	let submitting = $state(false);

	function markDirty() { dirty = true; }

	beforeNavigate(({ cancel }) => {
		if (dirty && !submitting && !confirm('You have unsaved changes. Leave anyway?')) cancel();
	});

	$effect(() => {
		if (!dirty) return;
		const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	});

	let loading = $state(false);
	let deleting = $state(false);
	let confirmDelete = $state(false);
	let error = $derived(form?.error ?? '');

	let fields = $derived(itemFieldConfig[data.item.type]);

	let selectedSubtype = $state(untrack(() => data.item.subtype ?? ''));
	let locationCoords = $state(
		untrack(() =>
			data.item.location_coords ? JSON.stringify(data.item.location_coords) : ''
		)
	);
	let googlePlaceId = $state(untrack(() => data.item.google_place_id ?? ''));

	function handlePlaceSelect(place: {
		name: string;
		address: string;
		coords: { lat: number; lng: number };
		placeId: string;
	}) {
		const nameInput = document.getElementById('location_name') as HTMLInputElement;
		const addrInput = document.getElementById('location_address') as HTMLInputElement;
		if (nameInput) nameInput.value = place.name;
		if (addrInput) addrInput.value = place.address;
		locationCoords = JSON.stringify(place.coords);
		googlePlaceId = place.placeId;
		markDirty();
	}

	function handleFlightSelect(flight: {
		title: string;
		start_time: string;
		end_time: string;
		start_tz: string;
		end_tz: string;
		location_name: string;
		description: string;
	}) {
		const titleInput = document.getElementById('title') as HTMLInputElement;
		const descInput = document.getElementById('description') as HTMLTextAreaElement;
		const startInput = document.getElementById('start_time') as HTMLInputElement;
		const endInput = document.getElementById('end_time') as HTMLInputElement;
		const locInput = document.getElementById('location_name') as HTMLInputElement;
		if (titleInput) titleInput.value = flight.title;
		if (descInput) descInput.value = flight.description;
		if (startInput) startInput.value = flight.start_time;
		if (endInput) endInput.value = flight.end_time;
		if (locInput) locInput.value = flight.location_name;
		markDirty();
	}

	let confirmationCodes = $state<ConfirmationCode[]>(
		untrack(() => {
			const existing = data.item.confirmation_codes;
			return existing && existing.length > 0 ? [...existing] : [];
		})
	);

	function addCode() {
		confirmationCodes = [...confirmationCodes, { label: '', value: '' }];
	}

	function removeCode(index: number) {
		confirmationCodes = confirmationCodes.filter((_, i) => i !== index);
	}

	function normalizeUrl(e: FocusEvent) {
		const el = e.currentTarget as HTMLInputElement;
		const v = el.value.trim();
		if (v && !/^https?:\/\//i.test(v)) {
			el.value = `https://${v}`;
		}
	}
</script>

<NavBar
	title="Edit"
	subtitle={data.item.title}
	back
	backHref="/trips/{data.trip.slug}/items/{data.item.id}"
/>

<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-8 space-y-4">
	{#if error}
		<div class="border-clay/30 bg-clay/10 text-clay rounded-md border p-3 text-sm">{error}</div>
	{/if}

	<form
		method="POST"
		action="?/update"
		oninput={markDirty}
		use:enhance={() => {
			loading = true;
			submitting = true;
			return async ({ update }) => {
				loading = false;
				submitting = false;
				await update();
			};
		}}
		class="space-y-4"
	>
		<Card>
			<div class="p-4 space-y-4">
				<!-- Read-only Type display: a styled <div>, not a label, since type can't be changed here -->
				<div>
					<div class="text-ink-soft text-sm font-medium">Type</div>
					<div class="mt-1">
						<Pill variant="default" size="md">{itemTypeLabels[data.item.type]}</Pill>
					</div>
				</div>

				{#if fields.subtype && fields.subtypes.length > 0}
					<div>
						<label for="subtype" class="text-ink-soft block text-sm font-medium">Subtype</label>
						<select
							id="subtype"
							name="subtype"
							bind:value={selectedSubtype}
							class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						>
							<option value="">None</option>
							{#each fields.subtypes as st}
								<option value={st}>{titleCase(st)}</option>
							{/each}
						</select>
					</div>
				{/if}

				{#if data.item.type === 'transportation' && selectedSubtype === 'flight'}
					<div>
						<div class="text-ink-soft text-sm font-medium mb-1">Flight lookup</div>
						<FlightLookup onSelect={handleFlightSelect} />
					</div>
				{/if}

				<div>
					<label for="title" class="text-ink-soft block text-sm font-medium">Title</label>
					<input
						type="text"
						id="title"
						name="title"
						required
						value={data.item.title}
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					/>
				</div>

				<div>
					<label for="description" class="text-ink-soft block text-sm font-medium">Description</label>
					<textarea
						id="description"
						name="description"
						rows="2"
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					>{data.item.description}</textarea>
				</div>

				<div>
					<label for="status" class="text-ink-soft block text-sm font-medium">Status</label>
					<select
						id="status"
						name="status"
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					>
						<option value="planned" selected={data.item.status === 'planned'}>Planned</option>
						<option value="done" selected={data.item.status === 'done'}>Done</option>
					</select>
				</div>
			</div>
		</Card>

		<Card>
			<div class="p-4 space-y-4">
				<SectionH>When</SectionH>
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label for="day" class="text-ink-soft block text-sm font-medium">Day</label>
						<select
							id="day"
							name="day"
							class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						>
							<option value="">Unscheduled</option>
							{#each data.days as d}
								<option value={d.id} selected={d.id === data.item.day}>
									{new Date(d.date.replace(' ', 'T')).toLocaleDateString('en-US', {
										weekday: 'short',
										month: 'short',
										day: 'numeric',
										timeZone: 'UTC'
									})}
								</option>
							{/each}
						</select>
					</div>
					<div>
						<label for="slot" class="text-ink-soft block text-sm font-medium">Slot</label>
						<select
							id="slot"
							name="slot"
							class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						>
							{#each slotOptions as opt}
								<option value={opt.value} selected={data.item.slot === opt.value}
									>{opt.label}</option
								>
							{/each}
						</select>
					</div>
				</div>

				<div>
					<label for="phase" class="text-ink-soft block text-sm font-medium">Phase</label>
					<select
						id="phase"
						name="phase"
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					>
						<option value="">None</option>
						{#each data.phases as p}
							<option value={p.id} selected={p.id === data.item.phase}>{p.name}</option>
						{/each}
					</select>
				</div>

				{#if fields.times}
					<div class="grid grid-cols-2 gap-3">
						<div class="min-w-0">
							<label for="start_time" class="text-ink-soft block text-sm font-medium">Start time</label>
							<input
								type="time"
								id="start_time"
								name="start_time"
								value={data.item.start_time}
								class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-3 py-2 text-sm"
							/>
						</div>
						<div class="min-w-0">
							<label for="end_time" class="text-ink-soft block text-sm font-medium">End time</label>
							<input
								type="time"
								id="end_time"
								name="end_time"
								value={data.item.end_time}
								class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-3 py-2 text-sm"
							/>
						</div>
					</div>
				{/if}
			</div>
		</Card>

		{#if fields.location}
			<Card>
				<div class="p-4 space-y-4">
					<SectionH>Location</SectionH>
					<PlacesAutocomplete onSelect={handlePlaceSelect} />
					<div>
						<label for="location_name" class="text-ink-soft block text-sm font-medium">Name</label>
						<input
							type="text"
							id="location_name"
							name="location_name"
							value={data.item.location_name}
							class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						/>
					</div>
					<div>
						<label for="location_address" class="text-ink-soft block text-sm font-medium">Address</label>
						<input
							type="text"
							id="location_address"
							name="location_address"
							value={data.item.location_address}
							class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						/>
					</div>
					<input type="hidden" name="location_coords" value={locationCoords} />
					<input type="hidden" name="google_place_id" value={googlePlaceId} />
				</div>
			</Card>
		{/if}

		{#if fields.booking}
			<Card>
				<div class="p-4 space-y-3">
					<SectionH>Booking</SectionH>
					<label class="flex items-center gap-2">
						<input
							type="checkbox"
							name="booked"
							checked={data.item.booked}
							class="border-line rounded"
						/>
						<span class="text-ink-soft text-sm">Booked</span>
					</label>
					<div>
						<label for="reservation_url" class="text-ink-soft block text-sm font-medium"
							>Reservation URL</label
						>
						<input
							type="url"
							id="reservation_url"
							name="reservation_url"
							inputmode="url"
							value={data.item.reservation_url}
							onblur={normalizeUrl}
							placeholder="example.com"
							class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						/>
					</div>
					<label class="flex items-center gap-2">
						<input
							type="checkbox"
							name="free_cancellation"
							checked={data.item.free_cancellation}
							class="border-line rounded"
						/>
						<span class="text-ink-soft text-sm">Free cancellation</span>
					</label>
				</div>
			</Card>
		{/if}

		{#if fields.confirmationCodes}
			<Card>
				<div class="p-4 space-y-2">
					<SectionH>
						{#snippet right()}
							<button type="button" onclick={addCode} class="text-ink-muted hover:text-ink-soft">
								+ Add code
							</button>
						{/snippet}
						Confirmation codes
					</SectionH>
					{#each confirmationCodes as code, i}
						<div class="flex gap-2">
							<input
								type="text"
								name="confirmation_code_label"
								placeholder="Label"
								bind:value={code.label}
								class="border-line bg-surface text-ink block w-1/3 rounded-md border px-2 py-1.5 text-sm"
							/>
							<input
								type="text"
								name="confirmation_code_value"
								placeholder="Code"
								bind:value={code.value}
								class="border-line bg-surface text-ink font-mono block flex-1 rounded-md border px-2 py-1.5 text-sm"
							/>
							<button
								type="button"
								aria-label="Remove confirmation code"
								onclick={() => removeCode(i)}
								class="text-ink-muted hover:text-clay"
							>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<path d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						</div>
					{/each}
				</div>
			</Card>
		{/if}

		{#if fields.costs}
			<Card>
				<div class="p-4">
					<SectionH>Costs</SectionH>
					<div class="mt-2 grid grid-cols-2 gap-3">
						<div>
							<label for="cost_estimate_usd" class="text-ink-soft block text-sm font-medium"
								>Estimate (USD)</label
							>
							<input
								type="number"
								id="cost_estimate_usd"
								name="cost_estimate_usd"
								step="0.01"
								min="0"
								value={data.item.cost_estimate_usd || ''}
								class="border-line bg-surface text-ink font-mono mt-1 block w-full rounded-md border px-3 py-2 text-sm"
							/>
						</div>
						<div>
							<label for="cost_actual_usd" class="text-ink-soft block text-sm font-medium"
								>Actual (USD)</label
							>
							<input
								type="number"
								id="cost_actual_usd"
								name="cost_actual_usd"
								step="0.01"
								min="0"
								value={data.item.cost_actual_usd || ''}
								class="border-line bg-surface text-ink font-mono mt-1 block w-full rounded-md border px-3 py-2 text-sm"
							/>
						</div>
					</div>
				</div>
			</Card>
		{/if}

		{#if data.members.length > 1}
			<Card>
				<div class="p-4">
					<fieldset>
						<legend class="text-moss text-[11px] font-bold tracking-[0.2em] uppercase">Assigned to</legend>
						<div class="mt-2 space-y-1">
							{#each data.members as member}
								<label class="flex items-center gap-2">
									<input
										type="checkbox"
										name="assigned_to"
										value={member.id}
										checked={data.item.assigned_to.includes(member.id)}
										class="border-line rounded"
									/>
									<span class="text-ink-soft text-sm">
										{member.display_name ||
											member.expand?.user?.name ||
											member.expand?.user?.email ||
											member.placeholder_name ||
											'Unknown'}
									</span>
								</label>
							{/each}
						</div>
					</fieldset>
				</div>
			</Card>
		{/if}

		<Button type="submit" disabled={loading} variant="moss" size="lg" class="w-full">
			{loading ? 'Saving…' : 'Save changes'}
		</Button>
	</form>

	<div class="border-clay/30 rounded-lg border p-4">
		<h3 class="text-clay text-sm font-semibold">Delete item</h3>
		{#if !confirmDelete}
			<button
				type="button"
				onclick={() => (confirmDelete = true)}
				class="border-clay/40 text-clay hover:bg-clay/10 mt-2 rounded-md border px-3 py-1.5 text-sm font-semibold"
			>
				Delete
			</button>
		{:else}
			<form
				method="POST"
				action="?/delete"
				use:enhance={() => {
					deleting = true;
					return async ({ update }) => {
						deleting = false;
						await update();
					};
				}}
				class="mt-2 flex items-center gap-2"
			>
				<button
					type="submit"
					disabled={deleting}
					class="bg-clay text-paper hover:bg-clay/90 rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
				>
					{deleting ? 'Deleting…' : 'Confirm delete'}
				</button>
				<button
					type="button"
					onclick={() => (confirmDelete = false)}
					class="text-ink-muted hover:text-ink-soft text-sm"
				>
					Cancel
				</button>
			</form>
		{/if}
	</div>
</main>
