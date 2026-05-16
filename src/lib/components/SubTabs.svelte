<script lang="ts">
	import { page } from '$app/state';

	let { tabs }: { tabs: Array<{ id: string; label: string; href: string }> } = $props();

	let activeId = $derived.by(() => {
		const path = page.url.pathname;
		for (let i = tabs.length - 1; i >= 0; i--) {
			if (path.startsWith(tabs[i].href) || path === tabs[i].href) return tabs[i].id;
		}
		return tabs[0]?.id;
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
