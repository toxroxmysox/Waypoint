<script lang="ts">
	let { data } = $props();

	function formatDateRange(start: string, end: string): string {
		const s = new Date(start);
		const e = new Date(end);
		const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
		const startStr = s.toLocaleDateString('en-US', opts);
		const endStr = e.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
		return `${startStr} - ${endStr}`;
	}
</script>

<div class="mx-auto max-w-lg">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-xl font-bold text-slate-900">Trips</h1>
		<a
			href="/trips/new"
			class="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
		>
			New Trip
		</a>
	</div>

	{#if data.active.length === 0 && data.upcoming.length === 0 && data.past.length === 0}
		<div class="py-12 text-center text-slate-500">
			<p class="text-lg">No trips yet</p>
			<p class="mt-1 text-sm">Create your first trip to get started.</p>
		</div>
	{/if}

	{#if data.active.length > 0}
		<section class="mb-6">
			<h2 class="mb-2 text-sm font-medium text-slate-500 uppercase">Active</h2>
			{#each data.active as { trip }}
				<a
					href="/trips/{trip?.slug}"
					class="mb-2 block rounded-lg border border-green-200 bg-green-50 p-4"
				>
					<h3 class="font-semibold text-slate-900">{trip?.title}</h3>
					<p class="mt-1 text-sm text-slate-600">
						{formatDateRange(trip?.start_date ?? '', trip?.end_date ?? '')}
					</p>
					{#if trip?.location_summary}
						<p class="mt-0.5 text-sm text-slate-500">{trip.location_summary}</p>
					{/if}
				</a>
			{/each}
		</section>
	{/if}

	{#if data.upcoming.length > 0}
		<section class="mb-6">
			<h2 class="mb-2 text-sm font-medium text-slate-500 uppercase">Upcoming</h2>
			{#each data.upcoming as { trip }}
				<a
					href="/trips/{trip?.slug}"
					class="mb-2 block rounded-lg border border-slate-200 bg-white p-4"
				>
					<h3 class="font-semibold text-slate-900">{trip?.title}</h3>
					<p class="mt-1 text-sm text-slate-600">
						{formatDateRange(trip?.start_date ?? '', trip?.end_date ?? '')}
					</p>
					{#if trip?.location_summary}
						<p class="mt-0.5 text-sm text-slate-500">{trip.location_summary}</p>
					{/if}
				</a>
			{/each}
		</section>
	{/if}

	{#if data.past.length > 0}
		<section>
			<h2 class="mb-2 text-sm font-medium text-slate-500 uppercase">Past</h2>
			{#each data.past as { trip }}
				<a
					href="/trips/{trip?.slug}"
					class="mb-2 block rounded-lg border border-slate-200 bg-slate-100 p-4 opacity-75"
				>
					<h3 class="font-semibold text-slate-900">{trip?.title}</h3>
					<p class="mt-1 text-sm text-slate-600">
						{formatDateRange(trip?.start_date ?? '', trip?.end_date ?? '')}
					</p>
					{#if trip?.location_summary}
						<p class="mt-0.5 text-sm text-slate-500">{trip.location_summary}</p>
					{/if}
				</a>
			{/each}
		</section>
	{/if}
</div>
