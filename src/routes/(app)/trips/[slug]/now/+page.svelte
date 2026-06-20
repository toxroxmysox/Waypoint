<script lang="ts">
	// Merged Now view (#244). Now absorbed Today: one weighted whole-day glance with
	// exactly THREE visual weights, top → bottom — faded past (peek, revealed by
	// scrolling up; the page auto-scrolls to the Focus on open so the past sits
	// above the fold) → Focus active item full detail → normal-weight rest cards
	// (this OVERRIDES #154's muted "later today" tier) → divider → next-day preview
	// + link to the "Next 3 days" sub-tab. Shows ALL of today incl. UNTIMED items.
	import NavBar from '$lib/ui/NavBar.svelte';
	import SubTabs from '$lib/ui/SubTabs.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import SectionH from '$lib/ui/SectionH.svelte';
	import NowDivider from '$lib/trip-mode/components/NowDivider.svelte';
	import TripModeCard from '$lib/trip-mode/components/TripModeCard.svelte';
	import MemberContactStrip from '$lib/trip-mode/components/MemberContactStrip.svelte';
	import MultiDayBanner from '$lib/itinerary/components/MultiDayBanner.svelte';
	import TaskRow from '$lib/itinerary/components/TaskRow.svelte';
	import IdeasStrip from '$lib/trip-mode/components/IdeasStrip.svelte';
	import { getNowFeed } from '$lib/trip-mode/now-state';
	import { formatCountdown, formatTime } from '$lib/shell/format';
	import NotificationBell from '$lib/collaboration/components/NotificationBell.svelte';
	import { untrack, tick, onMount } from 'svelte';

	let { data } = $props();

	// #180 — the bell lives on the mode-landing + hub pages (Overview, Now, Money,
	// Docs, More). Notifications ride the shared trip layout load.
	let notifications = $state(untrack(() => data.notifications ?? []));
	let unreadCount = $state(untrack(() => data.unreadCount ?? 0));

	const nowIso = untrack(() => data.now);
	const now = new Date(nowIso);
	const todayStr = nowIso.split('T')[0];

	// The merged feed: faded past / Focus / normal rest (timed + untimed woven).
	// Named nowFeed (not `feed`/`state`) to avoid shadowing the $state rune.
	const nowFeed = $derived(getNowFeed(data.todayItems, now, data.hasToday));
	const focus = $derived(nowFeed.focus);
	const pastItems = $derived(nowFeed.pastItems);
	const restItems = $derived(nowFeed.restItems);

	// "Up next" highlight keys off the Focus's actual next TIMED item, not a
	// positional index — an untimed idea can sort ahead of the next timed thing in
	// the woven rest, and it isn't the "next" anything. In mid-event the ongoing
	// item is the Focus, so nothing in the rest is "up next".
	const nextItemId = $derived(focus.kind === 'free-time' ? focus.nextItem.id : null);

	// #245 Door 1 — the ideas strip opens proactively at the two states where the
	// need arises: free time (countdown to the next thing) and nothing-else-planned.
	// Mid-event = engaged; wrapped = day's over (Closeout's territory) — no door.
	// An empty current phase yields no ideas, so the strip self-hides regardless.
	const doorOpen = $derived(focus.kind === 'free-time' || focus.kind === 'nothing-else-planned');

	// #246 Door 2 — a just-skipped item frees a slot; open the SAME ideas strip
	// inline so the gap can be re-filled (accepting an idea promotes it in). Sticky
	// for the session after a skip even if a later item keeps the Focus engaged —
	// the strip renders below the rest list as the "replace what you skipped" rail.
	let justSkipped = $state(false);

	function dayLabel(dateStr: string): string {
		return new Date(dateStr.replace(' ', 'T')).toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}

	// Auto-scroll to the Focus on open (the contract's anchor). This naturally
	// pushes the faded past above the fold → "reveal on scroll-up". Mirrors
	// TodayTimeline's onMount scroll. No-op on SSR / when there's no past to hide.
	onMount(() => {
		if (pastItems.length === 0) return;
		tick().then(() => {
			document.getElementById('now-focus')?.scrollIntoView({ behavior: 'auto', block: 'start' });
		});
	});
</script>

<!-- Now is a root Trip-Mode tab, not a drill-down — no back chevron (#197 B-012). -->
<NavBar title="Now" subtitle={data.trip.title} subtitleStyle="tagline">
	{#snippet right()}
		<NotificationBell bind:notifications bind:unreadCount />
	{/snippet}
</NavBar>

<!-- #244: Now owns the sub-tabs. Today (default, this view) + Next 3 days
     (the existing /today/upcoming view). -->
<SubTabs tabs={[
	{ id: 'today', label: 'Today', href: `/trips/${data.trip.slug}/now` },
	{ id: 'upcoming', label: 'Next 3 Days', href: `/trips/${data.trip.slug}/today/upcoming` }
]} />

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

	<!-- Weight 1: faded past (peek above the Focus; auto-scroll lands on the Focus
	     so these need a scroll-up to reach). Hidden entirely when nothing's behind. -->
	{#if pastItems.length > 0}
		<section class="space-y-1 opacity-55">
			<p class="text-ink-muted text-[11px] font-medium uppercase tracking-wide">Earlier today</p>
			{#each pastItems as item (item.id)}
				<a
					href="/trips/{data.trip.slug}/items/{item.id}?from=trip"
					class="hover:bg-surface-2 flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors"
				>
					<span class="font-mono text-ink-muted w-16 shrink-0 text-xs">{formatTime(item.start_time)}</span>
					<span class="text-ink-soft truncate text-sm">{item.title}</span>
				</a>
			{/each}
		</section>
	{/if}

	<!-- Weight 2: Focus — the live state, front-and-centre, full detail. Auto-scroll target. -->
	<div id="now-focus" class="scroll-mt-[110px]">
		{#if focus.kind === 'mid-event'}
			<section class="space-y-2">
				<div class="flex items-center justify-between">
					<Pill variant="trip" size="sm">Right now</Pill>
					<p class="text-ink-muted text-xs">{formatCountdown(focus.minutesRemaining)} remaining</p>
				</div>
				<TripModeCard
					item={focus.currentItem}
					slug={data.trip.slug}
					canSkip={data.canPromote}
					onSkipped={() => (justSkipped = true)}
				/>
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
	</div>

	<!-- #245 Door 1 / #246 Door 2 — "ideas for now": the current phase's parked
	     ideas, shown at a free-time / nothing-else Focus (Door 1) OR after a
	     just-skipped slot (Door 2 — accepting one promotes it into the gap). Same
	     component, two triggers. Self-hides when the phase has no ideas. -->
	{#if doorOpen || justSkipped}
		<IdeasStrip
			ideas={data.ideas}
			members={data.members}
			slug={data.trip.slug}
			canPromote={data.canPromote}
			heading={justSkipped && !doorOpen ? 'Replace it' : 'Ideas for now'}
			subheading={justSkipped && !doorOpen
				? 'Pick a backup from this part of the trip'
				: 'Backup plans from this part of the trip'}
		/>
	{/if}

	<!-- Weight 3: the rest at NORMAL weight (overrides #154's muted later-today
	     tier). Forward timed items woven with all untimed items. Full cards. -->
	{#if restItems.length > 0}
		<section class="space-y-2">
			<NowDivider label="Coming up" />
			{#each restItems as item (item.id)}
				<TripModeCard
					{item}
					slug={data.trip.slug}
					isNext={item.id === nextItemId}
					canSkip={data.canPromote}
					onSkipped={() => (justSkipped = true)}
				/>
			{/each}
		</section>
	{/if}

	<!-- Divider → next-day preview + link to the "Next 3 days" sub-tab. -->
	{#if data.tomorrowDate}
		<div class="border-line border-t pt-4">
			<SectionH>
				{#snippet right()}
					<a href="/trips/{data.trip.slug}/today/upcoming" class="text-ink-muted hover:text-ink-soft text-xs">Next 3 days</a>
				{/snippet}
				{dayLabel(data.tomorrowDate)}
			</SectionH>
			{#if data.tomorrowItems.length > 0}
				<div class="mt-2 space-y-1">
					{#each data.tomorrowItems.slice(0, 3) as item (item.id)}
						<a href="/trips/{data.trip.slug}/items/{item.id}?from=trip" class="border-line hover:border-ink-muted flex items-center gap-2 rounded-lg border px-3 py-2">
							<span class="font-mono text-ink-muted text-xs">{item.start_time ? formatTime(item.start_time) : '—'}</span>
							<span class="text-ink text-sm truncate">{item.title}</span>
						</a>
					{/each}
					{#if data.tomorrowItems.length > 3}
						<p class="text-ink-muted text-center text-xs">+{data.tomorrowItems.length - 3} more</p>
					{/if}
				</div>
			{:else}
				<p class="text-ink-muted mt-2 text-xs">Nothing scheduled.</p>
			{/if}
		</div>
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

	<!-- #244: Members left the Trip nav — surface tap-to-contact a fellow traveller here. -->
	<MemberContactStrip members={data.members} selfUserId={data.membership.user} />
</main>
