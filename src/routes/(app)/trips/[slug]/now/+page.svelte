<script lang="ts">
	import { withOrigin } from '$lib/shell/back-nav';
	// Merged Now view (#244). Now absorbed Today: one weighted whole-day glance with
	// exactly THREE visual weights, top → bottom — faded past (peek, revealed by
	// scrolling up; the page auto-scrolls to the Focus on open so the past sits
	// above the fold) → Focus active item full detail → normal-weight rest cards
	// (this OVERRIDES #154's muted "later today" tier) → divider → next-day preview
	// + link to the "Next 3 days" sub-tab. Shows ALL of today incl. UNTIMED items.
	import NavBar from '$lib/ui/NavBar.svelte';
	import SubTabs from '$lib/ui/SubTabs.svelte';
	import Card from '$lib/ui/Card.svelte';
	import SectionH from '$lib/ui/SectionH.svelte';
	import NowDivider from '$lib/trip-mode/components/NowDivider.svelte';
	import ItemCard from '$lib/itinerary/components/ItemCard.svelte';
	import SpanBand from '$lib/itinerary/components/SpanBand.svelte';
	import TaskRow from '$lib/itinerary/components/TaskRow.svelte';
	import IdeasStrip from '$lib/trip-mode/components/IdeasStrip.svelte';
	import MemorySheet from '$lib/memory/components/MemorySheet.svelte';
	import MemoryCard from '$lib/memory/components/MemoryCard.svelte';
	import { getNowFeed } from '$lib/trip-mode/now-state';
	import Row from '$lib/ui/Row.svelte';
	import { rowSub } from '$lib/itinerary/row';
	import Hero from '$lib/itinerary/components/Hero.svelte';
	import FreeTimeLabel from '$lib/itinerary/components/FreeTimeLabel.svelte';
	import { freeTimeGaps } from '$lib/itinerary/card-anatomy';
	import ItemActionsMenu from '$lib/itinerary/components/ItemActionsMenu.svelte';
	import ItemActionSheets from '$lib/itinerary/components/ItemActionSheets.svelte';
	import { itemMenuEntries, itemPermissions } from '$lib/itinerary/item-actions';
	import { heroStatus } from '$lib/trip-mode/hero';
	import { formatCountdown } from '$lib/shell/format';
	import NotificationBell from '$lib/collaboration/components/NotificationBell.svelte';
	import type { Item } from '$lib/types';
	import { page } from '$app/state';
	import { untrack, tick, onMount } from 'svelte';

	let { data } = $props();

	// #180 — the bell lives on the mode-landing + hub pages (Overview, Now, Money,
	// Docs, More). Notifications ride the shared trip layout load.
	let notifications = $state(untrack(() => data.notifications ?? []));
	let unreadCount = $state(untrack(() => data.unreadCount ?? 0));
	// #297: re-seed from server data so persisted read_at survives navigation.
	$effect(() => {
		notifications = data.notifications ?? [];
		unreadCount = data.unreadCount ?? 0;
	});

	const nowIso = untrack(() => data.now);
	const todayStr = nowIso.split('T')[0];
	// Trip-local "now" (UTC fields = the trip's wall clock). Ticks every 30s so the
	// Hero's "55m left" counts down and the Focus hands over when the item ends.
	let now = $state(new Date(nowIso));
	let clockBase = { server: new Date(nowIso).getTime(), at: Date.now() };
	// A reload (e.g. after Skip) brings a fresh server "now": re-anchor to it.
	$effect(() => {
		clockBase = { server: new Date(data.now).getTime(), at: Date.now() };
		now = new Date(data.now);
	});
	onMount(() => {
		const id = setInterval(
			() => (now = new Date(clockBase.server + (Date.now() - clockBase.at))),
			30_000
		);
		return () => clearInterval(id);
	});

	// The merged feed: faded past / Focus / normal rest (timed + untimed woven).
	// Named nowFeed (not `feed`/`state`) to avoid shadowing the $state rune.
	const nowFeed = $derived(getNowFeed(data.todayItems, now, data.hasToday, data.membership?.id ?? ''));
	const focus = $derived(nowFeed.focus);
	const pastItems = $derived(nowFeed.pastItems);
	const restItems = $derived(nowFeed.restItems);
	// #422: free-time labels within Coming up (display order; never spans lists).
	const restGaps = $derived(freeTimeGaps(restItems));

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

	// #437's menu + sheet serve two doors on this page: the Hero's `⋯` (#428) and each
	// Coming up card's `⋯` (#429). Entries come from the item permissions (Skip for
	// owner/co_owner of a planned, dated item); Move and Delete stay on the item
	// page, so they are masked off here. ONE Skip sheet, pointed at `skipTarget`.
	function skipEntries(item: Item) {
		const perms = data.membership ? itemPermissions(data.membership, item) : null;
		return perms ? itemMenuEntries({ canMove: false, canSkip: perms.canSkip, canDelete: false }) : [];
	}
	let skipTarget = $state<Item | null>(null);
	let skipOpen = $state(false);
	function askSkip(item: Item) {
		skipTarget = item;
		skipOpen = true;
	}

	function dayLabel(dateStr: string): string {
		return new Date(dateStr.replace(' ', 'T')).toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}

	// #269 Trip Memory — the one composer, opened from three doors on this page:
	// Note Before Bed (day-wrapped Focus), the center Add sheet (?capture=memory),
	// and the Today's-memories edit affordance. Viewers never author.
	let memorySheetOpen = $state(false);
	const canCapture = $derived((data.canCapture ?? false) && !!data.todayDayId);
	const myMemory = $derived(data.myMemory ?? null);
	const myPhotoSrc = $derived(
		myMemory?.photo ? `/trips/${data.trip.slug}/memories/${myMemory.id}/photo` : ''
	);
	const memories = $derived(data.memories ?? []);
	const memberById = $derived(new Map(data.members.map((m) => [m.id, m])));

	// Note Before Bed (PRD §Surfaces): optional and dismissable, NEVER nagging —
	// a dismissal sticks for the rest of that trip-local day (localStorage), and
	// a day with a captured memory never prompts again.
	const nbbKey = $derived(`waypoint-nbb-${data.trip.id}-${todayStr}`);
	let nbbDismissed = $state(true); // assume dismissed until the client checks
	$effect(() => {
		nbbDismissed = localStorage.getItem(nbbKey) === '1';
	});
	function dismissNbb() {
		localStorage.setItem(nbbKey, '1');
		nbbDismissed = true;
	}
	const showNoteBeforeBed = $derived(
		focus.kind === 'wrapped-summary' && canCapture && !myMemory && !nbbDismissed
	);

	// Auto-scroll to the Focus on open (the contract's anchor). This naturally
	// pushes the faded past above the fold → "reveal on scroll-up". No-op on
	// SSR / when there's no past to hide.
	onMount(() => {
		// Add-sheet door: /now?capture=memory opens the composer directly.
		if (page.url.searchParams.get('capture') === 'memory' && canCapture) {
			memorySheetOpen = true;
		}
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
				<SpanBand
					{item}
					days={data.days}
					dayDate={todayStr}
					tripSlug={data.trip.slug}
				/>
			{/each}
		</div>
	{/if}

	<!-- Weight 1: Earlier today (#429): the same rail + Card as Coming up, muted (no
	     white fill, ink-muted text, lighter rule, outlined node), still tappable.
	     Peeks above the Focus; the auto-scroll lands on the Focus, so these need a
	     scroll-up to reach. Hidden entirely when nothing's behind. -->
	{#if pastItems.length > 0}
		<section class="space-y-2" aria-label="Earlier today">
			<NowDivider label="Earlier today" />
			{#each pastItems as item (item.id)}
				<ItemCard
					{item}
					tripSlug={data.trip.slug}
					members={data.members}
					mode="trip"
					muted
					docCount={data.docCountByItem[item.id] ?? 0}
				/>
			{/each}
		</section>
	{/if}

	<!-- Weight 2: Focus — the live state, front-and-centre, full detail. Auto-scroll target. -->
	<div id="now-focus" class="scroll-mt-[110px]">
		{#if focus.kind === 'mid-event'}
			<!-- #430: a Hero for every ongoing item (the viewer's first, then by start). Stacking
			     already says "at the same time", so no conflict is shown between them. -->
			<div class="space-y-3" data-testid="now-heroes">
				{#each focus.heroes as hero (hero.id)}
					{@const heroEntries = skipEntries(hero)}
					<Hero
						item={hero}
						members={data.members}
						status={heroStatus(hero, now)}
						codes={hero.confirmation_codes ?? []}
						href={`/trips/${data.trip.slug}/items/${hero.id}`}
					>
						{#snippet menu()}
							<ItemActionsMenu
								entries={heroEntries}
								onselect={(id) => {
									if (id === 'skip') askSkip(hero);
								}}
							/>
						{/snippet}
					</Hero>
				{/each}
			</div>
		{:else if focus.kind === 'free-time'}
			<Card>
				<!-- #431: centred. FREE TIME, a large countdown to the next timed start or
				     deadline, `until {title}`. No second line (the rail's free-time label says it). -->
				<div class="p-6 text-center" data-testid="free-time">
					<p class="text-ink-muted text-xs font-semibold uppercase tracking-wide">Free time</p>
					<p class="text-ink font-display mt-2 text-5xl leading-none font-semibold" data-testid="free-time-countdown">
						{formatCountdown(focus.minutesUntilNext)}
					</p>
					<p class="text-ink-soft mt-3 text-base break-words" data-testid="free-time-until">
						until {focus.nextItem.title}
					</p>
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

	<!-- #269 Note Before Bed — the day-wrapped capture prompt. Optional and
	     dismissable ("Not tonight" sticks for the day); a captured memory or a
	     viewer role means it never renders. Never nagging. -->
	{#if showNoteBeforeBed}
		<Card>
			<div class="p-5">
				<p class="text-ink-muted text-[11px] font-medium uppercase tracking-wide">Note before bed</p>
				<p class="text-ink font-display mt-1.5 text-lg font-semibold">What made today, today?</p>
				<p class="text-ink-muted mt-1 text-sm">One photo, one thought — before it fades.</p>
				<div class="mt-4 flex items-center gap-3">
					<button
						type="button"
						onclick={() => (memorySheetOpen = true)}
						class="bg-ink text-paper rounded-lg px-4 py-2 text-sm font-medium"
					>
						Capture today
					</button>
					<button type="button" onclick={dismissNbb} class="text-ink-muted px-2 py-2 text-sm">
						Not tonight
					</button>
				</div>
			</div>
		</Card>
	{/if}

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
			myMemberId={data.myMemberId}
			canVote={data.canVote}
			heading={justSkipped && !doorOpen ? 'Replace it' : 'Ideas for now'}
			subheading={justSkipped && !doorOpen
				? 'Pick a backup from this part of the trip'
				: 'Backup plans from this part of the trip'}
		/>
	{/if}

	<!-- Weight 3: the rest at NORMAL weight (overrides #154's muted later-today
	     tier). Forward timed items woven with all untimed items. Full cards. -->
	{#if restItems.length > 0}
		<section class="space-y-2" aria-label="Coming up">
			<NowDivider label="Coming up" />
			{#each restItems as item (item.id)}
				{@const entries = skipEntries(item)}
				{@const gap = restGaps.get(item.id)}
				{#snippet cardMenu()}
					<ItemActionsMenu
						{entries}
						onselect={(id) => {
							if (id === 'skip') askSkip(item);
						}}
					/>
				{/snippet}
				{#if gap}
					<FreeTimeLabel {gap} />
				{/if}
				<ItemCard
					{item}
					tripSlug={data.trip.slug}
					members={data.members}
					mode="trip"
					docCount={data.docCountByItem[item.id] ?? 0}
					menu={entries.length > 0 ? cardMenu : undefined}
				/>
			{/each}
		</section>
	{/if}

	<!-- #269 — today's memories from ALL travelers as small cards (the Trip Mode
	     review surface). A member with no memory today simply has no card. The
	     empty state offers capture on an active trip — gently, never a nag. -->
	{#if data.hasToday}
		<section class="border-line space-y-2 border-t pt-4" data-testid="today-memories">
			<SectionH>Today's memories</SectionH>
			{#if memories.length > 0}
				{#each memories as memory (memory.id)}
					<MemoryCard
						{memory}
						member={memberById.get(memory.author) ?? null}
						slug={data.trip.slug}
						mine={memory.author === data.membership.id}
						editable={canCapture}
						onEdit={() => (memorySheetOpen = true)}
					/>
				{/each}
				{#if canCapture && !myMemory}
					<button
						type="button"
						onclick={() => (memorySheetOpen = true)}
						class="text-ink-muted hover:text-ink-soft active:text-ink-soft w-full py-1 text-center text-xs font-medium"
					>
						Add yours
					</button>
				{/if}
			{:else}
				<div class="py-2 text-center">
					<p class="text-ink-muted text-sm">No memories yet</p>
					{#if canCapture}
						<button
							type="button"
							onclick={() => (memorySheetOpen = true)}
							class="text-ink-soft hover:text-ink active:text-ink mt-1 text-xs font-medium underline-offset-2 hover:underline active:underline"
						>
							Capture today's
						</button>
					{/if}
				</div>
			{/if}
		</section>
	{/if}

	<!-- Divider → next-day preview + link to the "Next 3 days" sub-tab. -->
	{#if data.tomorrowDate}
		<div class="border-line border-t pt-4">
			<SectionH>
				{#snippet right()}
					<a href="/trips/{data.trip.slug}/today/upcoming" class="text-ink-muted hover:text-ink-soft active:text-ink-soft text-xs">Next 3 days</a>
				{/snippet}
				{dayLabel(data.tomorrowDate)}
			</SectionH>
			{#if data.tomorrowItems.length > 0}
				<div class="mt-1">
					{#each data.tomorrowItems.slice(0, 3) as item, i (item.id)}
						<Row
							type={item.type}
							subtype={item.subtype}
							title={item.title}
							sub={rowSub(item)}
							href={withOrigin(`/trips/${data.trip.slug}/items/${item.id}`, page.url.pathname)}
							divider={i < Math.min(3, data.tomorrowItems.length) - 1}
						/>
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
</main>

<!-- The Skip sheet behind every `⋯` on this page (Hero #428, Coming up cards #429).
     Outside <main> so no ancestor is a containing block for its fixed positioning.
     Now IS the Skip destination, so it refreshes in place and opens the ideas strip
     (Door 2) via onskipped. -->
{#if skipTarget}
	{#key skipTarget.id}
		<ItemActionSheets
			bind:skipOpen
			canMove={false}
			canSkip={true}
			canDelete={false}
			slug={data.trip.slug}
			itemId={skipTarget.id}
			typeLabel={skipTarget.type}
			onskipped={() => (justSkipped = true)}
		/>
	{/key}
{/if}

<!-- #269 — the one memory composer (photo slot + 280-char thought). -->
{#if canCapture && data.todayDayId}
	<MemorySheet
		bind:open={memorySheetOpen}
		dayId={data.todayDayId}
		existing={myMemory}
		photoSrc={myPhotoSrc}
		title="Tonight's memory"
		subtitle="One photo, one thought — the day's highlight."
	/>
{/if}
