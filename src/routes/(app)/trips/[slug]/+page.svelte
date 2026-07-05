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
	import ScenarioBoard from '$lib/ideation/components/ScenarioBoard.svelte';
	import { goto } from '$app/navigation';
	import { titleCase } from '$lib/shell/format';
	import { isTripActive } from '$lib/trip-mode/activation';
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { Notification } from '$lib/types';

	let { data, form } = $props();

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
	// #270 / ADR-0022 — `forming` (dateless) replaces the WHOLE Overview body with
	// the forming home: ideas + people + goals + the prominent set-dates door.
	// "Forming" stays internal vocabulary — the UI says "No dates yet".
	const isForming = $derived(data.lifecycle === 'forming');
	let settingDates = $state(false);
	// The set-dates escape hatch is collapsed by default on the scenario board (the
	// board is the primary promotion path); an owner opens it to date without a
	// scenario. If a submit failed, keep it open so the error is visible.
	let setDatesOpen = $state(false);
	const dateError = $derived(form?.dateError ?? '');
	$effect(() => {
		if (dateError) setDatesOpen = true;
	});

	let notifications = $state<Notification[]>(untrack(() => data.notifications ?? []));
	let unreadCount = $state(untrack(() => data.unreadCount ?? 0));
	// #297: re-seed from server data when it changes (e.g. after a mark-read
	// invalidates the layout, or on navigation) so persisted read_at survives.
	$effect(() => {
		notifications = data.notifications ?? [];
		unreadCount = data.unreadCount ?? 0;
	});

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

	// Empty-trip state (#111/ES-1, absorbed by #274). Keyed on user CONTENT = ITEMS.
	// The old ES-1 also required `phases.length === 0`, but #217 auto-seeds a default
	// "Trip" phase on EVERY trip create, so that clause was provably dead (no real trip
	// ever has zero phases) — it silently suppressed the owner blank-itinerary branch.
	// The lone auto-seeded phase is chrome, not user content, so "empty" = zero items.
	// (Days are likewise hook-seeded and never gate this.)
	let isEmptyTrip = $derived((data.totalItems ?? 0) === 0);
	let isOwnerTier = $derived(
		data.membership.role === 'owner' || data.membership.role === 'co_owner'
	);

	// #274 Onboarding spine. The unified welcome card. Two keys folded into one card
	// (no stacking, per PRD §6):
	//   • welcomeMode — the member-keyed onboarding state (server `showWelcome`,
	//     null `users.onboarded_at`). Dismissible ("Got it"); set-complete stamps the
	//     once-ever signal. Auto-shows REGARDLESS of trip content — the fix for the
	//     ES-1 gap (an invited member joining a POPULATED trip got nothing).
	//   • else isEmptyTrip — the already-onboarded veteran on a brand-new empty trip
	//     still gets ES-1's structural "blank itinerary" guidance (NOT dismissible —
	//     it's empty-state help, not onboarding).
	// Render the card when EITHER fires. The empty-trip branch (owner-tier blank-
	// itinerary doors) lives INSIDE it, so a brand-new creator on an empty trip sees
	// ONE unified card.
	let welcomeMode = $derived(data.showWelcome === true);
	let showWelcomeCard = $derived(welcomeMode || isEmptyTrip);
	let onboardSubmitting = $state(false);

	// Set-complete enhance handler. On a "Got it" (no redirect) success, re-run load
	// via `update()` so the now-stamped `showWelcome=false` re-derives and the card
	// vanishes WITHOUT a full remount (cerebrum [2026-06-19]: never reload() in an
	// enhance callback — it wipes page $state). A redirect result (first-action CTA)
	// is followed by the kit automatically; we just clear the spinner.
	function onboardEnhance() {
		onboardSubmitting = true;
		return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			onboardSubmitting = false;
		};
	}

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
{#if !isForming}
	<!-- #270: Phases/Lists are date-scoped surfaces — hidden until the trip is
	     dated (Goals lives in the forming bottom nav instead). -->
	<SubTabs tabs={[
		{ id: 'overview', label: 'Overview', href: `/trips/${data.trip.slug}` },
		{ id: 'phases', label: 'Phases', href: `/trips/${data.trip.slug}/phases` },
		{ id: 'lists', label: 'Lists', href: `/trips/${data.trip.slug}/lists` },
		{ id: 'goals', label: 'Goals', href: `/trips/${data.trip.slug}/goals` }
	]} />
{/if}

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8 space-y-6">
	{#if isForming}
		<!-- #337 / ADR-0022 — the forming home IS the scenario board. Weigh candidate
		     scenarios (where/when/how much); the winner promotes the trip out of
		     forming. Ideas / People / Goals stay reachable below (and in the bottom
		     nav); a direct "set dates" escape hatch lets an owner date without a
		     scenario. -->
		{#if data.board}
			<ScenarioBoard
				board={data.board}
				slug={data.trip.slug}
				canPitch={data.canPitch}
				onpitch={() => goto(`/trips/${data.trip.slug}/scenarios/new`)}
			/>
		{/if}

		<!-- The direct set-dates escape hatch — collapsed by default (the board is the
		     primary promotion path). Owner-tier: skip scenarios and date now. -->
		{#if data.canSetDates}
			<div class="px-0.5">
				{#if !setDatesOpen}
					<button
						type="button"
						onclick={() => (setDatesOpen = true)}
						class="text-ink-muted hover:text-ink text-xs font-medium underline decoration-dotted underline-offset-2"
						data-testid="set-dates-toggle"
					>
						Already know the dates? Set them directly
					</button>
				{:else}
					<Card>
						<form
							method="POST"
							action="?/setDates"
							data-testid="set-dates-form"
							use:enhance={() => {
								settingDates = true;
								return async ({ update }) => {
									settingDates = false;
									await update();
								};
							}}
							class="p-4"
						>
							<p class="text-ink text-sm font-semibold">Set the dates</p>
							<p class="text-ink-muted mt-0.5 text-xs">
								Skips the scenario vote and builds the day-by-day itinerary now. Your ideas
								come along. One-way.
							</p>
							{#if dateError}
								<p role="alert" class="text-error-deep mt-2 text-sm">{dateError}</p>
							{/if}
							<div class="mt-3 flex items-end gap-3">
								<div class="min-w-0 flex-1">
									<label for="forming-start" class="text-ink-soft block text-xs font-medium">Start</label>
									<input
										type="date"
										id="forming-start"
										name="start_date"
										required
										class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-3 py-2 text-sm"
									/>
								</div>
								<div class="min-w-0 flex-1">
									<label for="forming-end" class="text-ink-soft block text-xs font-medium">End</label>
									<input
										type="date"
										id="forming-end"
										name="end_date"
										required
										class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-3 py-2 text-sm"
									/>
								</div>
							</div>
							<Button
								type="submit"
								variant="moss"
								size="md"
								class="mt-3 w-full"
								disabled={settingDates}
								loading={settingDates}
							>
								{settingDates ? 'Setting up the days…' : 'Set the dates'}
							</Button>
						</form>
					</Card>
				{/if}
			</div>
		{/if}

		<!-- Ideas — the forming trip's working surface. Phase-less until promotion. -->
		<section class="space-y-1.5">
			<div class="flex items-center justify-between px-0.5">
				<span class="text-ink-muted text-[9.5px] font-bold tracking-[0.14em] uppercase">Ideas</span>
				<button
					type="button"
					onclick={() => (ideaSheetOpen = true)}
					class="text-moss hover:text-ink inline-flex items-center gap-1 text-xs font-semibold"
				>
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" />
					</svg>
					Add an idea
				</button>
			</div>
			{#if data.formingIdeas.length > 0}
				<div class="grid gap-1.5">
					{#each data.formingIdeas as idea (idea.id)}
						<a
							href="/trips/{data.trip.slug}/items/{idea.id}"
							class="border-line bg-surface hover:bg-surface-2 flex items-center gap-2.5 rounded-lg border px-3 py-2"
						>
							<TypeIcon type={idea.type} size={20} />
							<span class="text-ink truncate text-sm">{idea.title}</span>
						</a>
					{/each}
				</div>
			{:else}
				<Card>
					<div class="p-4 text-center">
						<p class="font-display text-ink-soft text-sm italic">Nothing collected yet.</p>
						<p class="text-ink-muted mt-1 text-xs">
							Anything goes — a restaurant someone mentioned, a town worth a detour.
						</p>
					</div>
				</Card>
			{/if}
		</section>

		<!-- The other two forming doors, also in the bottom nav — named here so the
		     home teaches the scope. -->
		<div class="grid grid-cols-2 gap-1.5">
			<a
				href="/trips/{data.trip.slug}/members"
				class="border-line bg-surface hover:bg-surface-2 flex flex-col rounded-lg border px-3 py-3"
			>
				<p class="text-ink text-sm font-semibold">People</p>
				<p class="text-ink-muted mt-0.5 text-xs">Invite the group early</p>
				<span class="text-moss mt-2 inline-flex items-center gap-1 text-xs font-semibold">
					Invite people
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
				</span>
			</a>
			<a
				href="/trips/{data.trip.slug}/goals"
				class="border-line bg-surface hover:bg-surface-2 flex flex-col rounded-lg border px-3 py-3"
			>
				<p class="text-ink text-sm font-semibold">Goals</p>
				<p class="text-ink-muted mt-0.5 text-xs">What do you want out of it?</p>
				<span class="text-moss mt-2 inline-flex items-center gap-1 text-xs font-semibold">
					Add a goal
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
				</span>
			</a>
		</div>
	{:else if isClosed && data.record && data.share}
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

	{#if !isClosed && !isForming}
	{#if showWelcomeCard}
		<!-- #274 Onboarding spine — the unified welcome card. Renders ABOVE the day list
		     (the days stay — they teach the trip's shape). Two keys folded (PRD §6, ES-1
		     absorbed): `welcomeMode` is the member-keyed onboarding state (auto-shows on a
		     member's first visit, REGARDLESS of trip content — the fix for the ES-1 gap);
		     otherwise `isEmptyTrip` is the structural blank-itinerary guidance for an
		     already-onboarded veteran on a new empty trip. One card, never two stacked. -->
		<Card>
			<div class="p-6 text-center" data-testid="welcome-card">
				{#if welcomeMode && !isEmptyTrip}
					<!-- Member-keyed welcome on a POPULATED trip — the common invited case ES-1
					     misses today. Orientation: name all the doors, one ADAPTIVE primary CTA
					     (#275). The invited member usually lands in an already-populated trip, so
					     a one-tap VOTE is the lowest-friction first win — but only when there's
					     something left to rate. `data.votable.hasVotable` flips the primary action:
					     unrated content → "Weigh in on what's been suggested" (→ swipe deck);
					     nothing to rate (all voted) → "Add what you want" (→ /goals/capture). The
					     other doors are always NAMED in the copy regardless. -->
					<p class="font-display text-ink-soft text-base italic">Welcome aboard.</p>
					<p class="text-ink-muted mt-1 text-sm">
						This is the trip's home. From here you can <strong class="text-ink-soft">see the plan</strong>,
						<strong class="text-ink-soft">weigh in on ideas</strong>, and
						<strong class="text-ink-soft">add what you want</strong> out of it.
					</p>
					<div class="mt-4 flex flex-wrap items-center justify-center gap-2">
						<!-- Primary CTA = first action. Stamps the once-ever signal, then forwards
						     (server redirect → works without JS). Adaptive target. -->
						{#if data.votable.hasVotable && data.votable.swipeHref}
							<form method="POST" action="?/completeOnboarding" use:enhance={onboardEnhance}>
								<input type="hidden" name="redirect_to" value={data.votable.swipeHref} />
								<Button type="submit" variant="moss" size="sm" loading={onboardSubmitting}>
									Weigh in on what's been suggested
								</Button>
							</form>
						{:else}
							<form method="POST" action="?/completeOnboarding" use:enhance={onboardEnhance}>
								<input type="hidden" name="redirect_to" value="/trips/{data.trip.slug}/goals/capture" />
								<Button type="submit" variant="moss" size="sm" loading={onboardSubmitting}>
									Add what you want
								</Button>
							</form>
						{/if}
						<!-- Dismiss = "Got it". Stamps + stays. -->
						<form method="POST" action="?/completeOnboarding" use:enhance={onboardEnhance}>
							<Button type="submit" variant="ghost" size="sm" loading={onboardSubmitting}>Got it</Button>
						</form>
					</div>
				{:else if isOwnerTier}
					<!-- Empty-trip, owner-tier: ES-1's "blank itinerary" doors (absorbed). -->
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
					{#if welcomeMode}
						<!-- Onboarding on an empty trip (brand-new creator's first visit): one
						     dismiss folds the welcome + ES-1 into a single card. -->
						<div class="mt-3 flex items-center justify-center">
							<form method="POST" action="?/completeOnboarding" use:enhance={onboardEnhance}>
								<Button type="submit" variant="ghost" size="sm" loading={onboardSubmitting}>Got it</Button>
							</form>
						</div>
					{/if}
				{:else}
					<!-- Empty-trip, traveler/viewer: ES-1's goals-capture door (absorbed). -->
					<p class="font-display text-ink-soft text-base italic">Nothing planned yet.</p>
					<p class="text-ink-muted mt-1 text-sm">
						Start with what you want out of this trip — the itinerary grows from there.
					</p>
					<div class="mt-4 flex flex-wrap items-center justify-center gap-2">
						{#if welcomeMode}
							<form method="POST" action="?/completeOnboarding" use:enhance={onboardEnhance}>
								<input type="hidden" name="redirect_to" value="/trips/{data.trip.slug}/goals/capture" />
								<Button type="submit" variant="moss" size="sm" loading={onboardSubmitting}>
									Add what you want
								</Button>
							</form>
							<form method="POST" action="?/completeOnboarding" use:enhance={onboardEnhance}>
								<Button type="submit" variant="ghost" size="sm" loading={onboardSubmitting}>Got it</Button>
							</form>
						{:else}
							<Button href="/trips/{data.trip.slug}/goals/capture" variant="moss" size="sm">
								Add &amp; review goals
							</Button>
						{/if}
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
{#if (data.phases.length > 0 || isForming) && !isClosed}
	<FAB onclick={() => (ideaSheetOpen = true)} label="Add idea or plan" />
{/if}
<IdeaCaptureSheet bind:open={ideaSheetOpen} slug={data.trip.slug} phases={data.phases} forming={isForming} />
