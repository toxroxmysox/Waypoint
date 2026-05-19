<script lang="ts">
	import BottomNav from '$lib/components/BottomNav.svelte';

	let { data, children } = $props();
</script>

<svelte:head>
	<title>{data.trip.title} — Waypoint</title>
</svelte:head>

{@render children()}

<BottomNav slug={data.trip.slug} role={data.membership.role} />

<div class="h-16"></div>
