<script lang="ts">
	import { page } from '$app/state';

	let { slug, role = '' }: { slug: string; role?: string } = $props();

	const tabs = $derived([
		{ id: 'itinerary', label: 'Itinerary', href: `/trips/${slug}` },
		{ id: 'money', label: 'Money', href: `/trips/${slug}/expenses` },
		{ id: 'members', label: 'Members', href: `/trips/${slug}/members` },
		{ id: 'more', label: 'More', href: `/trips/${slug}/more` }
	]);

	let activeTab = $derived.by(() => {
		const path = page.url.pathname;
		if (path.includes('/expenses') || path.includes('/budget')) return 'money';
		if (path.includes('/members')) return 'members';
		if (path.includes('/more') || path.includes('/inbox') || path.includes('/settings')) return 'more';
		return 'itinerary';
	});
</script>

<nav class="border-line bg-surface fixed left-0 top-0 hidden h-full w-[72px] flex-col items-center gap-1 border-r pt-5 md-desktop:flex">
	<a href="/trips" class="font-display text-moss mb-4 text-lg font-semibold">W</a>

	{#each tabs as tab}
		{@const active = activeTab === tab.id}
		<a
			href={tab.href}
			class="flex w-14 flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[10px] font-medium transition-colors
				{active ? 'bg-moss-tint text-moss' : 'text-ink-muted hover:bg-paper hover:text-ink-soft'}"
			aria-current={active ? 'page' : undefined}
		>
			{#if tab.id === 'itinerary'}
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
					<line x1="16" y1="2" x2="16" y2="6" />
					<line x1="8" y1="2" x2="8" y2="6" />
					<line x1="3" y1="10" x2="21" y2="10" />
				</svg>
			{:else if tab.id === 'money'}
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<line x1="12" y1="1" x2="12" y2="23" />
					<path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
				</svg>
			{:else if tab.id === 'members'}
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
					<circle cx="9" cy="7" r="4" />
					<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
					<path d="M16 3.13a4 4 0 0 1 0 7.75" />
				</svg>
			{:else if tab.id === 'more'}
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="1" />
					<circle cx="12" cy="5" r="1" />
					<circle cx="12" cy="19" r="1" />
				</svg>
			{/if}
			<span>{tab.label}</span>
		</a>
	{/each}
</nav>
