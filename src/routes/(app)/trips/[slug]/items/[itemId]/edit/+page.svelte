<script lang="ts">
	import { enhance } from '$app/forms';
	import { itemFieldConfig, itemTypeLabels, slotOptions } from '$lib/config/item-fields';
	import type { ConfirmationCode } from '$lib/types';

	let { data, form } = $props();

	let loading = $state(false);
	let deleting = $state(false);
	let confirmDelete = $state(false);
	let error = $derived(form?.error ?? '');

	let fields = $derived(itemFieldConfig[data.item.type]);

	let confirmationCodes = $state<ConfirmationCode[]>(
		data.item.confirmation_codes?.length > 0
			? [...data.item.confirmation_codes]
			: []
	);

	function addCode() {
		confirmationCodes = [...confirmationCodes, { label: '', value: '' }];
	}

	function removeCode(index: number) {
		confirmationCodes = confirmationCodes.filter((_, i) => i !== index);
	}
</script>

<div class="space-y-4">
	<a
		href="/trips/{data.trip.slug}/items/{data.item.id}"
		class="text-sm text-slate-500 hover:text-slate-700"
	>
		&larr; Back to item
	</a>

	<h2 class="text-lg font-bold text-slate-900">
		Edit {itemTypeLabels[data.item.type]}
	</h2>

	{#if error}
		<div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
	{/if}

	<form
		method="POST"
		action="?/update"
		use:enhance={() => {
			loading = true;
			return async ({ update }) => {
				loading = false;
				await update();
			};
		}}
		class="space-y-4"
	>
		<!-- Type is read-only -->
		<div>
			<label class="block text-sm font-medium text-slate-700">Type</label>
			<span class="mt-1 inline-block rounded bg-slate-100 px-2 py-1 text-sm text-slate-600">
				{itemTypeLabels[data.item.type]}
			</span>
		</div>

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
						<option value={st} selected={data.item.subtype === st}>{st.replace(/_/g, ' ')}</option>
					{/each}
				</select>
			</div>
		{/if}

		<!-- Title -->
		<div>
			<label for="title" class="block text-sm font-medium text-slate-700">Title</label>
			<input
				type="text"
				id="title"
				name="title"
				required
				value={data.item.title}
				class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
			/>
		</div>

		<!-- Description -->
		<div>
			<label for="description" class="block text-sm font-medium text-slate-700">Description</label>
			<textarea
				id="description"
				name="description"
				rows="2"
				class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
			>{data.item.description}</textarea>
		</div>

		<!-- Status -->
		<div>
			<label for="status" class="block text-sm font-medium text-slate-700">Status</label>
			<select
				id="status"
				name="status"
				class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
			>
				<option value="planned" selected={data.item.status === 'planned'}>Planned</option>
				<option value="done" selected={data.item.status === 'done'}>Done</option>
			</select>
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
						<option value={d.id} selected={d.id === data.item.day}>
							{new Date(d.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
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
						<option value={opt.value} selected={data.item.slot === opt.value}>{opt.label}</option>
					{/each}
				</select>
			</div>
		</div>

		<!-- Phase -->
		<div>
			<label for="phase" class="block text-sm font-medium text-slate-700">Phase</label>
			<select
				id="phase"
				name="phase"
				class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
			>
				<option value="">None</option>
				{#each data.phases as p}
					<option value={p.id} selected={p.id === data.item.phase}>{p.name}</option>
				{/each}
			</select>
		</div>

		<!-- Location -->
		{#if fields.location}
			<div>
				<label for="location_name" class="block text-sm font-medium text-slate-700">Location Name</label>
				<input
					type="text"
					id="location_name"
					name="location_name"
					value={data.item.location_name}
					class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				/>
			</div>
			<div>
				<label for="location_address" class="block text-sm font-medium text-slate-700">Address</label>
				<input
					type="text"
					id="location_address"
					name="location_address"
					value={data.item.location_address}
					class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				/>
			</div>
		{/if}

		<!-- Times -->
		{#if fields.times}
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label for="start_time" class="block text-sm font-medium text-slate-700">Start Time</label>
					<input
						type="time"
						id="start_time"
						name="start_time"
						value={data.item.start_time}
						class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					/>
				</div>
				<div>
					<label for="end_time" class="block text-sm font-medium text-slate-700">End Time</label>
					<input
						type="time"
						id="end_time"
						name="end_time"
						value={data.item.end_time}
						class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					/>
				</div>
			</div>
		{/if}

		<!-- Booking -->
		{#if fields.booking}
			<div class="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
				<h3 class="text-xs font-medium text-slate-500 uppercase">Booking</h3>
				<label class="flex items-center gap-2">
					<input type="checkbox" name="booked" checked={data.item.booked} class="rounded border-slate-300" />
					<span class="text-sm text-slate-700">Booked</span>
				</label>
				<div>
					<label for="reservation_url" class="block text-sm font-medium text-slate-700">Reservation URL</label>
					<input
						type="url"
						id="reservation_url"
						name="reservation_url"
						value={data.item.reservation_url}
						class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					/>
				</div>
				<label class="flex items-center gap-2">
					<input type="checkbox" name="free_cancellation" checked={data.item.free_cancellation} class="rounded border-slate-300" />
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
							onclick={() => removeCode(i)}
							class="text-slate-400 hover:text-red-500"
						>
							<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
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
						value={data.item.cost_estimate_usd || ''}
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
						value={data.item.cost_actual_usd || ''}
						class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					/>
				</div>
			</div>
		{/if}

		<!-- Assigned to -->
		{#if data.members.length > 1}
			<div>
				<label class="block text-sm font-medium text-slate-700">Assigned To</label>
				<div class="mt-1 space-y-1">
					{#each data.members as member}
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								name="assigned_to"
								value={member.id}
								checked={data.item.assigned_to.includes(member.id)}
								class="rounded border-slate-300"
							/>
							<span class="text-sm text-slate-700">
								{member.display_name || member.expand?.user?.name || member.expand?.user?.email || member.placeholder_name || 'Unknown'}
							</span>
						</label>
					{/each}
				</div>
			</div>
		{/if}

		<button
			type="submit"
			disabled={loading}
			class="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
		>
			{loading ? 'Saving...' : 'Save Changes'}
		</button>
	</form>

	<!-- Delete -->
	<div class="rounded-lg border border-red-200 p-4">
		<h3 class="text-sm font-medium text-red-700">Delete Item</h3>
		{#if !confirmDelete}
			<button
				type="button"
				onclick={() => (confirmDelete = true)}
				class="mt-2 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
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
					class="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
				>
					{deleting ? 'Deleting...' : 'Confirm Delete'}
				</button>
				<button
					type="button"
					onclick={() => (confirmDelete = false)}
					class="text-sm text-slate-500 hover:text-slate-700"
				>
					Cancel
				</button>
			</form>
		{/if}
	</div>
</div>
