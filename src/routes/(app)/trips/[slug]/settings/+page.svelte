<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let loading = $state(false);
	let deleting = $state(false);
	let confirmDelete = $state(false);
	let error = $derived(form?.error ?? '');
	let success = $derived(form?.success ?? false);
</script>

<div class="space-y-6">
	{#if error}
		<div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
	{/if}

	{#if success}
		<div class="rounded-md bg-green-50 p-3 text-sm text-green-700">Trip updated.</div>
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
		<div>
			<label for="title" class="block text-sm font-medium text-slate-700">Trip Name</label>
			<input
				type="text"
				id="title"
				name="title"
				required
				value={data.trip.title}
				class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
			/>
		</div>

		<div class="grid grid-cols-2 gap-3">
			<div>
				<label for="start_date" class="block text-sm font-medium text-slate-700">Start Date</label>
				<input
					type="date"
					id="start_date"
					name="start_date"
					required
					value={data.trip.start_date.split('T')[0].split(' ')[0]}
					class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				/>
			</div>
			<div>
				<label for="end_date" class="block text-sm font-medium text-slate-700">End Date</label>
				<input
					type="date"
					id="end_date"
					name="end_date"
					required
					value={data.trip.end_date.split('T')[0].split(' ')[0]}
					class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				/>
			</div>
		</div>

		<div>
			<label for="timezone" class="block text-sm font-medium text-slate-700">Timezone</label>
			<input
				type="text"
				id="timezone"
				name="timezone"
				value={data.trip.timezone}
				class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				placeholder="Europe/Madrid"
			/>
		</div>

		<div>
			<label for="location_summary" class="block text-sm font-medium text-slate-700">Location</label>
			<input
				type="text"
				id="location_summary"
				name="location_summary"
				value={data.trip.location_summary}
				class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				placeholder="Spain"
			/>
		</div>

		<button
			type="submit"
			disabled={loading}
			class="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
		>
			{loading ? 'Saving...' : 'Save Changes'}
		</button>
	</form>

	<!-- Danger zone -->
	<div class="rounded-lg border border-red-200 p-4">
		<h3 class="text-sm font-medium text-red-700">Danger Zone</h3>
		<p class="mt-1 text-xs text-red-600">
			Deleting a trip removes all phases, days, and items permanently.
		</p>
		{#if !confirmDelete}
			<button
				type="button"
				onclick={() => (confirmDelete = true)}
				class="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
			>
				Delete Trip
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
				class="mt-3 flex items-center gap-2"
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
