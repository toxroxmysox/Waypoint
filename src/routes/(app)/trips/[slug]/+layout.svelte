<script lang="ts">
	import AppShell from '$lib/shell/components/AppShell.svelte';
	import { page } from '$app/state';
	import { prefetchTrip } from '$lib/documents/offline-cache';

	let { data, children } = $props();

	// Swipe minigames (harvest deck + goal-capture wizard) take over the full
	// screen — suppress the app chrome so the deck isn't pushed below the fold.
	const immersive = $derived(
		page.url.pathname.includes('/swipe/') || page.url.pathname.endsWith('/goals/capture')
	);

	// Whole-trip offline prefetch (#254): on app-open into an ACTIVE trip (from
	// ANY Trip-Mode surface — not just the Documents tab, today's bug), ask the SW
	// to best-effort cache the entire trip. `offlinePrefetchUrls` is non-empty only
	// for the active trip (server-gated on the tz-correct isTripActive, #167).
	// Fire ONCE per trip slug so in-trip navigation doesn't re-post every hop.
	let prefetchedSlug = $state<string | null>(null);
	$effect(() => {
		const urls = data.offlinePrefetchUrls;
		if (!urls?.length || prefetchedSlug === data.trip.slug) return;
		prefetchedSlug = data.trip.slug;
		prefetchTrip(urls);
	});
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
