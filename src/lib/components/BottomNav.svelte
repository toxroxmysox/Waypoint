<script lang="ts">
	import { page } from '$app/state';

	const links = [
		{ href: '/trips', label: 'Trips', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
	];
</script>

<nav class="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
	<div class="flex items-center justify-around py-2">
		{#each links as link}
			{@const active = page.url.pathname.startsWith(link.href)}
			<a
				href={link.href}
				class="flex flex-col items-center gap-0.5 px-3 py-1 text-xs {active ? 'text-slate-900' : 'text-slate-400'}"
			>
				<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d={link.icon} />
				</svg>
				{link.label}
			</a>
		{/each}
	</div>
</nav>
