<script lang="ts">
	import { page } from '$app/state';
	import { withOrigin } from '$lib/shell/back-nav';
	// Trip-Mode Money summary (#227) — read-only, per-person. Answers "how much do I
	// have left to spend?" with TWO labeled figures, each a per-day rate (the hero) + a
	// total: N1 (left to spend = my budget − my reconciliation-aware share) and N2 (left
	// for unplanned = N1 − my share of remaining planned estimates). Every figure deep-
	// links to the planning Money pages (/budget, /expenses) to settle or edit — there's
	// no editing here. Clay chrome comes from resolveChromeMode (this is a Trip surface).
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import Row from '$lib/ui/Row.svelte';
	import FlightSubLine from '$lib/itinerary/components/FlightSubLine.svelte';
	import { rowTrailing } from '$lib/itinerary/row';
	import NotificationBell from '$lib/collaboration/components/NotificationBell.svelte';
	import { untrack } from 'svelte';

	let { data } = $props();

	// NotificationBell rides the shared trip layout; it lives on mode-landing/hub pages
	// (Overview, Now, Today, Money) per the #180 placement rule.
	let notifications = $state(untrack(() => data.notifications ?? []));
	let unreadCount = $state(untrack(() => data.unreadCount ?? 0));
	// #297: re-seed from server data so persisted read_at survives navigation.
	$effect(() => {
		notifications = data.notifications ?? [];
		unreadCount = data.unreadCount ?? 0;
	});

	const g = $derived(data.glance);
	const slug = $derived(data.trip.slug);

	function fmt(n: number): string {
		// Whole-dollar for the hero rates/totals (a per-day budget is a glance, not a
		// ledger); the planning pages show cents.
		const r = Math.round(n);
		return r.toLocaleString('en-US');
	}

	// "−$X over" rather than a vanished/negative "left" (PRD A3, applied per-person).
	function signedLeft(n: number): string {
		return n < 0 ? `−$${fmt(Math.abs(n))} over` : `$${fmt(n)}`;
	}
	function perDay(n: number): string {
		return n < 0 ? `−$${fmt(Math.abs(n))}/day` : `$${fmt(n)}/day`;
	}

	const daysLabel = $derived(
		g.remainingDays === 1 ? 'today (your last day)' : `${g.remainingDays} more days`
	);

	const expensesHref = $derived(`/trips/${slug}/expenses`);
	const budgetHref = $derived(`/trips/${slug}/budget`);
</script>

<NavBar title="Money" subtitle={data.trip.title} subtitleStyle="tagline">
	{#snippet right()}
		<NotificationBell bind:notifications bind:unreadCount />
	{/snippet}
</NavBar>

<main
	class="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] md-desktop:max-w-2xl"
>
	<!-- #230 / ADR-0015 — auto-scoped UNIT glance. Shown only when the viewer is in a
	     declared multi-member Money Unit ("are my wife and I on budget?"). Unit budget =
	     custom override OR the even share; unit spent = Σ the unit members' shares. Sits
	     above the per-person figures; deep-links to expenses to manage the unit. -->
	{#if data.unitScope.isUnit}
		<a href={expensesHref} class="block rounded-lg border border-moss/30 bg-moss-tint p-4">
			<div class="flex items-center justify-between">
				<p class="text-xs font-medium tracking-wide text-moss uppercase">
					{data.unitScope.label}
				</p>
				<span class="text-[11px] text-moss/70"
					>{data.unitScope.customBudget ? 'custom budget' : 'even-share budget'}</span
				>
			</div>
			{#if data.unitScope.budget == null}
				<p class="mt-1.5 font-display text-2xl font-semibold text-ink">
					${fmt(data.unitScope.spent)} <span class="text-sm font-normal text-ink-muted">spent</span>
				</p>
			{:else}
				<p class="mt-1.5 font-display text-2xl font-semibold text-ink">
					{signedLeft(data.unitScope.left ?? 0)}
					<span class="text-sm font-normal text-ink-muted">left</span>
				</p>
				<p class="mt-1 text-xs text-ink-muted">
					${fmt(data.unitScope.budget)} budget − ${fmt(data.unitScope.spent)} spent
				</p>
			{/if}
		</a>
	{/if}

	{#if g.myBudget == null}
		<!-- NO BUDGET (PRD A3): show what I've consumed, omit "left". -->
		<Card>
			<div class="p-5 text-center">
				<p class="text-xs font-medium tracking-wide text-ink-muted uppercase">My spend so far</p>
				<p class="mt-2 font-display text-4xl font-semibold text-ink">${fmt(g.myShare)}</p>
				<p class="mt-2 text-sm text-ink-muted">
					No budget set yet — set one to see how much you have left.
				</p>
				<a
					href={budgetHref}
					class="mt-3 inline-block text-sm font-medium text-accent underline underline-offset-2"
				>
					Set a budget →
				</a>
			</div>
		</Card>
	{:else}
		<!-- N1 — LEFT TO SPEND (hero: per-day rate). The whole point of the glance. -->
		<a href={expensesHref} class="block">
			<Card>
				<div class="p-5 text-center">
					<div class="flex items-center justify-center gap-2">
						<Pill variant="trip" size="sm">You</Pill>
						<p class="text-xs font-medium tracking-wide text-ink-muted uppercase">Left to spend</p>
					</div>
					<p
						class="mt-2 font-display text-5xl font-semibold {g.overBudget
							? 'text-error'
							: 'text-ink'}"
					>
						{g.n1PerDay != null ? perDay(g.n1PerDay) : signedLeft(g.n1LeftToSpend ?? 0)}
					</p>
					{#if g.n1PerDay != null}
						<p class="mt-1 text-sm text-ink-muted">for {daysLabel}</p>
					{/if}
					<p class="mt-3 font-mono text-sm text-ink-soft">
						{signedLeft(g.n1LeftToSpend ?? 0)} left
						<span class="text-ink-muted"
							>· ${fmt(g.myBudget)} budget − ${fmt(g.myShare)} my share</span
						>
					</p>
				</div>
			</Card>
		</a>

		<!-- N2 — LEFT FOR UNPLANNED (after subtracting my share of what's still planned).
		     Tappable into the remaining planned items that drive it. -->
		<a href="#remaining-planned" class="block">
			<Card>
				<div class="p-5 text-center">
					<p class="text-xs font-medium tracking-wide text-ink-muted uppercase">
						Left for unplanned
					</p>
					<p class="mt-2 font-display text-3xl font-semibold text-ink">
						{g.n2PerDay != null ? perDay(g.n2PerDay) : signedLeft(g.n2LeftForUnplanned ?? 0)}
					</p>
					{#if g.n2PerDay != null}
						<p class="mt-1 text-sm text-ink-muted">for {daysLabel}</p>
					{/if}
					<p class="mt-3 font-mono text-sm text-ink-soft">
						{signedLeft(g.n2LeftForUnplanned ?? 0)} left
						<span class="text-ink-muted">· after ${fmt(g.myRemainingPlanned)} still planned</span>
					</p>
				</div>
			</Card>
		</a>
	{/if}

	<!-- Optional reconciliation bridge: where I stand on settling, deep-linking to
	     settle-up. The reconciliation-aware share above already folds the balance in;
	     this just surfaces the owe/owed call-to-action. -->
	{#if Math.abs(data.myBalance) >= 0.5}
		<a href={expensesHref} class="block">
			<div
				class="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3"
			>
				<span class="text-sm text-ink-soft">
					{#if data.myBalance > 0}
						You're owed <span class="font-mono text-ink">${fmt(data.myBalance)}</span>
					{:else}
						You owe <span class="font-mono text-ink">${fmt(-data.myBalance)}</span>
					{/if}
				</span>
				<span class="text-sm font-medium text-accent">Settle →</span>
			</div>
		</a>
	{/if}

	<!-- Honest caveat (#227): "my share" reflects only LOGGED expenses. A logging gap,
	     not a model flaw. -->
	<p class="px-1 text-center text-xs text-ink-muted">
		Reflects logged expenses only — a cash spend nobody entered isn't counted yet.
	</p>

	<!-- Drill-down: the remaining planned items behind N2. Each links to the item; the
	     section links out to the full expenses page. -->
	{#if data.remainingPlannedItems.length > 0}
		<section id="remaining-planned" class="scroll-mt-4 space-y-2">
			<div class="flex items-baseline justify-between px-1">
				<h2 class="text-[11px] font-medium tracking-wide text-ink-soft uppercase">
					Still planned ({data.remainingPlannedItems.length})
				</h2>
				<span class="font-mono text-[11px] text-ink-muted">
					${fmt(g.remainingPlannedTotal)} total · ${fmt(g.myRemainingPlanned)} you
				</span>
			</div>
			<Card>
				<div class="px-4">
					{#each data.remainingPlannedItems as item, i (item.id)}
						{#snippet subline()}
							{#if item.flight}<FlightSubLine sub={item.flight} />{/if}
						{/snippet}
						{#snippet cost()}
							<span class="font-mono text-sm text-ink-soft"
								>${fmt(item.cost_estimate_usd ?? 0)}</span
							>
						{/snippet}
						<Row
							type={item.type}
							subtype={item.subtype}
							title={item.title}
							sub={item.sub}
							subline={item.flight ? subline : undefined}
							href={withOrigin(`/trips/${slug}/items/${item.id}`, page.url.pathname)}
							trailing={rowTrailing({ cost: item.cost_estimate_usd ?? 0 }) === 'cost'
								? cost
								: undefined}
							divider={i < data.remainingPlannedItems.length - 1}
						/>
					{/each}
				</div>
			</Card>
			<p class="px-1 text-center text-[11px] text-ink-muted">
				These estimates aren't spent yet — booking or logging one moves it out of this list.
			</p>
		</section>
	{/if}
</main>
