<script lang="ts">
	import { page } from '$app/state';
	import type { MemberRole } from '$lib/types';

	let { slug, role = '' }: { slug: string; role?: MemberRole | string } = $props();

	const isOwnerOrCoOwner = $derived(role === 'owner' || role === 'co_owner');

	const tabs = $derived([
		{ id: 'overview', label: 'Overview', href: `/trips/${slug}` },
		{ id: 'phases', label: 'Phases', href: `/trips/${slug}/phases` },
		{ id: 'members', label: 'Members', href: `/trips/${slug}/members` },
		...(isOwnerOrCoOwner ? [{ id: 'inbox', label: 'Inbox', href: `/trips/${slug}/inbox` }] : []),
		{ id: 'settings', label: 'Settings', href: `/trips/${slug}/settings` }
	]);

	let activeId = $derived.by(() => {
		const path = page.url.pathname;
		if (path.endsWith('/settings')) return 'settings';
		if (path.includes('/inbox')) return 'inbox';
		if (path.includes('/members')) return 'members';
		if (path.includes('/phases')) return 'phases';
		return 'overview';
	});
</script>

<nav class="border-line bg-paper/95 sticky top-[57px] z-dropdown flex gap-1 overflow-x-auto border-b px-4 backdrop-blur">
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
