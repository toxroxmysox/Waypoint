<script lang="ts">
	import NavBar from '$lib/ui/NavBar.svelte';
	import SubTabs from '$lib/ui/SubTabs.svelte';
	import TripModeCard from '$lib/trip-mode/components/TripModeCard.svelte';
	import Card from '$lib/ui/Card.svelte';
	import NotificationBell from '$lib/collaboration/components/NotificationBell.svelte';
	import { getTripModeState } from '$lib/trip-mode/trip-mode';
	import { untrack } from 'svelte';
	import type { Notification } from '$lib/types';

	let { data } = $props();

	let notifications = $state<Notification[]>(untrack(() => data.notifications ?? []));
	let unreadCount = $state(untrack(() => data.unreadCount ?? 0));
	// #297: re-seed from server data so persisted read_at survives navigation.
	$effect(() => {
		notifications = data.notifications ?? [];
		unreadCount = data.unreadCount ?? 0;
	});

	const now = new Date(untrack(() => data.now));
	const tripMode = $derived(getTripModeState(data.items, data.days, now));

	function dayLabel(dateStr: string): string {
		return new Date(dateStr.replace(' ', 'T')).toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}
</script>

<NavBar
	title="Upcoming"
	subtitle={data.trip.title}
	subtitleStyle="tagline"
	back
	backHref="/trips/{data.trip.slug}/now"
>
	{#snippet right()}
		<NotificationBell bind:notifications bind:unreadCount />
	{/snippet}
</NavBar>

<!-- #244: the "Today" sub-tab is the merged Now view at /now (not the old /today,
     which now redirects there). "Next 3 days" stays on this /today/upcoming route. -->
<SubTabs tabs={[
	{ id: 'today', label: 'Today', href: `/trips/${data.trip.slug}/now` },
	{ id: 'upcoming', label: 'Next 3 Days', href: `/trips/${data.trip.slug}/today/upcoming` }
]} />

<!-- #84: reserve the home-indicator safe area so the fixed bottom nav doesn't clip the last items -->
<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] space-y-6">
	{#if tripMode.timeline.upcomingDays.length === 0}
		<Card>
			<div class="p-6 text-center">
				<p class="text-ink-muted text-sm">No upcoming days within the next 3 days.</p>
			</div>
		</Card>
	{:else}
		{#each tripMode.timeline.upcomingDays as group}
			<section class="space-y-2">
				<h2 class="font-display text-ink text-lg font-semibold">{dayLabel(group.day.date)}</h2>
				{#if group.items.length === 0}
					<p class="text-ink-muted text-sm">Nothing scheduled.</p>
				{:else}
					{#each group.items as item}
						<TripModeCard {item} slug={data.trip.slug} />
					{/each}
				{/if}
			</section>
		{/each}
	{/if}
</main>
