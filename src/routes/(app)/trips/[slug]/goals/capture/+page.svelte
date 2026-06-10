<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import type { Vote } from '$lib/types';
	import { type VoteValue } from '$lib/collaboration/voting';
	import SwipeDeck from '$lib/collaboration/components/swipe/SwipeDeck.svelte';
	import Avatar from '$lib/ui/Avatar.svelte';
	import Button from '$lib/ui/Button.svelte';
	import { memberDisplayName, memberInitial } from '$lib/itinerary/member-name';
	import { toast } from '$lib/shell/stores/toast';
	import type { WizardCard } from './+page.server';

	let { data } = $props();

	const goalsHref = $derived(`/trips/${data.trip.slug}/goals`);

	// tablet+ uses a centered modal for detail; mobile uses a bottom sheet.
	let isWide = $state(false);
	$effect(() => {
		const mq = window.matchMedia('(min-width: 900px)');
		const sync = () => (isWide = mq.matches);
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});

	// ── wizard tallies / per-prompt goal bookkeeping ──────────────────────
	let goalsAdded = $state(0);
	let promptInput = $state('');
	// Per prompt-card id: the goal titles (optimistic chips) and the saved goal ids
	// (for rewind-delete). Keyed by the card id so each prompt undoes only its own.
	let goalTitlesByCard = $state<Record<string, string[]>>({});
	let goalIdsByCard = $state<Record<string, string[]>>({});
	let pendingAddCardId = '';
	// Bumped by "Go again" to remount the deck (its internal idx is private state).
	let runKey = $state(0);

	async function goAgain() {
		await invalidateAll(); // rebuild the deck — now excludes goals just voted on
		goalsAdded = 0;
		goalTitlesByCard = {};
		goalIdsByCard = {};
		promptInput = '';
		runKey += 1;
	}

	// Pending unflushed input → goals (comma/newline separated → "Add N & continue").
	const pendingGoals = $derived(
		promptInput
			.split(/[,\n]/)
			.map((s) => s.trim())
			.filter(Boolean)
	);

	// ── background persistence forms ──────────────────────────────────────
	let addGoalForm = $state<HTMLFormElement | null>(null);
	let deleteGoalForm = $state<HTMLFormElement | null>(null);
	let voteForm = $state<HTMLFormElement | null>(null);
	let unvoteForm = $state<HTMLFormElement | null>(null);

	function setFields(form: HTMLFormElement, fields: Record<string, string>) {
		for (const [name, val] of Object.entries(fields)) {
			(form.elements.namedItem(name) as HTMLInputElement).value = val;
		}
		form.requestSubmit();
	}

	function addOne(cardId: string, title: string) {
		const t = title.trim();
		if (!t || !addGoalForm) return;
		pendingAddCardId = cardId;
		goalsAdded += 1; // optimistic
		goalTitlesByCard = { ...goalTitlesByCard, [cardId]: [...(goalTitlesByCard[cardId] ?? []), t] };
		setFields(addGoalForm, { title: t });
	}

	function flush(cardId: string) {
		for (const w of pendingGoals) addOne(cardId, w);
		promptInput = '';
	}

	function nextPrompt(card: WizardCard, advance: () => void) {
		flush(card.id);
		advance();
	}

	function persistVote(card: WizardCard, value: VoteValue) {
		if (card.kind !== 'reaction' || !voteForm) return;
		setFields(voteForm, { goal: card.goal.id, value });
	}
	function persistRewind(card: WizardCard) {
		if (card.kind !== 'reaction' || !unvoteForm) return;
		setFields(unvoteForm, { goal: card.goal.id });
	}
	function persistRewindPrompt(card: WizardCard) {
		if (card.kind !== 'prompt') return;
		const ids = goalIdsByCard[card.id] ?? [];
		const titles = goalTitlesByCard[card.id] ?? [];
		if (ids.length && deleteGoalForm) setFields(deleteGoalForm, { goals: ids.join(',') });
		goalsAdded = Math.max(0, goalsAdded - titles.length);
		goalIdsByCard = { ...goalIdsByCard, [card.id]: [] };
		goalTitlesByCard = { ...goalTitlesByCard, [card.id]: [] };
		promptInput = '';
	}

	function onPromptKey(e: KeyboardEvent, cardId: string) {
		if (e.key === 'Enter') {
			e.preventDefault();
			flush(cardId);
		}
	}
</script>

<!-- background persistence (progressive-enhancement form actions, fired by the deck) -->
<form
	bind:this={addGoalForm}
	method="POST"
	action="?/addGoal"
	class="hidden"
	use:enhance={() =>
		async ({ result }) => {
			if (result.type === 'success' && result.data?.goalId) {
				const cid = pendingAddCardId;
				const gid = String(result.data.goalId);
				goalIdsByCard = { ...goalIdsByCard, [cid]: [...(goalIdsByCard[cid] ?? []), gid] };
			} else if (result.type === 'failure') {
				goalsAdded = Math.max(0, goalsAdded - 1);
				toast.show('Goal did not save — check your connection.', 'error');
			}
		}}
>
	<input type="hidden" name="title" value="" />
</form>
<form
	bind:this={deleteGoalForm}
	method="POST"
	action="?/deleteGoal"
	class="hidden"
	use:enhance={() => async () => {}}
>
	<input type="hidden" name="goals" value="" />
</form>
<form
	bind:this={voteForm}
	method="POST"
	action="?/vote"
	class="hidden"
	use:enhance={() =>
		async ({ result }) => {
			if (result.type === 'failure') toast.show('Vote did not save — check your connection.', 'error');
		}}
>
	<input type="hidden" name="goal" value="" />
	<input type="hidden" name="value" value="" />
</form>
<form
	bind:this={unvoteForm}
	method="POST"
	action="?/unvote"
	class="hidden"
	use:enhance={() => async () => {}}
>
	<input type="hidden" name="goal" value="" />
</form>

<div class="bg-paper flex min-h-[100dvh] flex-col">
	<div
		class="mx-auto flex w-full max-w-md flex-1 flex-col md-desktop:my-6 md-desktop:max-h-[760px] md-desktop:max-w-md md-desktop:overflow-hidden md-desktop:rounded-xl md-desktop:border md-desktop:border-line md-desktop:bg-surface md-desktop:shadow-modal"
	>
		{#if data.cards.length === 0}
			<!-- drain-to-empty: nothing to add or react to right now -->
			<div class="flex flex-1 flex-col items-center justify-center px-6 text-center">
				<div class="text-moss mb-4 text-4xl" aria-hidden="true">✓</div>
				<h1 class="font-display text-ink mb-2 text-2xl italic">You're all caught up.</h1>
				<p class="text-ink-soft mb-6 max-w-xs text-sm">
					No new goals to react to. Check back as the group adds more.
				</p>
				<div class="flex w-full max-w-[280px] flex-col gap-2.5">
					<Button onclick={() => goto(goalsHref)}>See the goal list</Button>
				</div>
			</div>
		{:else}
			{#key runKey}
			<SwipeDeck
				cards={data.cards as WizardCard[]}
				othersByCard={data.votesByGoal as unknown as Record<string, Vote[]>}
				members={data.members}
				kindOf={(c) => (c.kind === 'prompt' ? 'prompt' : 'vote')}
				title="Add & review goals"
				subtitle={data.trip.location_summary || 'Goals'}
				detailLayout={isWide ? 'modal' : 'sheet'}
				autoFocus={isWide}
				onvote={persistVote}
				onrewind={persistRewind}
				onrewindPrompt={persistRewindPrompt}
				onclose={() => goto(goalsHref)}
			>
				{#snippet face(card)}
					{#if card.kind === 'prompt'}
						<div class="min-h-[180px]">
							<div class="text-moss mb-3 inline-flex items-center gap-1.5 text-[11.5px] font-semibold tracking-wide uppercase">
								<span aria-hidden="true">✎</span> Your goal
							</div>
							<h2 class="font-display text-ink text-[21px] leading-snug font-semibold">
								{card.text}
							</h2>
							<input
								type="text"
								bind:value={promptInput}
								onkeydown={(e) => onPromptKey(e, card.id)}
								onpointerdown={(e) => e.stopPropagation()}
								placeholder="Type a goal, press enter…"
								class="border-line bg-surface text-ink mt-4 w-full rounded-lg border px-3 py-2.5 text-sm"
							/>
							{#if (goalTitlesByCard[card.id] ?? []).length}
								<div class="mt-3 flex flex-wrap gap-1.5">
									{#each goalTitlesByCard[card.id] as title, i (i)}
										<span
											class="bg-moss-tint text-moss border-moss/30 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium"
										>
											<span aria-hidden="true">✓</span>{title}
										</span>
									{/each}
								</div>
							{/if}
						</div>
					{:else}
						{@const author = card.goal.expand?.created_by ?? null}
						{@const authorImg = data.members.find((m) => m.id === card.goal.created_by)?.avatarUrl ?? ''}
						<div class="min-h-[180px]">
							<div class="text-ink-muted mb-3 inline-flex items-center gap-1.5 text-[11.5px] font-semibold tracking-wide uppercase">
								<span aria-hidden="true">♡</span> A group goal
							</div>
							<h2 class="font-display text-ink text-[21px] leading-snug font-semibold">
								{card.goal.title}
							</h2>
							{#if card.goal.description}
								<p class="text-ink-soft mt-2 text-[13px] leading-relaxed">{card.goal.description}</p>
							{/if}
							<div class="text-ink-muted mt-4 flex items-center gap-2 text-[12px]">
								<Avatar img={authorImg} initial={memberInitial(author)} alt={memberDisplayName(author)} size={22} />
								<span>Added by {memberDisplayName(author)}</span>
							</div>
						</div>
					{/if}
				{/snippet}

				{#snippet promptControls(card, { advance })}
					<!-- One adaptive action: flush pending input (count-reflecting label),
					     else continue, else skip an untouched prompt. -->
					<button
						type="button"
						onclick={() => nextPrompt(card, advance)}
						class="w-full rounded-full px-4 py-3 text-sm font-semibold {pendingGoals.length > 0 ||
						(goalTitlesByCard[card.id] ?? []).length > 0
							? 'bg-moss text-paper'
							: 'border-line bg-surface text-ink-soft border'}"
					>
						{pendingGoals.length > 0
							? `Add ${pendingGoals.length} & continue`
							: (goalTitlesByCard[card.id] ?? []).length > 0
								? 'Continue'
								: 'Skip this prompt'}
					</button>
				{/snippet}

				{#snippet complete({ rated })}
					<div class="flex flex-col items-center justify-center text-center">
						<div class="text-moss mb-4 text-4xl" aria-hidden="true">✦</div>
						<div class="font-display text-ink mb-2 text-2xl italic">You're all caught up.</div>
						<p class="text-ink-soft mb-5 max-w-[260px] text-sm leading-relaxed">
							{goalsAdded}
							{goalsAdded === 1 ? 'goal' : 'goals'} added · {rated}
							{rated === 1 ? 'goal' : 'goals'} rated.
						</p>
						<div class="flex w-full max-w-[280px] flex-col gap-2.5">
							<Button onclick={() => goto(goalsHref)}>See the goal list</Button>
							<Button variant="outline" onclick={goAgain}>Go again</Button>
						</div>
					</div>
				{/snippet}
			</SwipeDeck>
			{/key}
		{/if}
	</div>
</div>
