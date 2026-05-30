# Extract ItemForm Deep Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract duplicated form logic from `items/new`, `items/[itemId]/edit`, and `items/[itemId]` (view) into a single `ItemForm.svelte` component so each route becomes a thin wrapper.

**Architecture:** ItemForm receives `mode` ("create" | "edit" | "view") and renders the appropriate fields. In create/edit modes it renders an editable `<form>` with SvelteKit form actions; in view mode it renders read-only display. The route page still owns the `<form>` element and `use:enhance` — ItemForm is a controlled component that receives initial data and renders fields. Dirty state tracking, confirmation codes, and external API integration (FlightLookup, PlacesAutocomplete) live inside ItemForm.

**Tech Stack:** SvelteKit, Svelte 5, TypeScript, Tailwind CSS

**GitHub Issue:** [#14](https://github.com/toxroxmysox/Waypoint/issues/14)

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/itinerary/components/ItemForm.svelte` | Unified form/view component for items — field rendering, dirty tracking, confirmation codes, flight/places integration |
| Create | `src/lib/itinerary/components/ItemFormFields.ts` | Shared types: `ItemFormMode`, `ItemFormData`, `ItemFormEvents` |
| Modify | `src/routes/(app)/trips/[slug]/items/new/+page.svelte` | Thin wrapper: passes mode="create", prefill data, handles form action |
| Modify | `src/routes/(app)/trips/[slug]/items/[itemId]/edit/+page.svelte` | Thin wrapper: passes mode="edit", item data, handles form action + delete |
| Modify | `src/routes/(app)/trips/[slug]/items/[itemId]/+page.svelte` | Thin wrapper: passes mode="view", item data, handles view-only features (comments, votes, checklist, alternates) |
| Test | `tests/e2e/` (existing) | Verify existing E2E still passes — no new E2E tests needed since behavior is unchanged |

### Design Decisions

1. **Route owns `<form>` and `use:enhance`.** ItemForm renders the field inputs, but the parent wraps them in a `<form method="POST">` with its own `use:enhance` handler. This avoids ItemForm needing to know about SvelteKit form actions, suggestion paths, or redirect logic.

2. **ItemForm does NOT own the submit button.** Each route has different button labels ("Create item", "Save changes", "Submit suggestion", "Approve with edits") and different surrounding chrome (delete section in edit, sticky footer styling). The parent renders the submit button after `<ItemForm>`.

3. **View mode is a separate rendering path inside ItemForm.** When `mode="view"`, ItemForm renders read-only cards (Schedule, Location, Booking, Costs, Confirmation Codes) instead of editable fields. The detail page (`[itemId]/+page.svelte`) still renders view-specific features (comments, votes, checklist, alternates, promote/demote) outside of ItemForm.

4. **Dirty state lives inside ItemForm.** The component exposes a bindable `dirty` prop so the parent can read it for `beforeNavigate` guards and submit button state. The parent is responsible for the `beforeNavigate` call since it needs `submitting` state that only the parent knows.

---

## Task 1: Define ItemForm types

**Files:**
- Create: `src/lib/itinerary/components/ItemFormFields.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/lib/itinerary/components/ItemFormFields.ts
import type { ItemType, ConfirmationCode, Day, Phase, TripMember } from '$lib/types';
import type { FieldVisibility } from '$lib/itinerary/item-fields';

export type ItemFormMode = 'create' | 'edit' | 'view';

export interface ItemFormData {
	type: ItemType;
	subtype: string;
	title: string;
	description: string;
	day: string;
	slot: string;
	phase: string;
	start_time: string;
	end_time: string;
	location_name: string;
	location_address: string;
	location_coords: unknown;
	google_place_id: string;
	booked: boolean;
	reservation_url: string;
	free_cancellation: boolean;
	cost_estimate_usd: number;
	cost_actual_usd: number;
	confirmation_codes: ConfirmationCode[];
	assigned_to: string[];
	status: string;
}

export interface ItemFormContext {
	days: Day[];
	phases: Phase[];
	members: TripMember[];
	preselectedDay?: string;
	preselectedSlot?: string;
	preselectedPhase?: string;
}

export const emptyItemFormData: ItemFormData = {
	type: 'activity',
	subtype: '',
	title: '',
	description: '',
	day: '',
	slot: 'anytime',
	phase: '',
	start_time: '',
	end_time: '',
	location_name: '',
	location_address: '',
	location_coords: null,
	google_place_id: '',
	booked: false,
	reservation_url: '',
	free_cancellation: false,
	cost_estimate_usd: 0,
	cost_actual_usd: 0,
	confirmation_codes: [],
	assigned_to: [],
	status: 'planned'
};
```

- [ ] **Step 2: Verify no type errors**

Run: `pnpm check`
Expected: 0 errors, 0 warnings

- [ ] **Step 3: Commit**

```bash
git add src/lib/itinerary/components/ItemFormFields.ts
git commit -m "feat(#14): add ItemForm types"
```

---

## Task 2: Create ItemForm component — create/edit mode

**Files:**
- Create: `src/lib/itinerary/components/ItemForm.svelte`

This is the core extraction. The component renders all form fields for create and edit modes. It does NOT render the `<form>` element, submit button, or error banner — the parent handles those.

- [ ] **Step 1: Create the ItemForm component**

```svelte
<!-- src/lib/itinerary/components/ItemForm.svelte -->
<script lang="ts">
	import { itemFieldConfig, itemTypeLabels, slotOptions } from '$lib/itinerary/item-fields';
	import { checklistTemplates } from '$lib/itinerary/checklist-templates';
	import type { ItemType, ConfirmationCode } from '$lib/types';
	import Card from '$lib/ui/Card.svelte';
	import SectionH from '$lib/ui/SectionH.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import PlacesAutocomplete from '$lib/itinerary/components/PlacesAutocomplete.svelte';
	import FlightLookup from '$lib/itinerary/components/FlightLookup.svelte';
	import { titleCase, formatTime } from '$lib/shell/format';
	import PhaseChip from '$lib/ui/PhaseChip.svelte';
	import { untrack } from 'svelte';
	import type { ItemFormMode, ItemFormData, ItemFormContext } from './ItemFormFields';

	interface Props {
		mode: ItemFormMode;
		initialData: ItemFormData;
		context: ItemFormContext;
		dirty?: boolean;
		typeEditable?: boolean;
	}

	let {
		mode,
		initialData,
		context,
		dirty = $bindable(false),
		typeEditable = false
	}: Props = $props();

	function markDirty() { dirty = true; }

	// --- Editable state (create/edit modes) ---
	let selectedType = $state<ItemType>(untrack(() => initialData.type));
	let selectedSubtype = $state(untrack(() => initialData.subtype));
	let fields = $derived(itemFieldConfig[selectedType]);

	let titleValue = $state(untrack(() => initialData.title));
	let descriptionValue = $state(untrack(() => initialData.description));
	let startTimeValue = $state(untrack(() => initialData.start_time));
	let endTimeValue = $state(untrack(() => initialData.end_time));
	let locationNameValue = $state(untrack(() => initialData.location_name));
	let locationAddressValue = $state(untrack(() => initialData.location_address));
	let locationCoords = $state(
		untrack(() => initialData.location_coords ? JSON.stringify(initialData.location_coords) : '')
	);
	let googlePlaceId = $state(untrack(() => initialData.google_place_id));

	function handlePlaceSelect(place: {
		name: string;
		address: string;
		coords: { lat: number; lng: number };
		placeId: string;
	}) {
		locationNameValue = place.name;
		locationAddressValue = place.address;
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
		titleValue = flight.title;
		descriptionValue = flight.description;
		startTimeValue = flight.start_time;
		endTimeValue = flight.end_time;
		locationNameValue = flight.location_name;
		markDirty();
	}

	let confirmationCodes = $state<ConfirmationCode[]>(
		untrack(() =>
			initialData.confirmation_codes.length > 0
				? [...initialData.confirmation_codes]
				: []
		)
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

	// Checklist template picker (create mode only)
	let showTemplatePicker = $state(false);

	function applyTemplate(templateItems: string[]) {
		descriptionValue = templateItems.map((t) => `- [ ] ${t}`).join('\n');
		if (!titleValue) document.getElementById('title')?.focus();
		showTemplatePicker = false;
		markDirty();
	}

	// --- View mode helpers ---
	let itemDay = $derived(
		initialData.day
			? context.days.find((d) => d.id === initialData.day) ?? null
			: null
	);
	let itemPhase = $derived(
		initialData.phase
			? context.phases.find((p) => p.id === initialData.phase) ?? null
			: null
	);
</script>

{#if mode === 'view'}
	<!-- VIEW MODE: read-only display cards -->

	<!-- Schedule -->
	{#if itemDay || itemPhase || (fields.times && initialData.start_time)}
		<Card>
			<div class="p-4 space-y-2">
				<SectionH>Schedule</SectionH>
				{#if itemDay}
					<p class="text-ink text-sm">
						{new Date(itemDay.date.replace(' ', 'T')).toLocaleDateString('en-US', {
							weekday: 'long',
							month: 'long',
							day: 'numeric',
							timeZone: 'UTC'
						})}
						<span class="text-ink-muted">· {titleCase(initialData.slot)}</span>
					</p>
				{/if}
				{#if itemPhase}
					<p class="text-ink-muted flex items-center gap-1.5 text-sm">
						<PhaseChip name={itemPhase.name} color={itemPhase.color} size={16} />
						{itemPhase.name}
					</p>
				{/if}
				{#if fields.times && initialData.start_time}
					<p class="font-mono text-ink text-sm">
						{formatTime(initialData.start_time)}{initialData.end_time
							? ` – ${formatTime(initialData.end_time)}`
							: ''}
					</p>
				{/if}
			</div>
		</Card>
	{/if}

	<!-- Location -->
	{#if fields.location && (initialData.location_name || initialData.location_address)}
		<Card>
			<div class="p-4 space-y-1">
				<SectionH>Location</SectionH>
				{#if initialData.location_name}
					<p class="text-ink text-sm font-semibold">{initialData.location_name}</p>
				{/if}
				{#if initialData.location_address}
					<p class="text-ink-soft text-sm">{initialData.location_address}</p>
				{/if}
			</div>
		</Card>
	{/if}

	<!-- Booking -->
	{#if fields.booking && (initialData.booked || initialData.reservation_url || initialData.confirmation_codes.length > 0)}
		<Card>
			<div class="p-4 space-y-2">
				<SectionH>Booking</SectionH>
				{#if initialData.reservation_url}
					<a
						href={initialData.reservation_url}
						target="_blank"
						rel="noopener"
						class="text-sky block truncate text-sm hover:underline"
					>
						{initialData.reservation_url}
					</a>
				{/if}
				{#if initialData.free_cancellation}
					<p class="text-moss text-xs font-semibold">Free cancellation</p>
				{/if}
				{#if initialData.confirmation_codes.length > 0}
					<div class="space-y-1">
						{#each initialData.confirmation_codes as code}
							<div class="bg-surface-2 flex items-center justify-between rounded px-2 py-1.5">
								<span class="text-ink-muted text-xs uppercase tracking-wide">{code.label}</span>
								<span class="font-mono text-ink text-sm">{code.value}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</Card>
	{/if}

	<!-- Costs -->
	{#if fields.costs && (initialData.cost_estimate_usd || initialData.cost_actual_usd)}
		<Card>
			<div class="p-4">
				<SectionH>Costs</SectionH>
				<div class="mt-2 grid grid-cols-2 gap-4">
					{#if initialData.cost_estimate_usd}
						<div>
							<p class="text-ink-muted text-[11px] uppercase tracking-wide">Estimate</p>
							<p class="font-mono text-ink text-sm font-semibold">
								${initialData.cost_estimate_usd.toFixed(2)}
							</p>
						</div>
					{/if}
					{#if initialData.cost_actual_usd}
						<div>
							<p class="text-ink-muted text-[11px] uppercase tracking-wide">Actual</p>
							<p class="font-mono text-ink text-sm font-semibold">
								${initialData.cost_actual_usd.toFixed(2)}
							</p>
						</div>
					{/if}
				</div>
			</div>
		</Card>
	{/if}

	<!-- Assigned to -->
	{#if initialData.assigned_to.length > 0}
		<Card>
			<div class="p-4">
				<SectionH>Assigned to</SectionH>
				<div class="mt-2 flex flex-wrap gap-2">
					{#each initialData.assigned_to as memberId}
						{@const member = context.members.find((m) => m.id === memberId)}
						<Pill variant="default" size="md">
							{member?.display_name || member?.expand?.user?.name || member?.expand?.user?.email || member?.placeholder_name || 'Unknown'}
						</Pill>
					{/each}
				</div>
			</div>
		</Card>
	{/if}

{:else}
	<!-- CREATE/EDIT MODE: editable form fields -->
	<!-- The parent wraps these in a <form> element -->

	<Card>
		<div class="p-4 space-y-4" oninput={markDirty}>
			{#if typeEditable}
				<!-- Type selector (create mode) -->
				<div>
					<label for="title" class="text-ink-soft block text-sm font-medium">Title</label>
					<input
						type="text"
						id="title"
						name="title"
						required
						autocomplete="off"
						bind:value={titleValue}
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						placeholder="Hotel check-in, Train to Madrid, etc."
					/>
				</div>

				<fieldset>
					<legend class="text-ink-soft block text-sm font-medium">Type</legend>
					<div class="mt-1 flex flex-wrap gap-2">
						{#each Object.entries(itemTypeLabels) as [type, label]}
							{@const active = selectedType === type}
							<button
								type="button"
								aria-pressed={active}
								onclick={() => (selectedType = type as ItemType)}
								class="rounded-full px-3 py-1 text-sm font-semibold border transition-colors
									{active
									? 'bg-ink text-paper border-ink'
									: 'bg-surface text-ink-soft border-line hover:bg-surface-2'}"
							>
								{label}
							</button>
						{/each}
					</div>
					<input type="hidden" name="type" value={selectedType} />
				</fieldset>
			{:else}
				<!-- Read-only type display (edit mode) -->
				<div>
					<div class="text-ink-soft text-sm font-medium">Type</div>
					<div class="mt-1">
						<Pill variant="default" size="md">{itemTypeLabels[initialData.type]}</Pill>
					</div>
				</div>
			{/if}

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

			{#if (typeEditable ? selectedType : initialData.type) === 'transportation' && selectedSubtype === 'flight'}
				<div>
					<div class="text-ink-soft text-sm font-medium mb-1">Flight lookup</div>
					<FlightLookup onSelect={handleFlightSelect} />
				</div>
			{/if}

			{#if !typeEditable}
				<!-- Title field for edit mode (after type display) -->
				<div>
					<label for="title" class="text-ink-soft block text-sm font-medium">Title</label>
					<input
						type="text"
						id="title"
						name="title"
						required
						autocomplete="off"
						bind:value={titleValue}
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					/>
				</div>
			{/if}

			<div>
				<label for="description" class="text-ink-soft block text-sm font-medium">Description</label>
				{#if typeEditable && selectedType === 'checklist' && !showTemplatePicker}
					<button
						type="button"
						onclick={() => (showTemplatePicker = true)}
						class="text-sky mt-1 mb-1 text-xs font-medium hover:underline"
					>
						Start from template
					</button>
				{/if}
				{#if showTemplatePicker}
					<div class="bg-surface-2 border-line mt-1 mb-2 rounded-md border p-3 space-y-2">
						{#each checklistTemplates as tmpl}
							<button
								type="button"
								onclick={() => applyTemplate(tmpl.items)}
								class="border-line hover:bg-surface flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors"
							>
								<div>
									<p class="text-ink font-medium">{tmpl.name}</p>
									<p class="text-ink-muted text-xs">{tmpl.description}</p>
								</div>
							</button>
						{/each}
						<button
							type="button"
							onclick={() => (showTemplatePicker = false)}
							class="text-ink-muted text-xs hover:underline"
						>
							Cancel
						</button>
					</div>
				{/if}
				<textarea
					id="description"
					name="description"
					rows={selectedType === 'checklist' ? 6 : 2}
					bind:value={descriptionValue}
					class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
				></textarea>
			</div>

			{#if mode === 'edit'}
				<div>
					<label for="status" class="text-ink-soft block text-sm font-medium">Status</label>
					<select
						id="status"
						name="status"
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					>
						<option value="planned" selected={initialData.status === 'planned'}>Planned</option>
						<option value="done" selected={initialData.status === 'done'}>Done</option>
					</select>
				</div>
			{/if}
		</div>
	</Card>

	<!-- When -->
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
						{#each context.days as d}
							<option
								value={d.id}
								selected={d.id === (mode === 'create' ? (context.preselectedDay ?? '') : initialData.day)}
							>
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
							<option
								value={opt.value}
								selected={opt.value === (mode === 'create' ? (context.preselectedSlot ?? 'anytime') : initialData.slot)}
							>
								{opt.label}
							</option>
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
					{#each context.phases as p}
						<option
							value={p.id}
							selected={p.id === (mode === 'create' ? (context.preselectedPhase ?? '') : initialData.phase)}
						>
							{p.name}
						</option>
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
							bind:value={startTimeValue}
							class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-3 py-2 text-sm"
						/>
					</div>
					<div class="min-w-0">
						<label for="end_time" class="text-ink-soft block text-sm font-medium">End time</label>
						<input
							type="time"
							id="end_time"
							name="end_time"
							bind:value={endTimeValue}
							class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-3 py-2 text-sm"
						/>
					</div>
				</div>
			{/if}
		</div>
	</Card>

	<!-- Location -->
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
						bind:value={locationNameValue}
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						placeholder="Hotel Barcelona"
					/>
				</div>
				<div>
					<label for="location_address" class="text-ink-soft block text-sm font-medium">Address</label>
					<input
						type="text"
						id="location_address"
						name="location_address"
						bind:value={locationAddressValue}
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					/>
				</div>
				<input type="hidden" name="location_coords" value={locationCoords} />
				<input type="hidden" name="google_place_id" value={googlePlaceId} />
			</div>
		</Card>
	{/if}

	<!-- Booking -->
	{#if fields.booking}
		<Card>
			<div class="p-4 space-y-3">
				<SectionH>Booking</SectionH>
				<label class="flex items-center gap-2">
					<input type="checkbox" name="booked" checked={initialData.booked} class="border-line rounded" />
					<span class="text-ink-soft text-sm">Booked</span>
				</label>
				<div>
					<label for="reservation_url" class="text-ink-soft block text-sm font-medium">Reservation URL</label>
					<input
						type="url"
						id="reservation_url"
						name="reservation_url"
						inputmode="url"
						onblur={normalizeUrl}
						value={initialData.reservation_url}
						placeholder="example.com"
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					/>
				</div>
				<label class="flex items-center gap-2">
					<input type="checkbox" name="free_cancellation" checked={initialData.free_cancellation} class="border-line rounded" />
					<span class="text-ink-soft text-sm">Free cancellation</span>
				</label>
			</div>
		</Card>
	{/if}

	<!-- Confirmation codes -->
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

	<!-- Costs -->
	{#if fields.costs}
		<Card>
			<div class="p-4">
				<SectionH>Costs</SectionH>
				<div class="mt-2 grid grid-cols-2 gap-3">
					<div>
						<label for="cost_estimate_usd" class="text-ink-soft block text-sm font-medium">Estimate (USD)</label>
						<input
							type="number"
							id="cost_estimate_usd"
							name="cost_estimate_usd"
							step="0.01"
							min="0"
							value={initialData.cost_estimate_usd || ''}
							class="border-line bg-surface text-ink font-mono mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						/>
					</div>
					<div>
						<label for="cost_actual_usd" class="text-ink-soft block text-sm font-medium">Actual (USD)</label>
						<input
							type="number"
							id="cost_actual_usd"
							name="cost_actual_usd"
							step="0.01"
							min="0"
							value={initialData.cost_actual_usd || ''}
							class="border-line bg-surface text-ink font-mono mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						/>
					</div>
				</div>
			</div>
		</Card>
	{/if}

	<!-- Assigned to -->
	{#if context.members.length > 1}
		<Card>
			<div class="p-4">
				<fieldset>
					<legend class="text-moss text-[11px] font-bold tracking-[0.2em] uppercase">Assigned to</legend>
					<div class="mt-2 space-y-1">
						{#each context.members as member}
							<label class="flex items-center gap-2">
								<input
									type="checkbox"
									name="assigned_to"
									value={member.id}
									checked={initialData.assigned_to.includes(member.id)}
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
{/if}
```

- [ ] **Step 2: Verify no type errors**

Run: `pnpm check`
Expected: 0 errors, 0 warnings (may have unused-export-let warnings — acceptable)

- [ ] **Step 3: Commit**

```bash
git add src/lib/itinerary/components/ItemForm.svelte
git commit -m "feat(#14): create ItemForm component with create/edit/view modes"
```

---

## Task 3: Rewrite `items/new/+page.svelte` as thin wrapper

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/items/new/+page.svelte`

The entire 535-line file gets replaced with a ~80-line wrapper.

- [ ] **Step 1: Rewrite the create page**

```svelte
<!-- src/routes/(app)/trips/[slug]/items/new/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { validateForm } from '$lib/shell/actions/validate-form';
	import { beforeNavigate } from '$app/navigation';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Button from '$lib/ui/Button.svelte';
	import ItemForm from '$lib/itinerary/components/ItemForm.svelte';
	import { emptyItemFormData } from '$lib/itinerary/components/ItemFormFields';
	import type { ItemFormData } from '$lib/itinerary/components/ItemFormFields';
	import type { ItemType } from '$lib/types';

	let { data, form } = $props();

	let dirty = $state(false);
	let submitting = $state(false);
	let loading = $state(false);
	let error = $derived(form?.error ?? '');

	let submitAsSuggestion = $derived(data.submitAsSuggestion ?? false);
	let prefill = $derived(data.prefill ?? null);
	let suggestionId = $derived((prefill as Record<string, unknown> | null)?._suggestion_id as string ?? '');
	let prefillAuthorName = $derived((prefill as Record<string, unknown> | null)?._author_name as string ?? '');

	let buttonLabel = $derived(
		loading
			? (submitAsSuggestion ? 'Submitting…' : suggestionId ? 'Approving…' : 'Creating…')
			: (submitAsSuggestion ? 'Submit suggestion' : suggestionId ? 'Approve with edits' : 'Create item')
	);

	beforeNavigate(({ cancel }) => {
		if (dirty && !submitting && !confirm('You have unsaved changes. Leave anyway?')) cancel();
	});

	$effect(() => {
		if (!dirty) return;
		const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	});

	let initialData: ItemFormData = $derived({
		...emptyItemFormData,
		type: (prefill?.type as ItemType) ?? 'activity',
		title: (prefill?.title as string) ?? '',
		description: (prefill?.description as string) ?? '',
		start_time: (prefill?.start_time as string) ?? '',
		end_time: (prefill?.end_time as string) ?? '',
		location_name: (prefill?.location_name as string) ?? '',
		location_address: (prefill?.location_address as string) ?? '',
		confirmation_codes: Array.isArray(prefill?.confirmation_codes) ? prefill.confirmation_codes : [],
		booked: prefill?.booked === true,
		reservation_url: (prefill?.reservation_url as string) ?? '',
		free_cancellation: prefill?.free_cancellation === true,
	});
</script>

<NavBar title="New item" subtitle={data.trip.title} back backHref="/trips/{data.trip.slug}" />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8 space-y-4">
	{#if error}
		<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">{error}</div>
	{/if}

	{#if submitAsSuggestion}
		<div class="border-sky/30 bg-sky/10 text-sky-700 rounded-md border p-3 text-sm">
			You're a traveler on this trip. Your item will be submitted as a suggestion for the owner to review.
		</div>
	{/if}

	{#if suggestionId && prefillAuthorName}
		<div class="border-moss/30 bg-moss-tint text-moss rounded-md border p-3 text-sm">
			Reviewing suggestion from <strong>{prefillAuthorName}</strong>. Edit as needed, then approve.
		</div>
	{/if}

	<form
		method="POST"
		use:validateForm
		use:enhance={() => {
			loading = true;
			submitting = true;
			return async ({ update, result }) => {
				if (result.type === 'failure') {
					loading = false;
					submitting = false;
				}
				await update();
			};
		}}
		class="space-y-4"
	>
		{#if suggestionId}
			<input type="hidden" name="suggestion_id" value={suggestionId} />
		{/if}

		<ItemForm
			mode="create"
			{initialData}
			context={{
				days: data.days,
				phases: data.phases,
				members: data.members,
				preselectedDay: data.preselectedDay,
				preselectedSlot: data.preselectedSlot,
				preselectedPhase: data.preselectedPhase
			}}
			bind:dirty
			typeEditable={true}
		/>

		<div class="sticky bottom-20 md-desktop:bottom-4 z-sticky bg-paper -mx-4 px-4 pt-2 pb-2">
			<Button type="submit" disabled={loading} loading={loading} variant="moss" size="lg" class="w-full">
				{buttonLabel}
			</Button>
		</div>
	</form>
</main>
```

- [ ] **Step 2: Verify no type errors**

Run: `pnpm check`
Expected: 0 errors, 0 warnings

- [ ] **Step 3: Commit**

```bash
git add src/routes/\(app\)/trips/\[slug\]/items/new/+page.svelte
git commit -m "refactor(#14): rewrite items/new as thin ItemForm wrapper"
```

---

## Task 4: Rewrite `items/[itemId]/edit/+page.svelte` as thin wrapper

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/items/[itemId]/edit/+page.svelte`

- [ ] **Step 1: Rewrite the edit page**

```svelte
<!-- src/routes/(app)/trips/[slug]/items/[itemId]/edit/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { validateForm } from '$lib/shell/actions/validate-form';
	import { beforeNavigate } from '$app/navigation';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Button from '$lib/ui/Button.svelte';
	import ItemForm from '$lib/itinerary/components/ItemForm.svelte';
	import type { ItemFormData } from '$lib/itinerary/components/ItemFormFields';
	import { untrack } from 'svelte';

	let { data, form } = $props();

	let dirty = $state(false);
	let submitting = $state(false);
	let loading = $state(false);
	let deleting = $state(false);
	let confirmDelete = $state(false);
	let error = $derived(form?.error ?? '');

	beforeNavigate(({ cancel }) => {
		if (dirty && !submitting && !confirm('You have unsaved changes. Leave anyway?')) cancel();
	});

	$effect(() => {
		if (!dirty) return;
		const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	});

	let initialData: ItemFormData = untrack(() => ({
		type: data.item.type,
		subtype: data.item.subtype ?? '',
		title: data.item.title ?? '',
		description: data.item.description ?? '',
		day: data.item.day ?? '',
		slot: data.item.slot ?? 'anytime',
		phase: data.item.phase ?? '',
		start_time: data.item.start_time ?? '',
		end_time: data.item.end_time ?? '',
		location_name: data.item.location_name ?? '',
		location_address: data.item.location_address ?? '',
		location_coords: data.item.location_coords ?? null,
		google_place_id: data.item.google_place_id ?? '',
		booked: data.item.booked ?? false,
		reservation_url: data.item.reservation_url ?? '',
		free_cancellation: data.item.free_cancellation ?? false,
		cost_estimate_usd: data.item.cost_estimate_usd ?? 0,
		cost_actual_usd: data.item.cost_actual_usd ?? 0,
		confirmation_codes: data.item.confirmation_codes ?? [],
		assigned_to: data.item.assigned_to ?? [],
		status: data.item.status ?? 'planned'
	}));
</script>

<NavBar
	title="Edit"
	subtitle={data.item.title}
	back
	backHref="/trips/{data.trip.slug}/items/{data.item.id}"
/>

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8 space-y-4">
	{#if error}
		<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">{error}</div>
	{/if}

	<form
		method="POST"
		action="?/update"
		use:validateForm
		use:enhance={() => {
			loading = true;
			submitting = true;
			return async ({ update, result }) => {
				if (result.type === 'failure') {
					loading = false;
					submitting = false;
				}
				await update();
			};
		}}
		class="space-y-4"
	>
		<ItemForm
			mode="edit"
			{initialData}
			context={{
				days: data.days,
				phases: data.phases,
				members: data.members
			}}
			bind:dirty
		/>

		<div class="sticky bottom-20 md-desktop:bottom-4 z-sticky bg-paper -mx-4 px-4 pt-2 pb-2">
			<Button type="submit" disabled={loading} loading={loading} variant="moss" size="lg" class="w-full">
				{loading ? 'Saving…' : 'Save changes'}
			</Button>
		</div>
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
					class="bg-clay text-paper hover:bg-clay/90 rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
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
```

- [ ] **Step 2: Verify no type errors**

Run: `pnpm check`
Expected: 0 errors, 0 warnings

- [ ] **Step 3: Commit**

```bash
git add src/routes/\(app\)/trips/\[slug\]/items/\[itemId\]/edit/+page.svelte
git commit -m "refactor(#14): rewrite items/edit as thin ItemForm wrapper"
```

---

## Task 5: Rewrite `items/[itemId]/+page.svelte` to use ItemForm for view sections

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/items/[itemId]/+page.svelte`

The detail page uses ItemForm in view mode for the shared display cards (schedule, location, booking, costs, assigned-to), but keeps its own rendering for view-specific features: header card with TypeIcon/pills/votes, alternates, checklist, comments, delete, and MoveItemSheet.

- [ ] **Step 1: Rewrite the detail page**

Replace the inline display cards (Schedule, Location, Booking, Costs, Assigned to) with `<ItemForm mode="view">`. Keep: header card, alternates, checklist, comments, delete, and MoveItemSheet unchanged.

The key change is replacing lines ~158-430 (the Schedule, Location, Booking, Costs, Assigned to cards) with:

```svelte
<ItemForm
	mode="view"
	initialData={{
		type: data.item.type,
		subtype: data.item.subtype ?? '',
		title: data.item.title,
		description: '',
		day: data.item.day ?? '',
		slot: data.item.slot ?? 'anytime',
		phase: data.item.phase ?? '',
		start_time: data.item.start_time ?? '',
		end_time: data.item.end_time ?? '',
		location_name: data.item.location_name ?? '',
		location_address: data.item.location_address ?? '',
		location_coords: data.item.location_coords ?? null,
		google_place_id: data.item.google_place_id ?? '',
		booked: data.item.booked ?? false,
		reservation_url: data.item.reservation_url ?? '',
		free_cancellation: data.item.free_cancellation ?? false,
		cost_estimate_usd: data.item.cost_estimate_usd ?? 0,
		cost_actual_usd: data.item.cost_actual_usd ?? 0,
		confirmation_codes: data.item.confirmation_codes ?? [],
		assigned_to: data.item.assigned_to ?? [],
		status: data.item.status ?? 'planned'
	}}
	context={{
		days: data.days ?? [],
		phases: data.phases ?? [],
		members: data.members
	}}
/>
```

The header card (with TypeIcon, pills, votes, promote/demote), alternates, checklist, comments, delete, and MoveItemSheet remain as-is in the route page.

- [ ] **Step 2: Verify no type errors**

Run: `pnpm check`
Expected: 0 errors, 0 warnings

- [ ] **Step 3: Commit**

```bash
git add src/routes/\(app\)/trips/\[slug\]/items/\[itemId\]/+page.svelte
git commit -m "refactor(#14): use ItemForm view mode in item detail page"
```

---

## Task 6: Verify and clean up

**Files:**
- All modified files from Tasks 1-5

- [ ] **Step 1: Run type checker**

Run: `pnpm check`
Expected: 0 errors, 0 warnings

- [ ] **Step 2: Run unit tests**

Run: `pnpm test`
Expected: All 47 tests passing

- [ ] **Step 3: Run E2E tests (if PocketBase available)**

Run: `pnpm test:e2e`
Expected: All existing tests pass

- [ ] **Step 4: Verify line counts on route pages**

Run: `wc -l src/routes/\(app\)/trips/\[slug\]/items/new/+page.svelte src/routes/\(app\)/trips/\[slug\]/items/\[itemId\]/edit/+page.svelte src/routes/\(app\)/trips/\[slug\]/items/\[itemId\]/+page.svelte`

Expected: Each route page is under ~120 LOC (down from 535, 525, 562)

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "refactor(#14): extract ItemForm deep module — complete"
```
