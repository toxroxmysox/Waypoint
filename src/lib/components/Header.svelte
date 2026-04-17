<script lang="ts">
	import type { User } from '$lib/types';

	let { user }: { user: User | null } = $props();
</script>

<header class="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
	<a href="/trips" class="text-lg font-bold text-slate-900">Waypoint</a>
	{#if user}
		<div class="flex items-center gap-3">
			<span class="text-sm text-slate-500">{user.name || user.email}</span>
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
