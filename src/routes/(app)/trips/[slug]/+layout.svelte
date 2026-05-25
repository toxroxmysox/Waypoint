<script lang="ts">
	import AppShell from '$lib/components/ui/AppShell.svelte';

	let { data, children } = $props();
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
>
	{@render children()}
</AppShell>
