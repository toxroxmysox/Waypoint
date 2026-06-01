<script lang="ts">
	import type { Item } from '$lib/types';
	import NavBar from '$lib/ui/NavBar.svelte';
	import SubTabs from '$lib/ui/SubTabs.svelte';
	import TripModeCard from '$lib/trip-mode/components/TripModeCard.svelte';
	import NowDivider from '$lib/trip-mode/components/NowDivider.svelte';
	import SectionH from '$lib/ui/SectionH.svelte';
	import Card from '$lib/ui/Card.svelte';
	import NotificationBell from '$lib/collaboration/components/NotificationBell.svelte';
	import { getTripModeState } from '$lib/trip-mode/trip-mode';
	import { untrack } from 'svelte';
	import type { Notification } from '$lib/types';

	let { data } = $props();

	let notifications = $state<Notification[]>(untrack(() => data.notifications ?? []));
	let unreadCount = $state(untrack(() => data.unreadCount ?? 0));

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
	title="Today"
	subtitle={data.trip.title}
	subtitleStyle="tagline"
	back
	backHref="/trips/{data.trip.slug}"
>
	{#snippet right()}
		<NotificationBell bind:notifications bind:unreadCount />
	{/snippet}
</NavBar>

<SubTabs tabs={[
	{ id: 'today', label: 'Today', href: `/trips/${data.trip.slug}/today` },
	{ id: 'upcoming', label: 'Next 3 Days', href: `/trips/${data.trip.slug}/today/upcoming` }
]} />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8 space-y-4">
	{#if !tripMode.now.today}
		<Card>
			<div class="p-6 text-center">
				<p class="text-ink-soft font-semibold">No itinerary for today</p>
				<p class="text-ink-muted mt-1 text-sm">Today doesn't fall within this trip's dates.</p>
			</div>
		</Card>
	{:else}
		<h2 class="font-display text-ink text-xl font-semibold">{dayLabel(tripMode.now.today.date)}</h2>

		{#if tripMode.now.todayItems.length === 0}
			<Card>
				<div class="p-6 text-center">
					<p class="text-ink-muted text-sm">Nothing scheduled for today.</p>
				</div>
			</Card>
		{:else}
			<section class="space-y-2">
				{#each tripMode.now.todayItems as item}
					{#if tripMode.now.nextItem && tripMode.now.nextItem.id === item.id}
						<NowDivider label="Up next" />
					{/if}
					<TripModeCard
						{item}
						slug={data.trip.slug}
						isNext={tripMode.now.nextItem?.id === item.id}
					/>
				{/each}
			</section>
		{/if}

		{#if tripMode.upNext.tomorrowDay}
			{@const tomorrowItems = tripMode.upNext.tomorrowItems}
			<div class="border-line border-t pt-4">
				<SectionH>
					{#snippet right()}
						<a href="/trips/{data.trip.slug}/today/upcoming" class="text-ink-muted hover:text-ink-soft text-xs">See all</a>
					{/snippet}
					Tomorrow
				</SectionH>
				{#if tomorrowItems.length > 0}
					<div class="mt-2 space-y-1">
						{#each tomorrowItems.slice(0, 3) as item}
							<a href="/trips/{data.trip.slug}/items/{item.id}" class="border-line hover:border-ink-muted flex items-center gap-2 rounded-lg border px-3 py-2">
								<span class="font-mono text-ink-muted text-xs">
									{item.start_time ? new Date(item.start_time.replace(' ', 'T')).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }) : '—'}
								</span>
								<span class="text-ink text-sm truncate">{item.title}</span>
							</a>
						{/each}
						{#if tomorrowItems.length > 3}
							<p class="text-ink-muted text-center text-xs">+{tomorrowItems.length - 3} more</p>
						{/if}
					</div>
				{:else}
					<p class="text-ink-muted mt-2 text-xs">Nothing scheduled.</p>
				{/if}
			</div>
		{/if}
	{/if}
</main>
