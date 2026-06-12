<script lang="ts">
	import AppShell from '$lib/shell/components/AppShell.svelte';
	import { page } from '$app/state';

	let { data, children } = $props();

	// Swipe minigames (harvest deck + goal-capture wizard) take over the full
	// screen — suppress the app chrome so the deck isn't pushed below the fold.
	const immersive = $derived(
		page.url.pathname.includes('/swipe/') || page.url.pathname.endsWith('/goals/capture')
	);
</script>

<svelte:head>
	<title>{data.trip.title} — Waypoint</title>
</svelte:head>

<AppShell
	slug={data.trip.slug}
	role={data.membership.role}
	trip={data.trip}
	phases={data.phases}
	days={data.days}
	{immersive}
>
	{@render children()}
</AppShell>
