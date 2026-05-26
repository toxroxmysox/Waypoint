<script lang="ts">
	import type { Item } from '$lib/types';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import SubTabs from '$lib/components/SubTabs.svelte';
	import TripModeCard from '$lib/components/TripModeCard.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import NotificationBell from '$lib/components/ui/NotificationBell.svelte';
	import { untrack } from 'svelte';
	import type { Notification } from '$lib/types';

	let { data } = $props();

	let notifications = $state<Notification[]>(untrack(() => data.notifications ?? []));
	let unreadCount = $state(untrack(() => data.unreadCount ?? 0));

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
	backHref="/trips/{data.trip.slug}/today"
>
	{#snippet right()}
		<NotificationBell bind:notifications bind:unreadCount />
	{/snippet}
</NavBar>

<SubTabs tabs={[
	{ id: 'today', label: 'Today', href: `/trips/${data.trip.slug}/today` },
	{ id: 'upcoming', label: 'Next 3 Days', href: `/trips/${data.trip.slug}/today/upcoming` }
]} />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8 space-y-6">
	{#if data.upcomingDays.length === 0}
		<Card>
			<div class="p-6 text-center">
				<p class="text-ink-muted text-sm">No upcoming days within the next 3 days.</p>
			</div>
		</Card>
	{:else}
		{#each data.upcomingDays as day}
			{@const dayItems = data.upcomingItems.filter((i: Item) => i.day === day.id)}
			<section class="space-y-2">
				<h2 class="font-display text-ink text-lg font-semibold">{dayLabel(day.date)}</h2>
				{#if dayItems.length === 0}
					<p class="text-ink-muted text-sm">Nothing scheduled.</p>
				{:else}
					{#each dayItems as item}
						<TripModeCard {item} slug={data.trip.slug} />
					{/each}
				{/if}
			</section>
		{/each}
	{/if}
</main>
