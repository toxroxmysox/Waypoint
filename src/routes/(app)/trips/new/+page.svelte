<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();

	let title = $state('');
	let slug = $state('');
	let loading = $state(false);
	let error = $derived(form?.error ?? '');

	function generateSlug(value: string): string {
		return value
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '');
	}

	function handleTitleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		title = target.value;
		slug = generateSlug(title);
	}
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
				value={title}
				oninput={handleTitleInput}
				class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				placeholder="Spain 2026"
			/>
		</div>

		<div>
			<label for="slug" class="block text-sm font-medium text-slate-700">URL Slug</label>
			<input
				type="text"
				id="slug"
				name="slug"
				required
				bind:value={slug}
				pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
				class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				placeholder="spain-2026"
			/>
			<p class="mt-1 text-xs text-slate-400">waypoint.app/trips/{slug || '...'}</p>
		</div>

		<div class="grid grid-cols-2 gap-3">
			<div>
				<label for="start_date" class="block text-sm font-medium text-slate-700">Start Date</label>
				<input
					type="date"
					id="start_date"
					name="start_date"
					required
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
				class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				placeholder="Spain"
			/>
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
