<script lang="ts">
	// #337 — a rich scenario card (spec §Surface, mockup board-v3.html). Vertical
	// sections with quiet uppercase hairline headers:
	//   1. Title + champion + fork lineage
	//   2. When & how much — date window + nights · budget/person
	//   3. The shape of it — the phase sketch mini-strip
	//   4. Going here, doing this — keystone chips
	//   5. The group — vote avatar stacks (never numeric) + pro/con counts
	// Converge-over-time: a LIVE dimension this card hasn't filled renders a quiet
	// empty slot ("no dates yet") instead of the content.
	import type { BoardScenario } from '$lib/ideation/scenario-board.server';
	import type { MemberWithAvatar } from '$lib/collaboration/member-avatar';
	import Card from '$lib/ui/Card.svelte';
	import VoteStacks from '$lib/collaboration/components/VoteStacks.svelte';
	import ScenarioSketchStrip from './ScenarioSketchStrip.svelte';
	import { formatDateRange } from '$lib/shell/format';

	let {
		scenario,
		members = [],
		href
	}: {
		scenario: BoardScenario;
		members?: MemberWithAvatar[];
		href: string;
	} = $props();

	const money = (n: number) => `~$${Math.round(n).toLocaleString('en-US')}`;
</script>

<Card>
	<a {href} class="block p-3.5" data-testid="scenario-card" data-scenario-id={scenario.id}>
		<!-- 1. Title + champion + fork lineage -->
		<div class="flex items-start justify-between gap-2">
			<h3 class="font-display text-ink text-[17px] leading-tight font-semibold">{scenario.title}</h3>
			{#if scenario.forkOfTitle}
				<span class="text-moss shrink-0 font-mono text-[10px] whitespace-nowrap">
					⑂ fork of {scenario.forkOfTitle}
				</span>
			{/if}
		</div>
		<p class="text-ink-muted mt-0.5 text-[11px]">{scenario.championName}'s pitch</p>
		{#if scenario.pitch}
			<p class="text-ink-soft mt-1 text-sm">{scenario.pitch}</p>
		{/if}

		<!-- 2. When & how much -->
		{#if scenario.dimensions.dates || scenario.dimensions.budget || scenario.emptySlots.dates || scenario.emptySlots.budget}
			<p class="text-ink-muted mt-3 border-t border-[var(--color-line)] pt-2 text-[9.5px] font-bold tracking-[0.09em] uppercase">
				When &amp; how much
			</p>
			<div class="text-ink-soft mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
				{#if scenario.dimensions.dates}
					<span>📅 <b class="text-ink font-semibold">{formatDateRange(scenario.dateStart, scenario.dateEnd)}</b> · {scenario.nights} nights</span>
				{:else if scenario.emptySlots.dates}
					<span class="text-ink-muted italic">no dates yet</span>
				{/if}
				{#if scenario.dimensions.budget}
					<span>💰 <b class="text-ink font-semibold">{money(scenario.budgetPerPerson)}</b>/person</span>
				{:else if scenario.emptySlots.budget}
					<span class="text-ink-muted italic">no budget yet</span>
				{/if}
			</div>
		{/if}

		<!-- 3. The shape of it -->
		{#if scenario.dimensions.sketch || scenario.emptySlots.sketch}
			<p class="text-ink-muted mt-3 border-t border-[var(--color-line)] pt-2 text-[9.5px] font-bold tracking-[0.09em] uppercase">
				The shape of it
			</p>
			<div class="mt-1.5">
				{#if scenario.dimensions.sketch}
					<ScenarioSketchStrip sketch={scenario.sketch} />
				{:else}
					<p class="text-ink-muted text-xs italic">no sketch yet</p>
				{/if}
			</div>
		{/if}

		<!-- 4. Going here, doing this -->
		{#if scenario.dimensions.keystones || scenario.emptySlots.keystones}
			<p class="text-ink-muted mt-3 border-t border-[var(--color-line)] pt-2 text-[9.5px] font-bold tracking-[0.09em] uppercase">
				Going here, doing this
			</p>
			{#if scenario.dimensions.keystones}
				<div class="mt-1 flex flex-wrap gap-1.5">
					{#each scenario.keystoneLabels as label (label)}
						<span class="bg-surface-2 text-ink-soft rounded-full px-2.5 py-1 text-[11px]">{label}</span>
					{/each}
				</div>
			{:else}
				<p class="text-ink-muted mt-1 text-xs italic">no anchors yet</p>
			{/if}
		{/if}

		<!-- 5. The group — vote stacks + pro/con counts (never a numeric score) -->
		{#if scenario.votes.length > 0 || scenario.proCount > 0 || scenario.conCount > 0}
			<p class="text-ink-muted mt-3 border-t border-[var(--color-line)] pt-2 text-[9.5px] font-bold tracking-[0.09em] uppercase">
				The group
			</p>
			<div class="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
				<VoteStacks votes={scenario.votes} {members} size={20} />
				{#if scenario.proCount > 0 || scenario.conCount > 0}
					<span class="text-ink-muted text-[11px]">
						{#if scenario.proCount > 0}<span class="text-moss">👍 {scenario.proCount}</span>{/if}
						{#if scenario.conCount > 0}<span class="text-clay ml-2">👎 {scenario.conCount}</span>{/if}
					</span>
				{/if}
			</div>
		{/if}
	</a>
</Card>
