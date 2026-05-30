<script lang="ts">
	import type { Item, Slot } from '$lib/types';
	import NavBar from '$lib/ui/NavBar.svelte';
	import SubTabs from '$lib/ui/SubTabs.svelte';
	import TripModeCard from '$lib/trip-mode/components/TripModeCard.svelte';
	import NowDivider from '$lib/trip-mode/components/NowDivider.svelte';
	import SectionH from '$lib/ui/SectionH.svelte';
	import Card from '$lib/ui/Card.svelte';
	import NotificationBell from '$lib/collaboration/components/NotificationBell.svelte';
	import { findNextItem, parseDateTime } from '$lib/trip-mode/trip-mode';
	import { untrack } from 'svelte';
	import type { Notification } from '$lib/types';

	let { data } = $props();

	let notifications = $state<Notification[]>(untrack(() => data.notifications ?? []));
	let unreadCount = $state(untrack(() => data.unreadCount ?? 0));

	const now = new Date(untrack(() => data.now));
	const nextItem = $derived(findNextItem(data.todayItems, now));

	const slots: { id: Slot; label: string }[] = [
		{ id: 'morning', label: 'Morning' },
		{ id: 'afternoon', label: 'Afternoon' },
		{ id: 'evening', label: 'Evening' },
		{ id: 'anytime', label: 'Anytime' }
	];

	function itemsForSlot(slot: Slot): Item[] {
		return data.todayItems.filter((item: Item) => item.slot === slot);
	}

	function dayLabel(dateStr: string): string {
		return new Date(dateStr.replace(' ', 'T')).toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}

	function isPast(item: Item): boolean {
		if (!item.end_time) return false;
		return parseDateTime(item.end_time).getTime() < now.getTime();
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
	{#if !data.today}
		<Card>
			<div class="p-6 text-center">
				<p class="text-ink-soft font-semibold">No itinerary for today</p>
				<p class="text-ink-muted mt-1 text-sm">Today doesn't fall within this trip's dates.</p>
			</div>
		</Card>
	{:else}
		<h2 class="font-display text-ink text-xl font-semibold">{dayLabel(data.today.date)}</h2>

		{#if data.todayItems.length === 0}
			<Card>
				<div class="p-6 text-center">
					<p class="text-ink-muted text-sm">Nothing scheduled for today.</p>
				</div>
			</Card>
		{:else}
			{#each slots as slot}
				{@const items = itemsForSlot(slot.id)}
				{#if items.length > 0}
					<section class="space-y-2">
						<SectionH>{slot.label}</SectionH>
						{#each items as item}
							{#if nextItem && nextItem.id === item.id}
								<NowDivider label="Up next" />
							{/if}
							<TripModeCard
								{item}
								slug={data.trip.slug}
								isNext={nextItem?.id === item.id}
							/>
						{/each}
					</section>
				{/if}
			{/each}
		{/if}

		{#if data.tomorrowDay}
			{@const tomorrowItems = data.upcomingItems.filter((i: Item) => i.day === data.tomorrowDay?.id)}
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
									{item.start_time ? new Date(item.start_time.replace(' ', 'T')).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }) : item.slot}
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
