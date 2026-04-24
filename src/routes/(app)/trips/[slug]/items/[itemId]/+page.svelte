<script lang="ts">
	import { enhance } from '$app/forms';
	import { itemFieldConfig, itemTypeLabels } from '$lib/config/item-fields';

	let { data } = $props();

	let fields = $derived(itemFieldConfig[data.item.type]);
	let confirmDelete = $state(false);
	let deleting = $state(false);

	function formatTime(t: string): string {
		if (!t) return '';
		const timePart = t.includes('T') ? t.split('T')[1] : t.includes(' ') ? t.split(' ')[1] : t;
		const [h, m] = timePart.split(':');
		const hour = parseInt(h, 10);
		const ampm = hour >= 12 ? 'PM' : 'AM';
		const h12 = hour % 12 || 12;
		return `${h12}:${m} ${ampm}`;
	}

	function memberName(memberId: string): string {
		const member = data.members.find((m) => m.id === memberId);
		if (!member) return 'Unknown';
		return member.display_name || member.expand?.user?.name || member.expand?.user?.email || member.placeholder_name || 'Unknown';
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		{#if data.itemDay}
			<a
				href="/trips/{data.trip.slug}/days/{data.itemDay.id}"
				class="text-sm text-slate-500 hover:text-slate-700"
			>
				&larr; Back to day
			</a>
		{:else}
			<a
				href="/trips/{data.trip.slug}"
				class="text-sm text-slate-500 hover:text-slate-700"
			>
				&larr; Back
			</a>
		{/if}
		<div class="flex items-center gap-2">
			<a
				href="/trips/{data.trip.slug}/items/{data.item.id}/edit"
				class="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
			>
				Edit
			</a>
			{#if confirmDelete}
				<form
					method="POST"
					action="?/delete"
					use:enhance={() => {
						deleting = true;
						return async ({ update }) => {
							await update();
							deleting = false;
						};
					}}
				>
					<button
						type="submit"
						disabled={deleting}
						class="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
					>
						{deleting ? 'Deleting...' : 'Confirm'}
					</button>
				</form>
				<button
					type="button"
					onclick={() => (confirmDelete = false)}
					class="text-sm text-slate-500 hover:text-slate-700"
				>
					Cancel
				</button>
			{:else}
				<button
					type="button"
					onclick={() => (confirmDelete = true)}
					class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
				>
					Delete
				</button>
			{/if}
		</div>
	</div>

	<!-- Header -->
	<div class="rounded-lg border border-slate-200 bg-white p-4">
		<div class="flex items-start justify-between">
			<div>
				<div class="flex items-center gap-2">
					<span class="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
						{itemTypeLabels[data.item.type]}
					</span>
					{#if data.item.subtype}
						<span class="rounded bg-slate-50 px-2 py-0.5 text-xs text-slate-500">
							{data.item.subtype.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
						</span>
					{/if}
				</div>
				<h2 class="mt-2 text-lg font-semibold text-slate-900">{data.item.title}</h2>
			</div>
			<div class="flex items-center gap-2">
				{#if data.item.booked}
					<span class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Booked</span>
				{/if}
				{#if data.item.status === 'done'}
					<span class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">Done</span>
				{/if}
			</div>
		</div>

		{#if data.item.description}
			<p class="mt-2 text-sm text-slate-600 whitespace-pre-wrap">{data.item.description}</p>
		{/if}
	</div>

	<!-- Schedule info (hide start/end times if type doesn't support them) -->
	{#if data.itemDay || data.itemPhase || (fields.times && data.item.start_time)}
		<div class="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
			<h3 class="text-xs font-medium text-slate-500 uppercase">Schedule</h3>
			{#if data.itemDay}
				<p class="text-sm text-slate-700">
					{new Date(data.itemDay.date.replace(' ', 'T')).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })}
					<span class="text-slate-400">&middot; {data.item.slot.charAt(0).toUpperCase() + data.item.slot.slice(1)}</span>
				</p>
			{/if}
			{#if data.itemPhase}
				<p class="flex items-center gap-1.5 text-sm text-slate-500">
					{#if data.itemPhase.color}
						<span class="h-2 w-2 rounded-full" style="background-color: {data.itemPhase.color}"></span>
					{/if}
					{data.itemPhase.name}
				</p>
			{/if}
			{#if fields.times && data.item.start_time}
				<p class="text-sm text-slate-700">
					{formatTime(data.item.start_time)}{data.item.end_time ? ` - ${formatTime(data.item.end_time)}` : ''}
				</p>
			{/if}
		</div>
	{/if}

	<!-- Location (type must support it AND have a populated value) -->
	{#if fields.location && (data.item.location_name || data.item.location_address)}
		<div class="rounded-lg border border-slate-200 bg-white p-4 space-y-1">
			<h3 class="text-xs font-medium text-slate-500 uppercase">Location</h3>
			{#if data.item.location_name}
				<p class="text-sm font-medium text-slate-900">{data.item.location_name}</p>
			{/if}
			{#if data.item.location_address}
				<p class="text-sm text-slate-500">{data.item.location_address}</p>
			{/if}
		</div>
	{/if}

	<!-- Booking details -->
	{#if fields.booking && (data.item.booked || data.item.reservation_url || data.item.confirmation_codes.length > 0)}
		<div class="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
			<h3 class="text-xs font-medium text-slate-500 uppercase">Booking</h3>
			{#if data.item.reservation_url}
				<a
					href={data.item.reservation_url}
					target="_blank"
					rel="noopener"
					class="block text-sm text-blue-600 hover:underline truncate"
				>
					{data.item.reservation_url}
				</a>
			{/if}
			{#if data.item.free_cancellation}
				<p class="text-xs text-green-600">Free cancellation</p>
			{/if}
			{#if data.item.confirmation_codes.length > 0}
				<div class="space-y-1">
					{#each data.item.confirmation_codes as code}
						<div class="flex items-center justify-between rounded bg-slate-50 px-2 py-1">
							<span class="text-xs text-slate-500">{code.label}</span>
							<span class="font-mono text-sm text-slate-900">{code.value}</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Costs -->
	{#if fields.costs && (data.item.cost_estimate_usd || data.item.cost_actual_usd)}
		<div class="rounded-lg border border-slate-200 bg-white p-4">
			<h3 class="text-xs font-medium text-slate-500 uppercase">Costs</h3>
			<div class="mt-2 grid grid-cols-2 gap-4">
				{#if data.item.cost_estimate_usd}
					<div>
						<p class="text-xs text-slate-400">Estimate</p>
						<p class="text-sm font-medium text-slate-900">${data.item.cost_estimate_usd.toFixed(2)}</p>
					</div>
				{/if}
				{#if data.item.cost_actual_usd}
					<div>
						<p class="text-xs text-slate-400">Actual</p>
						<p class="text-sm font-medium text-slate-900">${data.item.cost_actual_usd.toFixed(2)}</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Checklist -->
	{#if data.item.type === 'checklist'}
		<div class="rounded-lg border border-slate-200 bg-white p-4">
			<div class="flex items-center justify-between">
				<h3 class="text-xs font-medium text-slate-500 uppercase">
					Checklist
					{#if data.checklistItems.length > 0}
						<span class="ml-1 text-slate-400">
							({data.checklistItems.filter((ci) => ci.checked_by).length}/{data.checklistItems.length})
						</span>
					{/if}
				</h3>
			</div>

			{#if data.checklistItems.length > 0}
				<div class="mt-2 space-y-1">
					{#each data.checklistItems as ci, i}
						<div class="flex items-center gap-1">
							<form method="POST" action="?/toggleChecklistItem" use:enhance>
								<input type="hidden" name="ci_id" value={ci.id} />
								<button
									type="submit"
									class="flex items-center"
									aria-label={ci.checked_by ? 'Uncheck' : 'Check'}
								>
									<span
										class="flex h-5 w-5 items-center justify-center rounded border
											{ci.checked_by
											? 'border-slate-900 bg-slate-900 text-white'
											: 'border-slate-300 bg-white hover:border-slate-500'}"
									>
										{#if ci.checked_by}
											<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
												<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
											</svg>
										{/if}
									</span>
								</button>
							</form>
							<span class="flex-1 px-2 text-sm {ci.checked_by ? 'text-slate-400 line-through' : 'text-slate-700'}">
								{ci.text}
							</span>
							{#if i > 0}
								<form method="POST" action="?/reorderChecklistItem" use:enhance>
									<input type="hidden" name="ci_id" value={ci.id} />
									<input type="hidden" name="direction" value="up" />
									<button
										type="submit"
										class="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
										title="Move up"
										aria-label="Move up"
									>
										<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
										</svg>
									</button>
								</form>
							{/if}
							{#if i < data.checklistItems.length - 1}
								<form method="POST" action="?/reorderChecklistItem" use:enhance>
									<input type="hidden" name="ci_id" value={ci.id} />
									<input type="hidden" name="direction" value="down" />
									<button
										type="submit"
										class="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
										title="Move down"
										aria-label="Move down"
									>
										<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
										</svg>
									</button>
								</form>
							{/if}
							<form method="POST" action="?/deleteChecklistItem" use:enhance>
								<input type="hidden" name="ci_id" value={ci.id} />
								<button
									type="submit"
									class="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600"
									title="Delete"
									aria-label="Delete"
								>
									<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							</form>
						</div>
					{/each}
				</div>
			{:else}
				<p class="mt-2 text-xs text-slate-400 italic">No items yet.</p>
			{/if}

			<form
				method="POST"
				action="?/addChecklistItem"
				use:enhance={() =>
					async ({ result, update, formElement }) => {
						await update({ reset: false });
						if (result.type === 'success') {
							formElement.reset();
						}
					}}
				class="mt-3 flex gap-2"
			>
				<input
					type="text"
					name="text"
					required
					placeholder="Add item..."
					class="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				/>
				<button
					type="submit"
					class="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
				>
					Add
				</button>
			</form>
		</div>
	{/if}

	<!-- Assigned to -->
	{#if data.item.assigned_to.length > 0}
		<div class="rounded-lg border border-slate-200 bg-white p-4">
			<h3 class="text-xs font-medium text-slate-500 uppercase">Assigned To</h3>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each data.item.assigned_to as memberId}
					<span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
						{memberName(memberId)}
					</span>
				{/each}
			</div>
		</div>
	{/if}
</div>
