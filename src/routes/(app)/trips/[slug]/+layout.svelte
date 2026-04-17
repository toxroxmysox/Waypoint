<script lang="ts">
	import { page } from '$app/state';

	let { data, children } = $props();

	let activeTab = $derived(() => {
		const path = page.url.pathname;
		if (path.endsWith('/settings')) return 'settings';
		if (path.includes('/phases')) return 'phases';
		if (path.includes('/days')) return 'days';
		if (path.includes('/items')) return 'items';
		return 'overview';
	});

	const tabs = $derived([
		{ id: 'overview', label: 'Overview', href: `/trips/${data.trip.slug}` },
		{ id: 'phases', label: 'Phases', href: `/trips/${data.trip.slug}/phases` },
		{ id: 'settings', label: 'Settings', href: `/trips/${data.trip.slug}/settings` }
	]);
</script>

<div>
	<div class="mb-4">
		<a href="/trips" class="text-sm text-slate-500 hover:text-slate-700">&larr; Back to trips</a>
		<h1 class="mt-1 text-xl font-bold text-slate-900">{data.trip.title}</h1>
		{#if data.trip.location_summary}
			<p class="text-sm text-slate-500">{data.trip.location_summary}</p>
		{/if}
	</div>

	<nav class="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4">
		{#each tabs as tab}
			<a
				href={tab.href}
				class="whitespace-nowrap border-b-2 px-3 pb-2 text-sm font-medium {activeTab() === tab.id
					? 'border-slate-900 text-slate-900'
					: 'border-transparent text-slate-500 hover:text-slate-700'}"
			>
				{tab.label}
			</a>
		{/each}
	</nav>

	{@render children()}
</div>
