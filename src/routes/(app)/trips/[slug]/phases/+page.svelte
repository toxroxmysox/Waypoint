<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let showCreate = $state(false);
	let loading = $state(false);
	let error = $derived(form?.error ?? '');
	let confirmDeleteId = $state<string | null>(null);

	function formatDateRange(start: string, end: string): string {
		const s = new Date(start.replace(' ', 'T'));
		const e = new Date(end.replace(' ', 'T'));
		const startStr = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
		const endStr = e.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		});
		return `${startStr} - ${endStr}`;
	}

	// Inclusive day span. Single-day phases drop the nights label since
	// "1 day · 0 nights" reads wrong for something like a day trip.
	function daysNightsLabel(start: string, end: string): string {
		const s = new Date(start.substring(0, 10) + 'T00:00:00.000Z');
		const e = new Date(end.substring(0, 10) + 'T00:00:00.000Z');
		const days = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
		if (days <= 1) return '1 day';
		return `${days} days · ${days - 1} night${days - 1 === 1 ? '' : 's'}`;
	}
</script>

<div class="space-y-4">
	{#if error}
		<div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
	{/if}

	<div class="flex items-center justify-between">
		<h2 class="text-sm font-medium text-slate-500 uppercase">
			{data.phases.length} Phase{data.phases.length !== 1 ? 's' : ''}
		</h2>
		<button
			type="button"
			onclick={() => (showCreate = !showCreate)}
			class="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
		>
			{showCreate ? 'Cancel' : 'Add Phase'}
		</button>
	</div>

	{#if showCreate}
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				loading = true;
				return async ({ result, update }) => {
					loading = false;
					if (result.type === 'success') {
						showCreate = false;
					}
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
					class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					placeholder="Barcelona"
				/>
			</div>

			<div>
				<label for="location" class="block text-sm font-medium text-slate-700">Location</label>
				<input
					type="text"
					id="location"
					name="location"
					class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					placeholder="Barcelona, Spain"
				/>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="min-w-0">
					<label for="start_date" class="block text-sm font-medium text-slate-700">Start</label>
					<input
						type="date"
						id="start_date"
						name="start_date"
						required
						class="mt-1 block w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					/>
				</div>
				<div class="min-w-0">
					<label for="end_date" class="block text-sm font-medium text-slate-700">End</label>
					<input
						type="date"
						id="end_date"
						name="end_date"
						required
						class="mt-1 block w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					/>
				</div>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div>
					<label for="country_code" class="block text-sm font-medium text-slate-700"
						>Country Code</label
					>
					<input
						type="text"
						id="country_code"
						name="country_code"
						maxlength="2"
						class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
						placeholder="ES"
					/>
				</div>
				<div>
					<label for="color" class="block text-sm font-medium text-slate-700">Color</label>
					<input
						type="color"
						id="color"
						name="color"
						value="#6b7280"
						class="mt-1 block h-10 w-full rounded-md border border-slate-300 bg-white px-1 shadow-sm"
					/>
				</div>
			</div>

			<button
				type="submit"
				disabled={loading}
				class="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
			>
				{loading ? 'Creating...' : 'Create Phase'}
			</button>
		</form>
	{/if}

	{#if data.phases.length === 0 && !showCreate}
		<div class="rounded-lg border border-dashed border-slate-300 p-8 text-center">
			<p class="text-sm text-slate-500">No phases yet. Add phases to organize your trip by location or leg.</p>
		</div>
	{/if}

	<div class="space-y-2">
		{#each data.phases as phase, i}
			<div class="rounded-lg border border-slate-200 bg-white p-4">
				<div class="flex items-start justify-between">
					<a
						href="/trips/{data.trip.slug}/phases/{phase.id}"
						class="flex-1"
					>
						<div class="flex items-center gap-2">
							{#if phase.color}
								<span
									class="h-3 w-3 rounded-full"
									style="background-color: {phase.color}"
								></span>
							{/if}
							<h3 class="font-medium text-slate-900">{phase.name}</h3>
						</div>
						<p class="mt-1 text-xs text-slate-500">
							{formatDateRange(phase.start_date, phase.end_date)}
							&middot; {daysNightsLabel(phase.start_date, phase.end_date)}
							{#if phase.location}
								&middot; {phase.location}
							{/if}
						</p>
					</a>

					<div class="flex items-center gap-1">
						<!-- Reorder buttons -->
						{#if i > 0}
							<form method="POST" action="?/reorder" use:enhance>
								<input type="hidden" name="phase_id" value={phase.id} />
								<input type="hidden" name="direction" value="up" />
								<button
									type="submit"
									class="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
									title="Move up"
								>
									<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
									</svg>
								</button>
							</form>
						{/if}
						{#if i < data.phases.length - 1}
							<form method="POST" action="?/reorder" use:enhance>
								<input type="hidden" name="phase_id" value={phase.id} />
								<input type="hidden" name="direction" value="down" />
								<button
									type="submit"
									class="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
									title="Move down"
								>
									<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
									</svg>
								</button>
							</form>
						{/if}

						<!-- Delete -->
						{#if confirmDeleteId === phase.id}
							<form
								method="POST"
								action="?/delete"
								use:enhance={() => {
									return async ({ update }) => {
										confirmDeleteId = null;
										await update();
									};
								}}
								class="flex items-center gap-1"
							>
								<input type="hidden" name="phase_id" value={phase.id} />
								<button
									type="submit"
									class="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
									title="Confirm delete"
								>
									Delete?
								</button>
								<button
									type="button"
									onclick={() => (confirmDeleteId = null)}
									class="rounded px-2 py-1 text-xs text-slate-500 hover:text-slate-700"
								>
									Cancel
								</button>
							</form>
						{:else}
							<button
								type="button"
								onclick={() => (confirmDeleteId = phase.id)}
								class="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
								title="Delete phase"
							>
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
								</svg>
							</button>
						{/if}
					</div>
				</div>
			</div>
		{/each}
	</div>
</div>
