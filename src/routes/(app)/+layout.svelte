<script lang="ts">
	import BottomNav from '$lib/components/BottomNav.svelte';
	import Header from '$lib/components/Header.svelte';

	let { data, children } = $props();
</script>

<div class="flex min-h-dvh flex-col bg-slate-50">
	<Header user={data.user} />
	<main class="flex-1 px-4 pb-20 pt-4">
		{@render children()}
	</main>
	<BottomNav />
</div>
