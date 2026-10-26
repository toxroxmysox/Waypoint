<script lang="ts">
	import { getFieldConfig } from '$lib/itinerary/item-fields';
	import { bookingWords, defaultRequiresBooking } from '$lib/itinerary/booking-projection';
	import type { ItemType, ConfirmationCode } from '$lib/types';
	import Card from '$lib/ui/Card.svelte';
	import SectionH from '$lib/ui/SectionH.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import PlacesAutocomplete from '$lib/itinerary/components/PlacesAutocomplete.svelte';
	import FlightLookup from '$lib/itinerary/components/FlightLookup.svelte';
	import { formatCalendarDate } from '$lib/shell/format';
	import { untrack } from 'svelte';
	import { memberDisplayName } from '$lib/itinerary/member-name';
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

	function markDirty() {
		dirty = true;
	}

	let selectedType = $state<ItemType>(untrack(() => initialData.type));
	let selectedSubtype = $state(untrack(() => initialData.subtype));

	// requires_booking — drives the Booking Smart List (#50). On create, follow
	// the per-type default as the type changes; on edit, preserve the stored value.
	let requiresBooking = $state(untrack(() => initialData.requires_booking));
	$effect(() => {
		if (mode === 'create') requiresBooking = defaultRequiresBooking(selectedType);
	});
	let config = $derived(getFieldConfig(selectedType));
	let fields = $derived(config.visibility);

	let titleValue = $state(untrack(() => initialData.title));
	let descriptionValue = $state(untrack(() => initialData.description));
	let startTimeValue = $state(untrack(() => initialData.start_time));
	let endTimeValue = $state(untrack(() => initialData.end_time));
	let endDateValue = $state(untrack(() => initialData.end_date));
	// #130 — flight timezones: stored-not-shown. Carried through submission via
	// hidden inputs (flight-only); set by FlightLookup, preserved on edit.
	let startTzValue = $state(untrack(() => initialData.start_tz));
	let endTzValue = $state(untrack(() => initialData.end_tz));
	let flightNumberValue = $state(untrack(() => initialData.flight_number));
	let selectedDay = $state(
		untrack(() => (mode === 'create' ? (context.preselectedDay ?? '') : initialData.day))
	);
	let selectedDayDate = $derived(
		context.days.find((d) => d.id === selectedDay)?.date.split(/[T ]/)[0] ?? ''
	);
	// #196 — phase-required invariant. An unscheduled (no-day) item becomes
	// status=unplanned, and every parking surface is phase-scoped, so a
	// phase-less unplanned item renders nowhere. When no day is picked, the
	// phase select becomes required (mirrored by server validation).
	let selectedPhase = $state(
		untrack(() =>
			mode === 'create' ? (context.preselectedPhase ?? '') : (initialData.phase ?? '')
		)
	);
	// Require only when phases actually exist to assign to — a trip with zero
	// phases can't trap an unscheduled item (and there's no parking lot yet).
	let phaseRequired = $derived(selectedDay === '' && context.phases.length > 0);
	let locationNameValue = $state(untrack(() => initialData.location_name));
	let locationAddressValue = $state(untrack(() => initialData.location_address));
	let locationCoords = $state(
		untrack(() => (initialData.location_coords ? JSON.stringify(initialData.location_coords) : ''))
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
		flight_number: string;
		start_time: string;
		end_time: string;
		end_date: string;
		start_tz: string;
		end_tz: string;
		location_name: string;
		description: string;
	}) {
		titleValue = flight.title;
		flightNumberValue = flight.flight_number;
		descriptionValue = flight.description;
		startTimeValue = flight.start_time;
		endTimeValue = flight.end_time;
		// Red-eye arrivals prefill the multi-day end date (shown once a day is picked).
		if (flight.end_date) endDateValue = flight.end_date;
		locationNameValue = flight.location_name;
		// #130 — capture tz for storage only; never surfaced.
		startTzValue = flight.start_tz;
		endTzValue = flight.end_tz;
		markDirty();
	}

	let confirmationCodes = $state<ConfirmationCode[]>(
		untrack(() =>
			initialData.confirmation_codes.length > 0 ? [...initialData.confirmation_codes] : []
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
</script>

<Card>
	<div class="space-y-4 p-4" oninput={markDirty}>
		{#if typeEditable}
			<div>
				<label for="title" class="block text-sm font-medium text-ink-soft">Title</label>
				<input
					type="text"
					id="title"
					name="title"
					required
					autocomplete="off"
					bind:value={titleValue}
					class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
					placeholder="Hotel check-in, Train to Madrid, etc."
				/>
			</div>

			<fieldset>
				<legend class="block text-sm font-medium text-ink-soft">Type</legend>
				<div class="mt-1 flex flex-wrap gap-2">
					{#each ['lodging', 'transportation', 'flight', 'activity', 'meal', 'note'] as const as type (type)}
						{@const typeLabel = getFieldConfig(type).labels.typeLabel}
						{@const active = selectedType === type}
						<button
							type="button"
							aria-pressed={active}
							onclick={() => (selectedType = type)}
							class="rounded-full border px-3 py-1 text-sm font-semibold transition-colors
									{active
								? 'border-ink bg-ink text-paper'
								: 'border-line bg-surface text-ink-soft hover:bg-surface-2 active:bg-surface-2'}"
						>
							{typeLabel}
						</button>
					{/each}
				</div>
				<input type="hidden" name="type" value={selectedType} />
			</fieldset>
		{:else}
			<div>
				<div class="text-sm font-medium text-ink-soft">Type</div>
				<div class="mt-1">
					<Pill variant="default" size="md"
						>{getFieldConfig(initialData.type).labels.typeLabel}</Pill
					>
				</div>
			</div>
		{/if}

		{#if fields.subtype && config.labels.subtypeOptions.length > 0}
			<div>
				<label for="subtype" class="block text-sm font-medium text-ink-soft">Subtype</label>
				<select
					id="subtype"
					name="subtype"
					bind:value={selectedSubtype}
					class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
				>
					<option value="">None</option>
					{#each config.labels.subtypeOptions as opt (opt.value)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</div>
		{/if}

		{#if (typeEditable ? selectedType : initialData.type) === 'flight'}
			<div>
				<div class="mb-1 text-sm font-medium text-ink-soft">Flight lookup</div>
				<FlightLookup
					onSelect={handleFlightSelect}
					defaultDate={selectedDayDate || context.tripStartDate}
					minDate={context.tripStartDate}
					maxDate={context.tripEndDate}
				/>
				<!-- #130 — flight tz: stored-not-shown. No visible field; carried for persistence only. -->
				<input type="hidden" name="start_tz" value={startTzValue} />
				<input type="hidden" name="end_tz" value={endTzValue} />
				<input type="hidden" name="flight_number" value={flightNumberValue} />
			</div>
		{/if}

		{#if !typeEditable}
			<div>
				<label for="title" class="block text-sm font-medium text-ink-soft">Title</label>
				<input
					type="text"
					id="title"
					name="title"
					required
					autocomplete="off"
					bind:value={titleValue}
					class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
				/>
			</div>
		{/if}

		<div>
			<label for="description" class="block text-sm font-medium text-ink-soft">Description</label>
			<textarea
				id="description"
				name="description"
				rows={2}
				bind:value={descriptionValue}
				class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
			></textarea>
		</div>

		{#if mode === 'edit'}
			<div>
				<label for="status" class="block text-sm font-medium text-ink-soft">Status</label>
				<select
					id="status"
					name="status"
					class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
				>
					<option value="planned" selected={initialData.status === 'planned'}>Planned</option>
					<option value="done" selected={initialData.status === 'done'}>Done</option>
				</select>
			</div>
		{/if}
	</div>
</Card>

<Card>
	<div class="space-y-4 p-4">
		<SectionH>When</SectionH>
		<div class="grid grid-cols-2 gap-3">
			<div>
				<label for="day" class="block text-sm font-medium text-ink-soft">Day</label>
				<select
					id="day"
					name="day"
					bind:value={selectedDay}
					class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
				>
					<option value="">Unscheduled</option>
					{#each context.days as d (d.id)}
						<option value={d.id}>
							{formatCalendarDate(d.date, {
								weekday: 'short',
								month: 'short',
								day: 'numeric'
							})}
						</option>
					{/each}
				</select>
			</div>
		</div>

		<div>
			<label for="phase" class="block text-sm font-medium text-ink-soft"> Phase </label>
			<select
				id="phase"
				name="phase"
				bind:value={selectedPhase}
				required={phaseRequired}
				oninput={markDirty}
				class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
			>
				<option value="">{phaseRequired ? 'Select a phase…' : 'None'}</option>
				{#each context.phases as p (p.id)}
					<option value={p.id}>{p.name}</option>
				{/each}
			</select>
			{#if phaseRequired}
				<p class="mt-1 text-xs text-ink-muted">
					An unscheduled idea needs a phase so it shows up in that phase's parking lot.
				</p>
			{/if}
		</div>

		{#if fields.times}
			<div class="grid grid-cols-2 gap-3">
				<div class="min-w-0">
					<label for="start_time" class="block text-sm font-medium text-ink-soft">Start time</label>
					<input
						type="time"
						id="start_time"
						name="start_time"
						bind:value={startTimeValue}
						class="mt-1 block w-full min-w-0 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
					/>
				</div>
				<div class="min-w-0">
					<label for="end_time" class="block text-sm font-medium text-ink-soft">End time</label>
					<input
						type="time"
						id="end_time"
						name="end_time"
						bind:value={endTimeValue}
						class="mt-1 block w-full min-w-0 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
					/>
				</div>
			</div>
		{/if}

		{#if fields.endDate && selectedDay}
			<div>
				<label for="end_date" class="block text-sm font-medium text-ink-soft">
					End date <span class="font-normal text-ink-muted">(multi-day)</span>
				</label>
				<input
					type="date"
					id="end_date"
					name="end_date"
					bind:value={endDateValue}
					min={selectedDayDate}
					max={context.tripEndDate}
					class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
				/>
				<p class="mt-1 text-xs text-ink-muted">
					Leave empty for a single-day item. End time above applies to the end date.
				</p>
			</div>
		{:else if fields.endDate}
			<input type="hidden" name="end_date" value="" />
		{/if}
	</div>
</Card>

{#if fields.location}
	<Card>
		<div class="space-y-4 p-4">
			<SectionH>Location</SectionH>
			<PlacesAutocomplete onSelect={handlePlaceSelect} />
			<div>
				<label for="location_name" class="block text-sm font-medium text-ink-soft">Name</label>
				<input
					type="text"
					id="location_name"
					name="location_name"
					bind:value={locationNameValue}
					class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
					placeholder="Hotel Barcelona"
				/>
			</div>
			<div>
				<label for="location_address" class="block text-sm font-medium text-ink-soft">Address</label
				>
				<input
					type="text"
					id="location_address"
					name="location_address"
					bind:value={locationAddressValue}
					class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
				/>
			</div>
			<input type="hidden" name="location_coords" value={locationCoords} />
			<input type="hidden" name="google_place_id" value={googlePlaceId} />
		</div>
	</Card>
{/if}

{#if fields.booking}
	<Card>
		<div class="space-y-3 p-4">
			<SectionH>{selectedType === 'meal' ? 'Reservation' : 'Booking'}</SectionH>
			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					name="requires_booking"
					bind:checked={requiresBooking}
					class="rounded border-line"
				/>
				<span class="text-sm text-ink-soft">Needs a reservation</span>
			</label>
			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					name="booked"
					checked={initialData.booked}
					class="rounded border-line"
				/>
				<span class="text-sm text-ink-soft">{bookingWords(selectedType).done}</span>
			</label>
			<div>
				<label for="reservation_url" class="block text-sm font-medium text-ink-soft"
					>Reservation URL</label
				>
				<input
					type="url"
					id="reservation_url"
					name="reservation_url"
					inputmode="url"
					onblur={normalizeUrl}
					value={initialData.reservation_url}
					placeholder="example.com"
					class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
				/>
			</div>
			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					name="free_cancellation"
					checked={initialData.free_cancellation}
					class="rounded border-line"
				/>
				<span class="text-sm text-ink-soft">Free cancellation</span>
			</label>
		</div>
	</Card>
{/if}

{#if fields.confirmationCodes}
	<Card>
		<div class="space-y-2 p-4">
			<SectionH>
				{#snippet right()}
					<button
						type="button"
						onclick={addCode}
						class="text-ink-muted hover:text-ink-soft active:text-ink-soft"
					>
						+ Add code
					</button>
				{/snippet}
				Confirmation codes
			</SectionH>
			{#each confirmationCodes as code, i (i)}
				<div class="flex gap-2">
					<input
						type="text"
						name="confirmation_code_label"
						placeholder="Label"
						bind:value={code.label}
						class="block w-1/3 rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
					/>
					<input
						type="text"
						name="confirmation_code_value"
						placeholder="Code"
						bind:value={code.value}
						class="block flex-1 rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-sm text-ink"
					/>
					<button
						type="button"
						aria-label="Remove confirmation code"
						onclick={() => removeCode(i)}
						class="text-ink-muted hover:text-error active:text-error"
					>
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
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
			<SectionH>Cost</SectionH>
			<div class="mt-2">
				<label for="cost_estimate_usd" class="block text-sm font-medium text-ink-soft"
					>Cost (USD)</label
				>
				<input
					type="number"
					inputmode="decimal"
					id="cost_estimate_usd"
					name="cost_estimate_usd"
					step="0.01"
					min="0"
					value={initialData.cost_estimate_usd || ''}
					class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm text-ink"
				/>
			</div>
		</div>
	</Card>
{/if}

{#if context.members.length > 1}
	<Card>
		<div class="p-4">
			<fieldset>
				<legend class="text-[11px] font-bold tracking-[0.2em] text-moss uppercase">Going</legend>
				<div class="mt-2 space-y-1">
					{#each context.members as member (member.id)}
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								name="assigned_to"
								value={member.id}
								checked={initialData.assigned_to.includes(member.id)}
								class="rounded border-line"
							/>
							<span class="text-sm text-ink-soft">
								{memberDisplayName(member)}
							</span>
						</label>
					{/each}
				</div>
			</fieldset>
		</div>
	</Card>
{/if}

{#if context.goals && context.goals.length > 0}
	<Card>
		<div class="p-4">
			<fieldset>
				<legend class="text-[11px] font-bold tracking-[0.2em] text-moss uppercase"
					>Addresses goal(s)</legend
				>
				<p class="mt-1 text-xs text-ink-muted">Link this plan to the goals it helps make happen.</p>
				<div class="mt-2 space-y-1">
					{#each context.goals as goal (goal.id)}
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								name="goals"
								value={goal.id}
								checked={initialData.linked_goal_ids.includes(goal.id)}
								class="rounded border-line"
							/>
							<span class="text-sm text-ink-soft">{goal.title}</span>
						</label>
					{/each}
				</div>
			</fieldset>
		</div>
	</Card>
{/if}
