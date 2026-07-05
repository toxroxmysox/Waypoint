<script lang="ts">
	import ArchiveDaySection from '$lib/portability/components/ArchiveDaySection.svelte';
	import ShareAffordance from '$lib/portability/components/ShareAffordance.svelte';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import { titleCase } from '$lib/shell/format';
	import type { buildArchiveView } from '$lib/portability/archive-view';
	import type { PublishStatus } from '$lib/portability/archive-visibility';

	// Read-only Record view for a CLOSED trip (#242). The trip's satisfying final resting
	// state: the done-items record (reusing buildArchiveView's sanitized output + the
	// public archive's day sections), the curated "what we considered", and the Share
	// affordance. Visibly marked CLOSED so it's never mistaken for a live trip. No
	// planning chrome (no FAB, no capture, no edit affordances) leaks in.

	// Exactly the buildArchiveView output shape — so the record view and the public
	// archive stay in lockstep (same sanitization, same fields).
	type RecordData = ReturnType<typeof buildArchiveView>;

	// #343 — the scenario decision snapshot (#337) surfaced read-only in the record as
	// the trip's origin story. `null` when the trip has no decision (older/non-scenario
	// trips) — the section renders nothing.
	type RecordDecision = {
		decidedAt: string;
		chooserName: string;
		chosenTitle: string;
		otherTitles: string[];
	} | null;

	let {
		record,
		share,
		canManage = false,
		decision = null,
		decisionHref = ''
	}: {
		record: RecordData;
		share: {
			url: string;
			status: PublishStatus;
			archiveEnabled: boolean;
			publishDate: string;
			showBudget: boolean;
			today: string;
		};
		canManage?: boolean;
		decision?: RecordDecision;
		decisionHref?: string;
	} = $props();

	// #343 — "on [date]" for the origin-story line. Long-form, calm; empty on a bad ISO.
	function decidedOn(iso: string): string {
		if (!iso) return '';
		const dt = new Date(iso);
		return isNaN(dt.getTime())
			? ''
			: dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
	}

	// #343 — "picked over X and Y" naming the runners-up (a natural-language join).
	function othersPhrase(titles: string[]): string {
		if (titles.length === 0) return '';
		if (titles.length === 1) return titles[0];
		if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;
		return `${titles.slice(0, -1).join(', ')}, and ${titles[titles.length - 1]}`;
	}

	const dateRange = $derived.by(() => {
		const fmt = (d: string) =>
			new Date(d.replace(' ', 'T')).toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
				timeZone: 'UTC'
			});
		return `${fmt(record.trip.start_date)} – ${fmt(record.trip.end_date)}`;
	});

	const consideredByType = $derived.by(() => {
		const grouped = new Map<string, RecordData['consideredItems']>();
		for (const item of record.consideredItems) {
			const type = item.type || 'activity';
			if (!grouped.has(type)) grouped.set(type, []);
			grouped.get(type)!.push(item);
		}
		return grouped;
	});

	let showConsidered = $state(false);
</script>

<div class="space-y-6">
	<!-- Closed marker — the trip is visibly a finished record, not a live trip. -->
	<section class="border-line bg-surface shadow-card overflow-hidden rounded-lg border" aria-label="Closed trip record">
		<div class="px-4 py-3">
			<p class="text-ink-muted flex items-center gap-1.5 text-[9.5px] font-bold tracking-[0.14em] uppercase">
				<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
					<path d="M7 11V7a5 5 0 0 1 10 0v4" />
				</svg>
				Trip closed
			</p>
			<p class="text-ink mt-1 text-sm font-semibold">This trip is wrapped up</p>
			<p class="text-ink-soft font-mono mt-0.5 text-[12px]">{dateRange}</p>
			<p class="text-ink-muted mt-1.5 text-xs">A read-only record of what happened. Reopen it (below) to edit again.</p>
		</div>
	</section>

	{#if decision}
		<!-- #343 How this trip came together — the immutable scenario decision (#337) as
		     the record's origin story. Read-only; deep-links to the full "How we decided"
		     record for the weighing detail. Rendered only when a decision exists. -->
		<section
			class="border-line bg-surface shadow-card overflow-hidden rounded-lg border"
			aria-label="How this trip came together"
		>
			<div class="p-4">
				<p class="text-ink-muted text-[9.5px] font-bold tracking-[0.14em] uppercase">
					How this trip came together
				</p>
				<p class="text-ink mt-2 text-sm">
					Chose <span class="font-semibold">{decision.chosenTitle}</span>{#if decision.otherTitles.length > 0}<span class="text-ink-soft">, over {othersPhrase(decision.otherTitles)}</span>{/if}{#if decidedOn(decision.decidedAt)}<span class="text-ink-soft"> — {decidedOn(decision.decidedAt)}</span>{/if}.
				</p>
				<p class="text-ink-muted mt-1 text-xs">Chosen by {decision.chooserName}.</p>
				{#if decisionHref}
					<a
						href={decisionHref}
						class="text-moss mt-2.5 inline-flex items-center gap-1 text-xs font-semibold"
					>
						How we decided
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
					</a>
				{/if}
			</div>
		</section>
	{/if}

	<!-- Share affordance — the result of closing out, where the group looks. -->
	<ShareAffordance
		url={share.url}
		status={share.status}
		archiveEnabled={share.archiveEnabled}
		publishDate={share.publishDate}
		showBudget={share.showBudget}
		today={share.today}
		{canManage}
	/>

	{#if record.budgetSummary}
		<!-- Opt-in budget summary (#243): aggregate total + rough per-person only. This is
		     the SAME summary outsiders see — never itemized expenses or who-owes-whom. -->
		<div class="border-line bg-surface shadow-card rounded-lg border p-5 text-center">
			<p class="text-ink-muted text-[9.5px] font-bold tracking-[0.14em] uppercase">What the trip cost (public)</p>
			<div class="mt-3 flex items-center justify-center gap-8">
				<div>
					<p class="text-ink text-2xl font-bold">${record.budgetSummary.total.toLocaleString()}</p>
					<p class="text-ink-muted text-xs">total</p>
				</div>
				<div class="bg-line h-10 w-px"></div>
				<div>
					<p class="text-ink text-2xl font-bold">${record.budgetSummary.perPerson.toLocaleString()}</p>
					<p class="text-ink-muted text-xs">≈ per person</p>
				</div>
			</div>
		</div>
	{/if}

	<!-- The record: done items, day by day (reusing the public archive's sanitized view). -->
	<div class="space-y-1.5">
		<div class="text-ink-muted px-0.5 text-[9.5px] font-bold tracking-[0.14em] uppercase">What we did</div>
		{#if record.days.length === 0}
			<p class="text-ink-muted px-1 text-sm">No itinerary days to show.</p>
		{:else}
			<div class="space-y-4">
				{#each record.days as day (day.id)}
					{@const dayItems = record.doneItems.filter((i) => i.day === day.id)}
					<ArchiveDaySection {day} items={dayItems} phases={record.phases} />
				{/each}
			</div>
		{/if}
	</div>

	{#if record.consideredItems.length > 0}
		<div>
			<button
				type="button"
				onclick={() => (showConsidered = !showConsidered)}
				class="text-ink-muted flex w-full items-center gap-2 text-sm font-medium"
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="transition-transform" class:rotate-90={showConsidered}>
					<path d="m9 18 6-6-6-6" />
				</svg>
				What we considered ({record.consideredItems.length})
			</button>
			{#if showConsidered}
				<div class="mt-4 space-y-4">
					{#each [...consideredByType.entries()] as [type, items] (type)}
						<div class="bg-surface border-border rounded-xl border p-4">
							<h4 class="text-ink mb-3 text-sm font-semibold">{titleCase(type)}s</h4>
							<ul class="space-y-2">
								{#each items as item (item.id)}
									<li class="flex items-start gap-2">
										<TypeIcon type={item.type} size={20} />
										<div class="min-w-0">
											<p class="text-ink text-sm">{item.title}</p>
											{#if item.location_name}
												<p class="text-ink-muted text-xs">{item.location_name}</p>
											{/if}
										</div>
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
