<script lang="ts">
	import { page } from '$app/state';

	let { slug }: { slug: string } = $props();

	const tabs = $derived([
		{ id: 'overview', label: 'Overview', href: `/trips/${slug}` },
		{ id: 'phases', label: 'Phases', href: `/trips/${slug}/phases` },
		{ id: 'settings', label: 'Settings', href: `/trips/${slug}/settings` }
	]);

	let activeId = $derived.by(() => {
		const path = page.url.pathname;
		if (path.endsWith('/settings')) return 'settings';
		if (path.includes('/phases')) return 'phases';
		return 'overview';
	});
</script>

<nav class="border-line bg-paper/95 sticky top-[57px] z-20 flex gap-1 overflow-x-auto border-b px-4 backdrop-blur">
	{#each tabs as tab}
		{@const active = activeId === tab.id}
		<a
			href={tab.href}
			class="-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-semibold {active
				? 'border-ink text-ink'
				: 'text-ink-muted hover:text-ink-soft border-transparent'}"
		>
			{tab.label}
		</a>
	{/each}
</nav>
