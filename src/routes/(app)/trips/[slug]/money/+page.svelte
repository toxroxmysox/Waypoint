<script lang="ts">
	// Trip-Mode Money summary (#227) — read-only, per-person. Answers "how much do I
	// have left to spend?" with TWO labeled figures, each a per-day rate (the hero) + a
	// total: N1 (left to spend = my budget − my reconciliation-aware share) and N2 (left
	// for unplanned = N1 − my share of remaining planned estimates). Every figure deep-
	// links to the planning Money pages (/budget, /expenses) to settle or edit — there's
	// no editing here. Clay chrome comes from resolveChromeMode (this is a Trip surface).
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import NotificationBell from '$lib/collaboration/components/NotificationBell.svelte';
	import { untrack } from 'svelte';

	let { data } = $props();

	// NotificationBell rides the shared trip layout; it lives on mode-landing/hub pages
	// (Overview, Now, Today, Money) per the #180 placement rule.
	let notifications = $state(untrack(() => data.notifications ?? []));
	let unreadCount = $state(untrack(() => data.unreadCount ?? 0));

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
	class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))] space-y-4"
>
	{#if g.myBudget == null}
		<!-- NO BUDGET (PRD A3): show what I've consumed, omit "left". -->
		<Card>
			<div class="p-5 text-center">
				<p class="text-ink-muted text-xs font-medium uppercase tracking-wide">My spend so far</p>
				<p class="font-display text-ink mt-2 text-4xl font-semibold">${fmt(g.myShare)}</p>
				<p class="text-ink-muted mt-2 text-sm">
					No budget set yet — set one to see how much you have left.
				</p>
				<a
					href={budgetHref}
					class="text-accent mt-3 inline-block text-sm font-medium underline underline-offset-2"
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
						<p class="text-ink-muted text-xs font-medium uppercase tracking-wide">
							Left to spend
						</p>
					</div>
					<p
						class="font-display mt-2 text-5xl font-semibold {g.overBudget ? 'text-error' : 'text-ink'}"
					>
						{g.n1PerDay != null ? perDay(g.n1PerDay) : signedLeft(g.n1LeftToSpend ?? 0)}
					</p>
					{#if g.n1PerDay != null}
						<p class="text-ink-muted mt-1 text-sm">for {daysLabel}</p>
					{/if}
					<p class="text-ink-soft mt-3 font-mono text-sm">
						{signedLeft(g.n1LeftToSpend ?? 0)} left
						<span class="text-ink-muted">· ${fmt(g.myBudget)} budget − ${fmt(g.myShare)} my share</span>
					</p>
				</div>
			</Card>
		</a>

		<!-- N2 — LEFT FOR UNPLANNED (after subtracting my share of what's still planned).
		     Tappable into the remaining planned items that drive it. -->
		<a href="#remaining-planned" class="block">
			<Card>
				<div class="p-5 text-center">
					<p class="text-ink-muted text-xs font-medium uppercase tracking-wide">
						Left for unplanned
					</p>
					<p class="font-display text-ink mt-2 text-3xl font-semibold">
						{g.n2PerDay != null ? perDay(g.n2PerDay) : signedLeft(g.n2LeftForUnplanned ?? 0)}
					</p>
					{#if g.n2PerDay != null}
						<p class="text-ink-muted mt-1 text-sm">for {daysLabel}</p>
					{/if}
					<p class="text-ink-soft mt-3 font-mono text-sm">
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
				class="border-line bg-surface flex items-center justify-between rounded-lg border px-4 py-3"
			>
				<span class="text-ink-soft text-sm">
					{#if data.myBalance > 0}
						You're owed <span class="font-mono text-ink">${fmt(data.myBalance)}</span>
					{:else}
						You owe <span class="font-mono text-ink">${fmt(-data.myBalance)}</span>
					{/if}
				</span>
				<span class="text-accent text-sm font-medium">Settle →</span>
			</div>
		</a>
	{/if}

	<!-- Honest caveat (#227): "my share" reflects only LOGGED expenses. A logging gap,
	     not a model flaw. -->
	<p class="text-ink-muted px-1 text-center text-xs">
		Reflects logged expenses only — a cash spend nobody entered isn't counted yet.
	</p>

	<!-- Drill-down: the remaining planned items behind N2. Each links to the item; the
	     section links out to the full expenses page. -->
	{#if data.remainingPlannedItems.length > 0}
		<section id="remaining-planned" class="scroll-mt-4 space-y-2">
			<div class="flex items-baseline justify-between px-1">
				<h2 class="text-ink-soft text-[11px] font-medium uppercase tracking-wide">
					Still planned ({data.remainingPlannedItems.length})
				</h2>
				<span class="text-ink-muted font-mono text-[11px]">
					${fmt(g.remainingPlannedTotal)} total · ${fmt(g.myRemainingPlanned)} you
				</span>
			</div>
			<Card>
				<div class="divide-line divide-y">
					{#each data.remainingPlannedItems as item (item.id)}
						<a
							href="/trips/{slug}/items/{item.id}?from=trip"
							class="hover:bg-surface-2 flex items-center gap-3 px-4 py-2.5 transition-colors"
						>
							<TypeIcon type={item.type} sub={item.subtype} size={28} />
							<span class="text-ink-soft min-w-0 flex-1 truncate text-sm">{item.title}</span>
							<span class="text-ink-muted shrink-0 font-mono text-sm"
								>${fmt(item.cost_estimate_usd ?? 0)}</span
							>
						</a>
					{/each}
				</div>
			</Card>
			<p class="text-ink-muted px-1 text-center text-[11px]">
				These estimates aren't spent yet — booking or logging one moves it out of this list.
			</p>
		</section>
	{/if}
</main>
