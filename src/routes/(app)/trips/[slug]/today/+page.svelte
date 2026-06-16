<script lang="ts">
	import NavBar from '$lib/ui/NavBar.svelte';
	import SubTabs from '$lib/ui/SubTabs.svelte';
	import TodayTimeline from '$lib/trip-mode/components/TodayTimeline.svelte';
	import SectionH from '$lib/ui/SectionH.svelte';
	import Card from '$lib/ui/Card.svelte';
	import NotificationBell from '$lib/collaboration/components/NotificationBell.svelte';
	import { getTripModeState } from '$lib/trip-mode/trip-mode';
	import { formatTime } from '$lib/shell/format';
	import { untrack } from 'svelte';
	import type { Notification } from '$lib/types';
	import MultiDayBanner from '$lib/itinerary/components/MultiDayBanner.svelte';
	import { spanningItemsForDate } from '$lib/itinerary/multi-day';
	import TaskRow from '$lib/itinerary/components/TaskRow.svelte';

	let { data } = $props();

	let notifications = $state<Notification[]>(untrack(() => data.notifications ?? []));
	let unreadCount = $state(untrack(() => data.unreadCount ?? 0));

	const now = new Date(untrack(() => data.now));
	const tripMode = $derived(getTripModeState(data.items, data.days, now));

	const todayDate = $derived(tripMode.now.today ? tripMode.now.today.date.split(/[T ]/)[0] : '');
	const spanningToday = $derived(
		todayDate ? spanningItemsForDate(data.multiDayItems, data.days, todayDate) : []
	);

	function dayLabel(dateStr: string): string {
		return new Date(dateStr.replace(' ', 'T')).toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}
</script>

<!-- Today is a root Trip-Mode tab, not a drill-down — no back chevron (#197 B-012). -->
<NavBar
	title="Today"
	subtitle={data.trip.title}
	subtitleStyle="tagline"
>
	{#snippet right()}
		<NotificationBell bind:notifications bind:unreadCount />
	{/snippet}
</NavBar>

<SubTabs tabs={[
	{ id: 'today', label: 'Today', href: `/trips/${data.trip.slug}/today` },
	{ id: 'upcoming', label: 'Next 3 Days', href: `/trips/${data.trip.slug}/today/upcoming` }
]} />

<!-- #84: reserve the home-indicator safe area so the fixed bottom nav doesn't clip the last items -->
<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] space-y-4">
	{#if !tripMode.now.today}
		<Card>
			<div class="p-6 text-center">
				<p class="text-ink-soft font-semibold">No itinerary for today</p>
				<p class="text-ink-muted mt-1 text-sm">Today doesn't fall within this trip's dates.</p>
			</div>
		</Card>
	{:else}
		<h2 class="font-display text-ink text-xl font-semibold">{dayLabel(tripMode.now.today.date)}</h2>

		{#if spanningToday.length > 0}
			<div class="space-y-2">
				{#each spanningToday as item (item.id)}
					<MultiDayBanner
						{item}
						days={data.days}
						dayDate={todayDate}
						tripSlug={data.trip.slug}
						ongoing={true}
					/>
				{/each}
			</div>
		{/if}

		<TodayTimeline
			items={tripMode.now.todayItems}
			tripSlug={data.trip.slug}
			{now}
			votesByItem={data.votesByItem}
			members={data.members}
		/>

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
							<a href="/trips/{data.trip.slug}/items/{item.id}?from=trip" class="border-line hover:border-ink-muted flex items-center gap-2 rounded-lg border px-3 py-2">
								<span class="font-mono text-ink-muted text-xs">
									{item.start_time ? formatTime(item.start_time) : '—'}
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

	<!-- Trip Mode checklists (#52): read + check only, no create/rename/assign -->
	{#if data.checklists.length > 0}
		<div class="border-line border-t pt-4 space-y-4">
			{#each data.checklists as cl (cl.id)}
				{@const done = cl.tasks.filter((t) => t.checked).length}
				<section class="space-y-2">
					<SectionH>
						{#snippet right()}
							<span class="font-mono text-xs">{done}/{cl.tasks.length}</span>
						{/snippet}
						{cl.title}
					</SectionH>
					{#if cl.tasks.length > 0}
						<Card>
							<div class="px-4">
								{#each cl.tasks as task, i (task.id)}
									<TaskRow
										taskId={task.id}
										title={task.title}
										checked={task.checked}
										toggleAction="?/toggleTask"
										assignable={false}
										divider={i < cl.tasks.length - 1}
									/>
								{/each}
							</div>
						</Card>
					{:else}
						<p class="text-ink-muted text-xs italic">Nothing on this list.</p>
					{/if}
				</section>
			{/each}
		</div>
	{/if}
</main>
