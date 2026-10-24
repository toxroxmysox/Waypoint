<script lang="ts">
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import ScenarioSketchStrip from '$lib/ideation/components/ScenarioSketchStrip.svelte';
	import { formatDateRange } from '$lib/shell/format';
	import type { VoteValue } from '$lib/collaboration/voting';

	let { data } = $props();
	const d = $derived(data.decision);

	const money = (n: number) => `~$${Math.round(n).toLocaleString('en-US')}`;
	function decidedOn(iso: string): string {
		if (!iso) return '';
		const dt = new Date(iso);
		return isNaN(dt.getTime())
			? ''
			: dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
	}

	const VOTE_GLYPH: Record<VoteValue, string> = {
		love: '♥',
		like: '+',
		flexible: '~',
		dislike: 'Pass'
	};
	function voteSummary(votes: Record<string, number>): string {
		const parts: string[] = [];
		for (const k of ['love', 'like', 'flexible', 'dislike'] as VoteValue[]) {
			if (votes?.[k]) parts.push(`${votes[k]} ${VOTE_GLYPH[k]}`);
		}
		return parts.join(' · ');
	}
</script>

<NavBar title="How we decided" back backHref="/trips/{data.trip.slug}/more" />

<main class="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 pt-4 pb-10 md-desktop:max-w-2xl">
	<!-- The outcome -->
	<Card strong accent="var(--color-moss)">
		<div class="p-4">
			<p class="font-mono text-[11px] tracking-[0.08em] text-ink-muted uppercase">The decision</p>
			<p class="mt-1 font-display text-xl font-semibold text-ink">{d.chosenTitle}</p>
			{#if d.dateStart && d.dateEnd}
				<p class="mt-1 text-sm text-ink-soft">{formatDateRange(d.dateStart, d.dateEnd)}</p>
			{/if}
			<p class="mt-2 text-[12px] text-ink-muted">
				<!-- eslint-disable-next-line svelte/no-useless-mustaches -- {' '} keeps the space Svelte would trim at the block start -->
				Chosen by {d.chooserName}{#if decidedOn(d.decidedAt)}{' '}on {decidedOn(d.decidedAt)}{/if}.
			</p>
		</div>
	</Card>

	<p class="px-0.5 text-[9.5px] font-bold tracking-[0.12em] text-ink-muted uppercase">
		What we weighed
	</p>

	{#each d.scenarios as sc (sc.id)}
		<Card>
			<div class="p-4 {sc.won ? '' : 'opacity-80'}">
				<div class="flex items-start justify-between gap-2">
					<h2 class="font-display text-base font-semibold text-ink">{sc.title}</h2>
					{#if sc.won}
						<span
							class="shrink-0 rounded-full bg-moss px-2 py-0.5 text-[10px] font-semibold text-paper"
							>Chosen</span
						>
					{:else}
						<span class="shrink-0 font-mono text-[10px] text-ink-muted">not chosen</span>
					{/if}
				</div>
				<p class="mt-0.5 text-[11px] text-ink-muted">{sc.champion_name}'s pitch</p>
				{#if sc.pitch}<p class="mt-1 text-sm text-ink-soft">{sc.pitch}</p>{/if}

				{#if (sc.date_start && sc.date_end) || sc.budget_per_person > 0}
					<div
						class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[12.5px] text-ink-soft"
					>
						{#if sc.date_start && sc.date_end}<span
								>📅 {formatDateRange(sc.date_start, sc.date_end)}</span
							>{/if}
						{#if sc.budget_per_person > 0}<span>💰 {money(sc.budget_per_person)}/person</span>{/if}
					</div>
				{/if}

				{#if sc.phase_sketch?.length > 0}
					<div class="mt-2"><ScenarioSketchStrip sketch={sc.phase_sketch} /></div>
				{/if}

				{#if sc.keystone_labels?.length > 0}
					<div class="mt-2 flex flex-wrap gap-1.5">
						{#each sc.keystone_labels as label (label)}
							<span class="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-soft"
								>{label}</span
							>
						{/each}
					</div>
				{/if}

				{#if voteSummary(sc.votes)}
					<p class="mt-2 text-[11px] text-ink-muted">Votes: {voteSummary(sc.votes)}</p>
				{/if}

				{#if sc.pros?.length > 0 || sc.cons?.length > 0}
					<div class="mt-2 space-y-0.5 text-[12px]">
						{#each sc.pros as p (p)}<p class="text-ink-soft">👍 {p}</p>{/each}
						{#each sc.cons as c (c)}<p class="text-ink-soft">👎 {c}</p>{/each}
					</div>
				{/if}
			</div>
		</Card>
	{/each}

	<p class="px-0.5 text-center text-[11px] text-ink-muted italic">
		This record is kept as-is — a snapshot of the moment you decided.
	</p>
</main>
