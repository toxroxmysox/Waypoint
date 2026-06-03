<script lang="ts">
	import NavBar from '$lib/ui/NavBar.svelte';

	let { data } = $props();
</script>

<NavBar title="Now" subtitle={data.trip.title} subtitleStyle="tagline" />

<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-8">
	<div class="rounded-xl border border-line bg-surface p-6 text-center">
		<p class="text-ink-soft font-semibold">Trip Mode — Now</p>
		<p class="text-ink-muted mt-1 text-sm">Coming soon.</p>
	</div>
</main>
