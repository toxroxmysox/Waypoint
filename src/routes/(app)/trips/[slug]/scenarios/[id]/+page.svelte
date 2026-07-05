<script lang="ts">
	import { enhance } from '$app/forms';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import VoteStacks from '$lib/collaboration/components/VoteStacks.svelte';
	import ScenarioSketchStrip from '$lib/ideation/components/ScenarioSketchStrip.svelte';
	import { VOTE_OPTIONS, type VoteValue } from '$lib/collaboration/voting';

	let { data, form } = $props();
	const s = $derived(data.scenario);

	let submitting = $state(false);
	let pointKind = $state<'pro' | 'con'>('pro');
	let pointText = $state('');
	let confirmPromote = $state(false);
	let confirmDelete = $state(false);

	const money = (n: number) => `~$${Math.round(n).toLocaleString('en-US')}`;

	const OPTION_META: Record<VoteValue, { label: string; glyph: string; active: string }> = {
		love: { label: 'Love', glyph: '♥', active: 'bg-moss text-paper border-moss' },
		like: { label: 'Like', glyph: '+', active: 'bg-moss/15 text-moss border-moss/40' },
		flexible: { label: 'Flexible', glyph: '~', active: 'bg-line/60 text-ink border-line' },
		dislike: { label: 'Pass', glyph: '–', active: 'bg-clay/15 text-clay border-clay/40' }
	};

	function voteEnhance() {
		submitting = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			submitting = false;
			await update();
		};
	}
</script>

<NavBar title="Scenario" back backHref="/trips/{data.trip.slug}" />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-10 space-y-4">
	{#if form?.error}
		<p role="alert" class="text-error-deep text-sm">{form.error}</p>
	{/if}

	<!-- The scenario -->
	<Card>
		<div class="p-4">
			<div class="flex items-start justify-between gap-2">
				<h1 class="font-display text-ink text-xl font-semibold leading-tight">{s.title}</h1>
				{#if s.forkOfTitle}
					<span class="text-moss shrink-0 font-mono text-[10px] whitespace-nowrap">⑂ fork of {s.forkOfTitle}</span>
				{/if}
			</div>
			<p class="text-ink-muted mt-0.5 text-[12px]">{s.championName}'s pitch</p>
			{#if s.pitch}<p class="text-ink-soft mt-2 text-sm">{s.pitch}</p>{/if}

			{#if s.hasDates || s.budgetPerPerson > 0}
				<div class="text-ink-soft mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--color-line)] pt-3 text-[13px]">
					{#if s.hasDates}<span>📅 <b class="text-ink font-semibold">{s.dateRange}</b> · {s.nights} nights</span>{/if}
					{#if s.budgetPerPerson > 0}<span>💰 <b class="text-ink font-semibold">{money(s.budgetPerPerson)}</b>/person</span>{/if}
				</div>
			{/if}

			{#if s.sketch.length > 0}
				<p class="text-ink-muted mt-3 text-[9.5px] font-bold tracking-[0.09em] uppercase">The shape of it</p>
				<div class="mt-1.5"><ScenarioSketchStrip sketch={s.sketch} /></div>
			{/if}

			{#if s.keystoneLabels.length > 0}
				<p class="text-ink-muted mt-3 text-[9.5px] font-bold tracking-[0.09em] uppercase">Going here, doing this</p>
				<div class="mt-1 flex flex-wrap gap-1.5">
					{#each s.keystoneLabels as label (label)}
						<span class="bg-surface-2 text-ink-soft rounded-full px-2.5 py-1 text-[11px]">{label}</span>
					{/each}
				</div>
			{/if}
		</div>
	</Card>

	<!-- Weigh in: 4-option vote -->
	{#if data.perms.canWeigh}
		<div>
			<p class="text-ink-muted mb-1.5 px-0.5 text-[9.5px] font-bold tracking-[0.12em] uppercase">Your take</p>
			<div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Vote on this scenario">
				{#each VOTE_OPTIONS as option (option)}
					{@const selected = data.myVote?.value === option}
					<form method="POST" action="?/{selected ? 'unvote' : 'vote'}" use:enhance={voteEnhance}>
						{#if !selected}<input type="hidden" name="value" value={option} />{/if}
						<button
							type="submit"
							disabled={submitting}
							aria-pressed={selected}
							data-testid="vote-{option}"
							class="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50
								{selected ? OPTION_META[option].active : 'border-line text-ink-muted hover:border-moss/40 hover:text-moss'}"
						>
							<span aria-hidden="true">{OPTION_META[option].glyph}</span>
							<span>{OPTION_META[option].label}</span>
						</button>
					</form>
				{/each}
			</div>
		</div>
	{/if}

	<!-- The group's votes -->
	{#if data.votes.length > 0}
		<div>
			<p class="text-ink-muted mb-1.5 px-0.5 text-[9.5px] font-bold tracking-[0.12em] uppercase">The group</p>
			<VoteStacks votes={data.votes} members={data.members} size={22} />
		</div>
	{/if}

	<!-- Pros & cons -->
	<div>
		<p class="text-ink-muted mb-1.5 px-0.5 text-[9.5px] font-bold tracking-[0.12em] uppercase">Pros &amp; cons</p>
		<Card>
			<div class="p-4">
				{#if data.points.length > 0}
					<ul class="space-y-2" data-testid="points-list">
						{#each data.points as pt (pt.id)}
							<li class="flex items-start gap-2 text-sm">
								<span class="mt-0.5 shrink-0 text-xs font-bold {pt.kind === 'pro' ? 'text-moss' : 'text-clay'}">
									{pt.kind === 'pro' ? '👍' : '👎'}
								</span>
								<span class="text-ink-soft min-w-0 flex-1">{pt.text}
									<span class="text-ink-muted text-[11px]">— {pt.authorName}</span>
								</span>
								{#if pt.mine}
									<form method="POST" action="?/deletePoint" use:enhance={voteEnhance}>
										<input type="hidden" name="point_id" value={pt.id} />
										<button type="submit" aria-label="Delete" class="text-ink-muted hover:text-clay text-xs">×</button>
									</form>
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-ink-muted text-sm italic">No pros or cons yet.</p>
				{/if}

				{#if data.perms.canWeigh}
					<form method="POST" action="?/addPoint" use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; pointText = ''; await update({ reset: false }); }; }} class="mt-3 border-t border-[var(--color-line)] pt-3">
						<div class="flex items-center gap-1.5">
							<button type="button" onclick={() => (pointKind = 'pro')} aria-pressed={pointKind === 'pro'} class="rounded-full border px-2.5 py-1 text-[11px] font-semibold {pointKind === 'pro' ? 'bg-moss text-paper border-moss' : 'border-line text-ink-muted'}">👍 Pro</button>
							<button type="button" onclick={() => (pointKind = 'con')} aria-pressed={pointKind === 'con'} class="rounded-full border px-2.5 py-1 text-[11px] font-semibold {pointKind === 'con' ? 'bg-clay text-paper border-clay' : 'border-line text-ink-muted'}">👎 Con</button>
						</div>
						<input type="hidden" name="kind" value={pointKind} />
						<div class="mt-2 flex items-center gap-2">
							<input name="text" bind:value={pointText} maxlength="200" placeholder="Add a {pointKind}…" data-testid="point-input" class="border-line bg-surface text-ink min-w-0 flex-1 rounded-md border px-2.5 py-1.5 text-sm" />
							<Button type="submit" variant="moss" size="sm" disabled={submitting || !pointText.trim()}>Add</Button>
						</div>
					</form>
				{/if}
			</div>
		</Card>
	</div>

	<!-- Actions: fork (anyone), champion edit/delete, owner promote -->
	<div class="space-y-2 pt-1">
		{#if data.perms.canWeigh}
			<Button href="/trips/{data.trip.slug}/scenarios/new?fork={s.id}" variant="ghost" size="md" class="w-full" testid="fork-scenario">
				⑂ Fork this scenario
			</Button>
		{/if}

		{#if data.perms.isChampion}
			<div class="flex gap-2">
				<Button href="/trips/{data.trip.slug}/scenarios/new?fork={s.id}" variant="ghost" size="sm" class="flex-1">Edit (as a fork)</Button>
				{#if !confirmDelete}
					<Button variant="ghost" size="sm" onclick={() => (confirmDelete = true)} testid="delete-scenario">Delete</Button>
				{:else}
					<form method="POST" action="?/deleteScenario" use:enhance={voteEnhance}>
						<Button type="submit" variant="outline" size="sm" loading={submitting} class="!border-clay !text-clay">Confirm delete</Button>
					</form>
					<Button variant="ghost" size="sm" onclick={() => (confirmDelete = false)}>Keep</Button>
				{/if}
			</div>
		{/if}

		{#if data.perms.isOwnerTier}
			<!-- Promotion — owner/co_owner. GATE: the scenario needs both dates. -->
			{#if data.perms.canPromote}
				{#if !confirmPromote}
					<Button variant="moss" size="md" class="w-full" onclick={() => (confirmPromote = true)} testid="promote">
						Go with this one
					</Button>
				{:else}
					<Card strong accent="var(--color-moss)">
						<div class="p-4">
							<p class="text-ink text-sm font-semibold">Lock in “{s.title}”?</p>
							<p class="text-ink-muted mt-1 text-xs">
								This sets the trip to {s.dateRange}, builds the days
								{#if s.sketch.length > 0}and phases{/if}, and records the decision. The other
								scenarios are archived. One-way — like setting the dates.
							</p>
							<div class="mt-3 flex gap-2">
								<form method="POST" action="?/promote" use:enhance={voteEnhance} class="flex-1">
									<Button type="submit" variant="moss" size="md" class="w-full" loading={submitting} testid="promote-confirm">
										Yes, go with this
									</Button>
								</form>
								<Button variant="ghost" size="md" onclick={() => (confirmPromote = false)}>Not yet</Button>
							</div>
						</div>
					</Card>
				{/if}
			{:else}
				<p class="text-ink-muted rounded-md border border-dashed border-[var(--color-line)] px-3 py-2 text-center text-xs">
					Add both dates to this scenario before it can be chosen.
				</p>
			{/if}
		{/if}
	</div>
</main>
