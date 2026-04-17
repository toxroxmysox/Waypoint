<script lang="ts">
	import { itemFieldConfig, itemTypeLabels } from '$lib/config/item-fields';

	let { data } = $props();

	let fields = $derived(itemFieldConfig[data.item.type]);

	function formatTime(t: string): string {
		if (!t) return '';
		const [h, m] = t.split(':');
		const hour = parseInt(h);
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
		<a
			href="/trips/{data.trip.slug}/items/{data.item.id}/edit"
			class="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
		>
			Edit
		</a>
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
							{data.item.subtype.replace(/_/g, ' ')}
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

	<!-- Schedule info -->
	{#if data.itemDay || data.itemPhase || data.item.start_time}
		<div class="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
			<h3 class="text-xs font-medium text-slate-500 uppercase">Schedule</h3>
			{#if data.itemDay}
				<p class="text-sm text-slate-700">
					{new Date(data.itemDay.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
					<span class="text-slate-400">&middot; {data.item.slot}</span>
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
			{#if data.item.start_time}
				<p class="text-sm text-slate-700">
					{formatTime(data.item.start_time)}{data.item.end_time ? ` - ${formatTime(data.item.end_time)}` : ''}
				</p>
			{/if}
		</div>
	{/if}

	<!-- Location -->
	{#if data.item.location_name || data.item.location_address}
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
	{#if data.item.type === 'checklist' && data.checklistItems.length > 0}
		<div class="rounded-lg border border-slate-200 bg-white p-4">
			<h3 class="text-xs font-medium text-slate-500 uppercase">Checklist</h3>
			<div class="mt-2 space-y-1">
				{#each data.checklistItems as ci}
					<div class="flex items-center gap-2">
						<input
							type="checkbox"
							checked={!!ci.checked_by}
							disabled
							class="rounded border-slate-300"
						/>
						<span class="text-sm {ci.checked_by ? 'text-slate-400 line-through' : 'text-slate-700'}">
							{ci.text}
						</span>
					</div>
				{/each}
			</div>
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
