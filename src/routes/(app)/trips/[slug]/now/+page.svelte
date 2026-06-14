<script lang="ts">
	// Weighted Now view (#121 Slice B / #154). One always-on Focus block, then a
	// forward today-only list in diminishing visual weight: next item normal, the
	// rest in the muted "later today" tier. Past items hidden (Today dims them).
	// Items are read-only here — tap a card to open detail; only checklist tasks
	// toggle in place. Tier styling is first-pass (#121 soft area).
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import SectionH from '$lib/ui/SectionH.svelte';
	import NowDivider from '$lib/trip-mode/components/NowDivider.svelte';
	import TripModeCard from '$lib/trip-mode/components/TripModeCard.svelte';
	import MultiDayBanner from '$lib/itinerary/components/MultiDayBanner.svelte';
	import TaskRow from '$lib/itinerary/components/TaskRow.svelte';
	import { getNowViewState } from '$lib/trip-mode/now-state';
	import { formatCountdown, formatTime } from '$lib/shell/format';
	import { untrack } from 'svelte';

	let { data } = $props();

	const nowIso = untrack(() => data.now);
	const now = new Date(nowIso);
	const todayStr = nowIso.split('T')[0];
	const state = $derived(getNowViewState(data.todayItems, now, data.hasToday));
	const focus = $derived(state.focus);

	// In free-time the Focus already counts down to forwardItems[0]; it renders
	// here ONCE, as the first normal-weight row — never enlarged twice. In
	// mid-event the ongoing item is the Focus and forwardItems[0] is genuinely up
	// next. forwardItems arrive ordered (timed, earliest first) from Slice A.
	const nextItem = $derived(state.forwardItems[0] ?? null);
	const laterItems = $derived(state.forwardItems.slice(1));

	// Single end-of-day tail marker after the last upcoming item (#121 grill res.
	// 4 — no per-gap rows). The empty-Focus states already say it themselves.
	const showTail = $derived(focus.kind === 'mid-event' || focus.kind === 'free-time');
</script>

<NavBar title="Now" subtitle={data.trip.title} subtitleStyle="tagline" />

<!-- #84: reserve the home-indicator safe area so the fixed bottom nav doesn't clip the last items -->
<main
	class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] space-y-4"
>
	<!-- Ongoing multi-day context (lodging, rental car): slim banners, never the Focus (#82/#83) -->
	{#if data.multiDayItems.length > 0}
		<div class="space-y-2">
			{#each data.multiDayItems as item (item.id)}
				<MultiDayBanner
					{item}
					days={data.days}
					dayDate={todayStr}
					tripSlug={data.trip.slug}
					ongoing={true}
				/>
			{/each}
		</div>
	{/if}

	<!-- Focus -->
	{#if focus.kind === 'mid-event'}
		<section class="space-y-2">
			<div class="flex items-center justify-between">
				<Pill variant="trip" size="sm">Right now</Pill>
				<p class="text-ink-muted text-xs">{formatCountdown(focus.minutesRemaining)} remaining</p>
			</div>
			<TripModeCard item={focus.currentItem} slug={data.trip.slug} />
		</section>
	{:else if focus.kind === 'free-time'}
		<Card>
			<div class="p-6 text-center">
				<p class="text-ink-muted text-xs font-medium uppercase tracking-wide">Free time</p>
				<p class="text-ink font-display mt-2 text-3xl font-semibold">
					{formatCountdown(focus.minutesUntilNext)}
				</p>
				<p class="text-ink-muted mt-1 text-sm">until next activity</p>
			</div>
		</Card>
	{:else if focus.kind === 'wrapped-summary'}
		<Card>
			<div class="p-6 text-center">
				<p class="text-ink font-display text-xl font-semibold">Day wrapped</p>
				{#if focus.totalCount > 0}
					<p class="text-ink-muted mt-2 text-sm">
						{focus.totalCount} {focus.totalCount === 1 ? 'thing' : 'things'} on today's plan
					</p>
				{:else}
					<p class="text-ink-muted mt-2 text-sm">Nothing was scheduled for today.</p>
				{/if}
			</div>
		</Card>
	{:else if focus.kind === 'nothing-else-planned'}
		<Card>
			<div class="p-6 text-center">
				<p class="text-ink-soft font-semibold">Nothing else planned</p>
				<p class="text-ink-muted mt-1 text-sm">The rest of today is open.</p>
			</div>
		</Card>
	{:else}
		<Card>
			<div class="p-6 text-center">
				<p class="text-ink-soft font-semibold">No itinerary for today</p>
				<p class="text-ink-muted mt-1 text-sm">Today doesn't fall within this trip's dates.</p>
			</div>
		</Card>
	{/if}

	<!-- Forward today-only list: next at normal weight, the rest muted -->
	{#if nextItem}
		<NowDivider label="Up next" />
		<Card href="/trips/{data.trip.slug}/items/{nextItem.id}?from=trip">
			<div class="flex items-center gap-3 p-4">
				<TypeIcon type={nextItem.type} sub={nextItem.subtype} size={36} />
				<div class="min-w-0 flex-1">
					<h4 class="text-ink text-base font-semibold">{nextItem.title}</h4>
					{#if nextItem.start_time}
						<p class="text-ink-muted font-mono mt-0.5 text-sm">{formatTime(nextItem.start_time)}</p>
					{/if}
					{#if nextItem.location_name}
						<p class="text-ink-muted mt-0.5 text-sm">{nextItem.location_name}</p>
					{/if}
				</div>
			</div>
		</Card>
	{/if}

	{#if laterItems.length > 0}
		<section class="space-y-1">
			<p class="text-ink-muted text-[11px] font-medium uppercase tracking-wide">Later today</p>
			{#each laterItems as item (item.id)}
				<a
					href="/trips/{data.trip.slug}/items/{item.id}?from=trip"
					class="hover:bg-surface-2 flex items-center gap-2.5 rounded-lg px-2 py-2 opacity-75 transition-opacity hover:opacity-100"
				>
					<span class="font-mono text-ink-muted w-16 shrink-0 text-xs">
						{formatTime(item.start_time)}
					</span>
					<span class="text-ink-soft truncate text-sm">{item.title}</span>
				</a>
			{/each}
		</section>
	{/if}

	{#if showTail}
		<p class="text-ink-muted py-1 text-center text-xs">Nothing else planned</p>
	{/if}

	<!-- Trip Mode checklists (#52): read + check only, no create/rename/assign -->
	{#if data.checklists.length > 0}
		<div class="border-line space-y-4 border-t pt-4">
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
