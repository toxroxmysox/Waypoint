<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Day } from '$lib/types';

	let { data, form } = $props();

	let editing = $state(false);
	let loading = $state(false);
	let error = $derived(form?.error ?? '');
	let success = $derived(form?.success ?? false);

	function dayLabel(d: Day): string {
		return new Date(d.date).toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<div class="space-y-4">
	<a
		href="/trips/{data.trip.slug}/phases"
		class="text-sm text-slate-500 hover:text-slate-700"
	>
		&larr; All phases
	</a>

	{#if error}
		<div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
	{/if}

	{#if success}
		<div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Phase updated.</div>
	{/if}

	<!-- Phase header -->
	<div class="rounded-lg border border-slate-200 bg-white p-4">
		<div class="flex items-start justify-between">
			<div class="flex items-center gap-2">
				{#if data.phase.color}
					<span
						class="h-4 w-4 rounded-full"
						style="background-color: {data.phase.color}"
					></span>
				{/if}
				<h2 class="text-lg font-semibold text-slate-900">{data.phase.name}</h2>
			</div>
			<button
				type="button"
				onclick={() => (editing = !editing)}
				class="text-sm text-slate-500 hover:text-slate-700"
			>
				{editing ? 'Cancel' : 'Edit'}
			</button>
		</div>
		{#if data.phase.location}
			<p class="mt-1 text-sm text-slate-500">{data.phase.location}</p>
		{/if}
		<p class="mt-1 text-xs text-slate-400">
			{new Date(data.phase.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} -
			{new Date(data.phase.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
		</p>
	</div>

	{#if editing}
		<form
			method="POST"
			action="?/update"
			use:enhance={() => {
				loading = true;
				return async ({ result, update }) => {
					loading = false;
					if (result.type === 'success') editing = false;
					await update();
				};
			}}
			class="rounded-lg border border-slate-200 bg-white p-4 space-y-3"
		>
			<div>
				<label for="name" class="block text-sm font-medium text-slate-700">Name</label>
				<input
					type="text"
					id="name"
					name="name"
					required
					value={data.phase.name}
					class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				/>
			</div>

			<div>
				<label for="location" class="block text-sm font-medium text-slate-700">Location</label>
				<input
					type="text"
					id="location"
					name="location"
					value={data.phase.location}
					class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				/>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div>
					<label for="start_date" class="block text-sm font-medium text-slate-700">Start</label>
					<input
						type="date"
						id="start_date"
						name="start_date"
						required
						value={data.phase.start_date.split('T')[0].split(' ')[0]}
						class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					/>
				</div>
				<div>
					<label for="end_date" class="block text-sm font-medium text-slate-700">End</label>
					<input
						type="date"
						id="end_date"
						name="end_date"
						required
						value={data.phase.end_date.split('T')[0].split(' ')[0]}
						class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					/>
				</div>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div>
					<label for="country_code" class="block text-sm font-medium text-slate-700">Country Code</label>
					<input
						type="text"
						id="country_code"
						name="country_code"
						maxlength="2"
						value={data.phase.country_code}
						class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					/>
				</div>
				<div>
					<label for="color" class="block text-sm font-medium text-slate-700">Color</label>
					<input
						type="color"
						id="color"
						name="color"
						value={data.phase.color || '#6b7280'}
						class="mt-1 block h-10 w-full rounded-md border border-slate-300 bg-white px-1 shadow-sm"
					/>
				</div>
			</div>

			<button
				type="submit"
				disabled={loading}
				class="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
			>
				{loading ? 'Saving...' : 'Save Changes'}
			</button>
		</form>
	{/if}

	<!-- Days in this phase -->
	<section>
		<h3 class="mb-2 text-sm font-medium text-slate-500 uppercase">
			Days ({data.phaseDays.length})
		</h3>
		{#if data.phaseDays.length === 0}
			<p class="text-sm text-slate-400">No days fall within this phase's date range.</p>
		{:else}
			<div class="space-y-1">
				{#each data.phaseDays as day}
					{@const dayItems = data.phaseItems.filter((it) => it.day === day.id)}
					<a
						href="/trips/{data.trip.slug}/days/{day.id}"
						class="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2"
					>
						<span class="text-sm text-slate-900">{dayLabel(day)}</span>
						{#if dayItems.length > 0}
							<span class="text-xs text-slate-400">{dayItems.length} items</span>
						{/if}
					</a>
				{/each}
			</div>
		{/if}
	</section>
</div>
