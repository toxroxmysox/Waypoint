<script lang="ts">
	import type { Phase, Day } from '$lib/types';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import Button from '$lib/ui/Button.svelte';
	import SectionH from '$lib/ui/SectionH.svelte';
	import SubTabs from '$lib/ui/SubTabs.svelte';
	import NotificationBell from '$lib/collaboration/components/NotificationBell.svelte';
	import FAB from '$lib/shell/components/FAB.svelte';
	import IdeaCaptureSheet from '$lib/itinerary/components/IdeaCaptureSheet.svelte';
	import PhaseChip from '$lib/ui/PhaseChip.svelte';
	import MiniListCard from '$lib/itinerary/components/MiniListCard.svelte';
	import DayCard from '$lib/itinerary/components/DayCard.svelte';
	import DayMetricToggle from '$lib/itinerary/components/DayMetricToggle.svelte';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import WrapUpBanner from '$lib/trip-mode/components/WrapUpBanner.svelte';
	import RecordView from '$lib/portability/components/RecordView.svelte';
	import { titleCase } from '$lib/shell/format';
	import { isTripActive } from '$lib/trip-mode/activation';
	import { untrack } from 'svelte';
	import type { Notification } from '$lib/types';

	let { data } = $props();

	// Trip Mode chip only shows on an active trip, and lands on /now to match the
	// mode pill — one mode, one home (#204).
	const tripActive = $derived(isTripActive(data.trip));

	// Lifecycle router (#239/#195/#242): `wrap-up` swaps the top of the Overview (the
	// trip-details card + Flights & Stays) for the wrap-up banner; `closed` replaces the
	// WHOLE Overview body with the read-only Record view (no planning chrome leaks in).
	// Computed in server load and read here — $derived (never $effect, which doesn't run
	// in SSR and would render the wrong content on first paint).
	const isWrapUp = $derived(data.lifecycle === 'wrap-up');
	const isClosed = $derived(data.lifecycle === 'closed');

	let notifications = $state<Notification[]>(untrack(() => data.notifications ?? []));
	let unreadCount = $state(untrack(() => data.unreadCount ?? 0));

	// #252 — the consistent capture affordance (also on Phase Detail + day views).
	let ideaSheetOpen = $state(false);

	function formatDateRange(start: string, end: string): string {
		const s = new Date(start.replace(' ', 'T'));
		const e = new Date(end.replace(' ', 'T'));
		const startStr = s.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
		const endStr = e.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		});
		return `${startStr} – ${endStr}`;
	}

	function daysInPhase(phase: Phase): Day[] {
		return data.days.filter((d: Day) => (d.phases ?? []).includes(phase.id));
	}

	let firstDayId = $derived(data.days[0]?.id);
	let today = new Date().toISOString().split('T')[0];

	// First-run hero (#111/ES-1). Key the empty state on CONTENT, not day count: the PB
	// hook auto-creates day rows on trip create, so `days.length` is always > 0 and the
	// old day-count branch was dead. A trip is "fresh" only when nothing has been added —
	// no items AND no phases. Owner-tier (owner|co_owner, same gate as canManage) gets the
	// phase/day/invite hero; travelers + viewers are pointed at the goals capture wizard.
	let isFresh = $derived((data.totalItems ?? 0) === 0 && data.phases.length === 0);
	let isOwnerTier = $derived(
		data.membership.role === 'owner' || data.membership.role === 'co_owner'
	);

	// Checklist previews (#51)
	let tripLists = $derived((data.lists ?? []).filter((l) => !l.phase));
	function listsForPhase(phaseId: string) {
		return (data.lists ?? []).filter((l) => l.phase === phaseId);
	}
</script>

<NavBar
	title={data.trip.title}
	subtitle={data.trip.location_summary || undefined}
	subtitleStyle="tagline"
	back
	backHref="/trips"
>
	{#snippet right()}
		<NotificationBell bind:notifications bind:unreadCount />
	{/snippet}
</NavBar>
<SubTabs tabs={[
	{ id: 'overview', label: 'Overview', href: `/trips/${data.trip.slug}` },
	{ id: 'phases', label: 'Phases', href: `/trips/${data.trip.slug}/phases` },
	{ id: 'lists', label: 'Lists', href: `/trips/${data.trip.slug}/lists` },
	{ id: 'goals', label: 'Goals', href: `/trips/${data.trip.slug}/goals` }
]} />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8 space-y-6">
	{#if isClosed && data.record && data.share}
		<!-- Closed record (#242): read-only resting state. Renders ONLY the record —
		     no planning chrome (lists, itinerary, FAB, capture) leaks in. -->
		<RecordView record={data.record} share={data.share} canManage={data.canManage} />
	{:else if isWrapUp}
		<!-- Wrap-up (#239/#195): ONE bordered banner replaces the trip-details card +
		     Flights & Stays. Itinerary/Days still render below, unchanged. -->
		<WrapUpBanner
			slug={data.trip.slug}
			dateRange={formatDateRange(data.trip.start_date, data.trip.end_date)}
			balanceOwed={data.wrapUp?.balanceOwed ?? false}
		/>
	{:else}
	<!-- Trip stats card -->
	<Card>
		<div class="flex items-start justify-between p-4">
			<div>
				<p class="text-ink-soft font-mono text-[12px]">
					{formatDateRange(data.trip.start_date, data.trip.end_date)}
				</p>
				{#if data.trip.timezone}
					<p class="text-ink-muted font-mono mt-0.5 text-xs">{data.trip.timezone}</p>
				{/if}
				<p class="text-ink-soft mt-2 text-sm">
					<span class="font-mono">{data.days.length}</span> days ·
					<span class="font-mono">{data.phases.length}</span> phase{data.phases.length === 1 ? '' : 's'}
				</p>
				<!-- #252 — name the lightweight capture path so "ideas" surfaces here. -->
				<button
					type="button"
					onclick={() => (ideaSheetOpen = true)}
					class="text-moss hover:text-ink mt-2 inline-flex items-center gap-1 text-xs font-semibold"
				>
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" />
					</svg>
					Capture ideas
				</button>
			</div>
			<div class="flex flex-col items-end gap-2">
				<Pill variant={data.membership.role === 'owner' ? 'ink' : 'default'} size="sm">
					{titleCase(data.membership.role)}
				</Pill>
				{#if tripActive}
					<a
						href="/trips/{data.trip.slug}/now"
						class="bg-clay text-paper inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="10" />
							<polyline points="12 6 12 12 16 14" />
						</svg>
						Trip Mode
					</a>
				{/if}
			</div>
		</div>
	</Card>

	{#if data.keyItems?.length}
		<!-- #200 — findability lens: flights & stays, the two most-hunted item types,
		     reachable from the trip home without opening each day. Not a full search. -->
		<section class="space-y-1.5">
			<div class="text-ink-muted flex items-center gap-1.5 px-0.5 text-[9.5px] font-bold tracking-[0.14em] uppercase">
				Flights &amp; stays
			</div>
			<div class="grid gap-1.5">
				{#each data.keyItems as it (it.id)}
					<a
						href="/trips/{data.trip.slug}/items/{it.id}"
						class="border-line bg-surface hover:bg-surface-2 flex items-center gap-2.5 rounded-lg border px-3 py-2"
					>
						<TypeIcon type={it.type} size={20} />
						<span class="text-ink truncate text-sm">{it.title}</span>
					</a>
				{/each}
			</div>
		</section>
	{/if}
	{/if}

	{#if !isClosed}
	{#if isFresh}
		<!-- First-run hero (#111/ES-1). Renders ABOVE the day list (the days stay — they
		     teach the trip's shape) and is keyed on content, not day count. Role-aware:
		     owner-tier gets the phase/day/invite doors; travelers + viewers are pointed at
		     the goals capture wizard (the ideal first contribution). -->
		<Card>
			<div class="p-6 text-center">
				{#if isOwnerTier}
					<p class="font-display text-ink-soft text-base italic">A blank itinerary.</p>
					<p class="text-ink-muted mt-1 text-sm">
						Your days are ready. Group them into phases — city, leg, whatever fits — or drop the
						first plan straight onto a day.
					</p>
					<div class="mt-4 flex flex-wrap items-center justify-center gap-2">
						<Button href="/trips/{data.trip.slug}/phases" variant="moss" size="sm">Add a phase</Button>
						{#if firstDayId}
							<Button href="/trips/{data.trip.slug}/days/{firstDayId}" variant="ghost" size="sm">
								Open day one
							</Button>
						{/if}
						<Button href="/trips/{data.trip.slug}/members" variant="ghost" size="sm">
							Invite the group
						</Button>
					</div>
				{:else}
					<p class="font-display text-ink-soft text-base italic">Nothing planned yet.</p>
					<p class="text-ink-muted mt-1 text-sm">
						Start with what you want out of this trip — the itinerary grows from there.
					</p>
					<div class="mt-4 flex flex-wrap items-center justify-center gap-2">
						<Button href="/trips/{data.trip.slug}/goals/capture" variant="moss" size="sm">
							Add &amp; review goals
						</Button>
					</div>
				{/if}
			</div>
		</Card>
	{/if}

	{#if tripLists.length > 0}
		<!-- Whole-trip checklist previews (#51) -->
		<section class="space-y-1.5">
			<div class="text-ink-muted flex items-center gap-1.5 px-0.5 text-[9.5px] font-bold tracking-[0.14em] uppercase">
				<svg width="9" height="9" viewBox="0 0 20 20" fill="none">
					<path d="M10 2L11.5 7L16 8L11.5 9L10 14L8.5 9L4 8L8.5 7L10 2z" fill="currentColor" />
				</svg>
				Whole-trip lists
			</div>
			<div class="grid gap-1.5">
				{#each tripLists as l (l.id)}
					<MiniListCard title={l.title} done={l.done} total={l.total} href="/trips/{data.trip.slug}/lists/{l.id}" />
				{/each}
			</div>
		</section>
	{/if}

	{#if data.days.length > 0}
		<div class="flex items-center justify-between px-0.5">
			<span class="text-ink-muted text-[9.5px] font-bold tracking-[0.14em] uppercase">Itinerary</span>
			<DayMetricToggle />
		</div>
	{/if}

	{#if data.phases.length > 0}
		<!-- Phases with nested days -->
		{@const orphanDays = data.days.filter((d) => !data.phases.some((p) => (d.phases ?? []).includes(p.id)))}
		{#each data.phases as phase}
			{@const pDays = daysInPhase(phase)}
			{@const pLists = listsForPhase(phase.id)}
			<section class="space-y-1.5">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<PhaseChip name={phase.name} size={20} />
						<a href="/trips/{data.trip.slug}/phases/{phase.id}" class="text-ink font-semibold hover:underline">{phase.name}</a>
					</div>
					<span class="text-ink-muted font-mono text-xs">
						{formatDateRange(phase.start_date, phase.end_date)}
						{#if phase.location}
							<span class="text-line">·</span> {phase.location}
						{/if}
					</span>
				</div>
				{#if pDays.length > 0}
					<div class="space-y-1">
						{#each pDays as day}
							<DayCard
								{day}
								href="/trips/{data.trip.slug}/days/{day.id}"
								summary={data.daySummaries[day.id]}
								{today}
							/>
						{/each}
					</div>
				{/if}
				{#if pLists.length > 0}
					<div class="space-y-1.5 pt-1">
						<div class="text-ink-muted flex items-center gap-1.5 px-0.5 text-[9.5px] font-bold tracking-[0.14em] uppercase">
							<svg width="8" height="8" viewBox="0 0 20 20" fill="none">
								<path d="M10 2L11.5 7L16 8L11.5 9L10 14L8.5 9L4 8L8.5 7L10 2z" fill="currentColor" />
							</svg>
							Lists
						</div>
						<div class="grid gap-1.5">
							{#each pLists as l (l.id)}
								<MiniListCard title={l.title} done={l.done} total={l.total} href="/trips/{data.trip.slug}/lists/{l.id}" />
							{/each}
						</div>
					</div>
				{/if}
			</section>
		{/each}
		{#if orphanDays.length > 0}
			<section class="space-y-1.5">
				<SectionH>Unassigned days</SectionH>
				<div class="space-y-1">
					{#each orphanDays as day}
						<DayCard
							{day}
							href="/trips/{data.trip.slug}/days/{day.id}"
							summary={data.daySummaries[day.id]}
							{today}
						/>
					{/each}
				</div>
			</section>
		{/if}
	{:else if data.days.length > 0}
		<!-- No phases: flat day list. On a fresh trip this is the REAL first-run render
		     (the PB hook seeds day rows, so days always exist); the #111/ES-1 hero above
		     teaches what to do. The old `{:else}` "A blank itinerary." card was dead code —
		     `days.length === 0` never holds on a real trip — and was removed (ES-1). -->
		<section class="space-y-1.5">
			<SectionH>Days</SectionH>
			<div class="space-y-1">
				{#each data.days as day}
					<DayCard
						{day}
						href="/trips/{data.trip.slug}/days/{day.id}"
						summary={data.daySummaries[day.id]}
						{today}
					/>
				{/each}
			</div>
		</section>
	{/if}
	{/if}
</main>

<!-- #252 — consistent capture affordance (same position on Phase Detail + day).
     Opens the idea/plan fork sheet. Only when ≥1 phase exists (the idea path needs
     a required phase; #217 guarantees one on any real trip). SUPPRESSED on a closed
     trip (#242) — a read-only record has no capture/plan affordance. -->
{#if data.phases.length > 0 && !isClosed}
	<FAB onclick={() => (ideaSheetOpen = true)} label="Add idea or plan" />
{/if}
<IdeaCaptureSheet bind:open={ideaSheetOpen} slug={data.trip.slug} phases={data.phases} />
