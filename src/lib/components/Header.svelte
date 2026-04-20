<script lang="ts">
	import { page } from '$app/state';
	import type { User } from '$lib/types';

	let { user }: { user: User | null } = $props();

	let tripsActive = $derived(page.url.pathname.startsWith('/trips'));
</script>

<header class="sticky top-0 z-30 grid grid-cols-3 items-center border-b border-slate-200 bg-white px-4 py-3">
	<a href="/trips" class="justify-self-start text-lg font-bold text-slate-900">Waypoint</a>
	<nav class="justify-self-center">
		<a
			href="/trips"
			class="rounded-md px-3 py-1 text-sm font-medium {tripsActive
				? 'bg-slate-100 text-slate-900'
				: 'text-slate-500 hover:text-slate-900'}"
		>
			Trips
		</a>
	</nav>
	{#if user}
		<div class="flex items-center gap-3 justify-self-end">
			<span class="hidden text-sm text-slate-500 sm:inline">{user.name || user.email}</span>
			<form method="POST" action="/logout">
				<button
					type="submit"
					class="text-sm text-slate-400 hover:text-slate-600"
				>
					Sign out
				</button>
			</form>
		</div>
	{/if}
</header>
