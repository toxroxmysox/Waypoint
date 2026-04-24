<script lang="ts">
	import { enhance } from '$app/forms';
	import { itemFieldConfig, itemTypeLabels, slotOptions } from '$lib/config/item-fields';
	import type { ItemType } from '$lib/types';

	let { data, form } = $props();

	let selectedType = $state<ItemType>('activity');
	let loading = $state(false);
	let error = $derived(form?.error ?? '');

	let fields = $derived(itemFieldConfig[selectedType]);

	// Confirmation codes state
	let confirmationCodes = $state<{ label: string; value: string }[]>([]);

	function addCode() {
		confirmationCodes = [...confirmationCodes, { label: '', value: '' }];
	}

	function removeCode(index: number) {
		confirmationCodes = confirmationCodes.filter((_, i) => i !== index);
	}

	function titleCase(s: string): string {
		return s
			.replace(/_/g, ' ')
			.replace(/\b\w/g, (c) => c.toUpperCase());
	}

	function normalizeUrl(e: FocusEvent) {
		const el = e.currentTarget as HTMLInputElement;
		const v = el.value.trim();
		if (v && !/^https?:\/\//i.test(v)) {
			el.value = `https://${v}`;
		}
	}
</script>

<div class="space-y-4">
	<a
		href="/trips/{data.trip.slug}"
		class="text-sm text-slate-500 hover:text-slate-700"
	>
		&larr; Back
	</a>

	<h2 class="text-lg font-bold text-slate-900">New Item</h2>

	{#if error}
		<div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
	{/if}

	<form
		method="POST"
		use:enhance={() => {
			loading = true;
			return async ({ update }) => {
				loading = false;
				await update();
			};
		}}
		class="space-y-4"
	>
		<!-- Title -->
		<div>
			<label for="title" class="block text-sm font-medium text-slate-700">Title</label>
			<input
				type="text"
				id="title"
				name="title"
				required
				class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				placeholder="Hotel check-in, Train to Madrid, etc."
			/>
		</div>

		<!-- Type selector (fieldset/legend: these buttons are a group control) -->
		<fieldset>
			<legend class="block text-sm font-medium text-slate-700">Type</legend>
			<div class="mt-1 flex flex-wrap gap-2">
				{#each Object.entries(itemTypeLabels) as [type, label]}
					<button
						type="button"
						aria-pressed={selectedType === type}
						onclick={() => (selectedType = type as ItemType)}
						class="rounded-full px-3 py-1 text-sm font-medium
							{selectedType === type
							? 'bg-slate-900 text-white'
							: 'bg-slate-100 text-slate-600 hover:bg-slate-200'}"
					>
						{label}
					</button>
				{/each}
			</div>
			<input type="hidden" name="type" value={selectedType} />
		</fieldset>

		<!-- Subtype -->
		{#if fields.subtype && fields.subtypes.length > 0}
			<div>
				<label for="subtype" class="block text-sm font-medium text-slate-700">Subtype</label>
				<select
					id="subtype"
					name="subtype"
					class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				>
					<option value="">None</option>
					{#each fields.subtypes as st}
						<option value={st}>{titleCase(st)}</option>
					{/each}
				</select>
			</div>
		{/if}

		<!-- Description -->
		<div>
			<label for="description" class="block text-sm font-medium text-slate-700">Description</label>
			<textarea
				id="description"
				name="description"
				rows="2"
				class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
			></textarea>
		</div>

		<!-- Day + Slot -->
		<div class="grid grid-cols-2 gap-3">
			<div>
				<label for="day" class="block text-sm font-medium text-slate-700">Day</label>
				<select
					id="day"
					name="day"
					class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				>
					<option value="">Unscheduled</option>
					{#each data.days as d}
						<option value={d.id} selected={d.id === data.preselectedDay}>
							{new Date(d.date.replace(' ', 'T')).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}
						</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="slot" class="block text-sm font-medium text-slate-700">Slot</label>
				<select
					id="slot"
					name="slot"
					class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				>
					{#each slotOptions as opt}
						<option value={opt.value} selected={opt.value === data.preselectedSlot}>{opt.label}</option>
					{/each}
				</select>
			</div>
		</div>

		<!-- Phase (hidden, derived from day if set, or manual) -->
		<div>
			<label for="phase" class="block text-sm font-medium text-slate-700">Phase</label>
			<select
				id="phase"
				name="phase"
				class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
			>
				<option value="">None</option>
				{#each data.phases as p}
					<option value={p.id} selected={p.id === data.preselectedPhase}>
						{p.name}
					</option>
				{/each}
			</select>
		</div>

		<!-- Location fields -->
		{#if fields.location}
			<div>
				<label for="location_name" class="block text-sm font-medium text-slate-700">Location Name</label>
				<input
					type="text"
					id="location_name"
					name="location_name"
					class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					placeholder="Hotel Barcelona"
				/>
			</div>
			<div>
				<label for="location_address" class="block text-sm font-medium text-slate-700">Address</label>
				<input
					type="text"
					id="location_address"
					name="location_address"
					class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				/>
			</div>
		{/if}

		<!-- Times -->
		{#if fields.times}
			<div class="grid grid-cols-2 gap-3">
				<div class="min-w-0">
					<label for="start_time" class="block text-sm font-medium text-slate-700">Start Time</label>
					<input
						type="time"
						id="start_time"
						name="start_time"
						class="mt-1 block w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					/>
				</div>
				<div class="min-w-0">
					<label for="end_time" class="block text-sm font-medium text-slate-700">End Time</label>
					<input
						type="time"
						id="end_time"
						name="end_time"
						class="mt-1 block w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					/>
				</div>
			</div>
		{/if}

		<!-- Booking -->
		{#if fields.booking}
			<div class="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
				<h3 class="text-xs font-medium text-slate-500 uppercase">Booking</h3>
				<label class="flex items-center gap-2">
					<input type="checkbox" name="booked" class="rounded border-slate-300" />
					<span class="text-sm text-slate-700">Booked</span>
				</label>
				<div>
					<label for="reservation_url" class="block text-sm font-medium text-slate-700">Reservation URL</label>
					<input
						type="url"
						id="reservation_url"
						name="reservation_url"
						inputmode="url"
						onblur={normalizeUrl}
						placeholder="example.com"
						class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					/>
				</div>
				<label class="flex items-center gap-2">
					<input type="checkbox" name="free_cancellation" class="rounded border-slate-300" />
					<span class="text-sm text-slate-700">Free cancellation</span>
				</label>
			</div>
		{/if}

		<!-- Confirmation codes -->
		{#if fields.confirmationCodes}
			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<h3 class="text-xs font-medium text-slate-500 uppercase">Confirmation Codes</h3>
					<button
						type="button"
						onclick={addCode}
						class="text-xs text-slate-500 hover:text-slate-700"
					>
						+ Add code
					</button>
				</div>
				{#each confirmationCodes as code, i}
					<div class="flex gap-2">
						<input
							type="text"
							name="confirmation_code_label"
							placeholder="Label"
							bind:value={code.label}
							class="block w-1/3 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
						/>
						<input
							type="text"
							name="confirmation_code_value"
							placeholder="Code"
							bind:value={code.value}
							class="block flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
						/>
						<button
							type="button"
							aria-label="Remove confirmation code"
							onclick={() => removeCode(i)}
							class="text-slate-400 hover:text-red-500"
						>
							<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Costs -->
		{#if fields.costs}
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label for="cost_estimate_usd" class="block text-sm font-medium text-slate-700">Est. Cost (USD)</label>
					<input
						type="number"
						id="cost_estimate_usd"
						name="cost_estimate_usd"
						step="0.01"
						min="0"
						class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					/>
				</div>
				<div>
					<label for="cost_actual_usd" class="block text-sm font-medium text-slate-700">Actual Cost (USD)</label>
					<input
						type="number"
						id="cost_actual_usd"
						name="cost_actual_usd"
						step="0.01"
						min="0"
						class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					/>
				</div>
			</div>
		{/if}

		<!-- Assigned to (fieldset wraps a checkbox group) -->
		{#if data.members.length > 1}
			<fieldset>
				<legend class="block text-sm font-medium text-slate-700">Assigned To</legend>
				<div class="mt-1 space-y-1">
					{#each data.members as member}
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								name="assigned_to"
								value={member.id}
								class="rounded border-slate-300"
							/>
							<span class="text-sm text-slate-700">
								{member.display_name || member.expand?.user?.name || member.expand?.user?.email || member.placeholder_name || 'Unknown'}
							</span>
						</label>
					{/each}
				</div>
			</fieldset>
		{/if}

		<button
			type="submit"
			disabled={loading}
			class="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
		>
			{loading ? 'Creating...' : 'Create Item'}
		</button>
	</form>
</div>
