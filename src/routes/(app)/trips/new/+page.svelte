<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';

	let { form } = $props();

	let title = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let timezone = $state('');
	let loading = $state(false);
	let error = $derived(form?.error ?? '');

	onMount(() => {
		timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});

	let duration = $derived(
		startDate && endDate
			? Math.max(Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1, 0)
			: null
	);
</script>

<div class="mx-auto max-w-lg">
	<div class="mb-6">
		<a href="/trips" class="text-sm text-slate-500 hover:text-slate-700">&larr; Back to trips</a>
		<h1 class="mt-2 text-xl font-bold text-slate-900">New Trip</h1>
	</div>

	{#if error}
		<div class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
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
		<div>
			<label for="title" class="block text-sm font-medium text-slate-700">Trip Name</label>
			<input
				type="text"
				id="title"
				name="title"
				required
				bind:value={title}
				class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				placeholder="Spain 2026"
			/>
		</div>

		<div>
			<div class="flex items-end gap-3">
				<div class="min-w-0 flex-1">
					<label for="start_date" class="block text-sm font-medium text-slate-700"
						>Start Date</label
					>
					<input
						type="date"
						id="start_date"
						name="start_date"
						required
						bind:value={startDate}
						max={endDate || undefined}
						class="mt-1 block w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					/>
				</div>
				<div class="pb-2 text-sm text-slate-400">
					{#if duration}
						{duration} {duration === 1 ? 'day' : 'days'}
					{:else}
						→
					{/if}
				</div>
				<div class="min-w-0 flex-1">
					<label for="end_date" class="block text-sm font-medium text-slate-700">End Date</label>
					<input
						type="date"
						id="end_date"
						name="end_date"
						required
						bind:value={endDate}
						min={startDate || undefined}
						class="mt-1 block w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					/>
				</div>
			</div>
		</div>

		<div>
			<label for="timezone" class="block text-sm font-medium text-slate-700">Timezone</label>
			<input
				type="text"
				id="timezone"
				name="timezone"
				list="timezone-list"
				bind:value={timezone}
				class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				placeholder="America/Chicago"
			/>
			<datalist id="timezone-list">
				<option value="America/New_York"></option>
				<option value="America/Chicago"></option>
				<option value="America/Denver"></option>
				<option value="America/Los_Angeles"></option>
				<option value="America/Phoenix"></option>
				<option value="America/Anchorage"></option>
				<option value="Pacific/Honolulu"></option>
				<option value="Europe/London"></option>
				<option value="Europe/Paris"></option>
				<option value="Europe/Berlin"></option>
				<option value="Europe/Madrid"></option>
				<option value="Europe/Rome"></option>
				<option value="Europe/Amsterdam"></option>
				<option value="Europe/Zurich"></option>
				<option value="Europe/Athens"></option>
				<option value="Europe/Istanbul"></option>
				<option value="Asia/Dubai"></option>
				<option value="Asia/Kolkata"></option>
				<option value="Asia/Bangkok"></option>
				<option value="Asia/Singapore"></option>
				<option value="Asia/Shanghai"></option>
				<option value="Asia/Tokyo"></option>
				<option value="Asia/Seoul"></option>
				<option value="Australia/Sydney"></option>
				<option value="Pacific/Auckland"></option>
			</datalist>
			<p class="mt-1 text-xs text-slate-400">Leave blank to use your local timezone.</p>
		</div>

		<div>
			<label for="location_summary" class="block text-sm font-medium text-slate-700"
				>Location <span class="font-normal text-slate-400">(optional)</span></label
			>
			<input
				type="text"
				id="location_summary"
				name="location_summary"
				class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				placeholder="Spain & Portugal"
			/>
			<p class="mt-1 text-xs text-slate-400">
				Freeform label — city, country, region, whatever fits.
			</p>
		</div>

		<button
			type="submit"
			disabled={loading}
			class="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
		>
			{loading ? 'Creating...' : 'Create Trip'}
		</button>
	</form>
</div>
