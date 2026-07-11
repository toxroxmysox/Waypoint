<script lang="ts">
	import { enhance } from '$app/forms';
	import NavBar from '$lib/ui/NavBar.svelte';
	import SubTabs from '$lib/ui/SubTabs.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Avatar from '$lib/ui/Avatar.svelte';
	import BottomSheet from '$lib/ui/BottomSheet.svelte';
	import GoalSentimentStacks from '$lib/collaboration/components/GoalSentimentStacks.svelte';
	import GoalVoteResultsSheet from '$lib/collaboration/components/GoalVoteResultsSheet.svelte';
	import { memberDisplayName, memberInitial } from '$lib/itinerary/member-name';
	import { untrack } from 'svelte';
	import type { TripGoal } from '$lib/types';

	let { data, form } = $props();

	let createOpen = $state(false);
	let creating = $state(false);

	// Vote-results sheet — opened by tapping a goal's sentiment stacks.
	let resultsOpen = $state(false);
	let resultsGoal = $state<TripGoal | null>(null);
	const votesByGoal = $derived(data.votesByGoal ?? {});

	function openResults(goal: TripGoal) {
		resultsGoal = goal;
		resultsOpen = true;
	}

	// Optimistic list: seed from server, append the new goal on submit, then
	// reconcile against the re-loaded data once the action resolves.
	let goals = $state<TripGoal[]>(untrack(() => data.goals ?? []));
	$effect(() => {
		goals = data.goals ?? [];
	});

	const canAdd = $derived(data.membership.role !== 'viewer');

	function authorOf(goal: TripGoal) {
		return goal.expand?.created_by ?? null;
	}

	// The author's avatar comes from the enriched members list (created_by is a
	// trip member); '' → Avatar renders the initials chip.
	function authorAvatar(goal: TripGoal): string {
		return data.members.find((m) => m.id === goal.created_by)?.avatarUrl ?? '';
	}
</script>

<NavBar
	title={data.trip.title}
	subtitle={data.trip.location_summary || undefined}
	subtitleStyle="tagline"
	back
	backHref="/trips"
/>
<SubTabs
	tabs={[
		{ id: 'overview', label: 'Overview', href: `/trips/${data.trip.slug}` },
		{ id: 'phases', label: 'Phases', href: `/trips/${data.trip.slug}/phases` },
		{ id: 'lists', label: 'Lists', href: `/trips/${data.trip.slug}/lists` },
		{ id: 'goals', label: 'Goals', href: `/trips/${data.trip.slug}/goals` }
	]}
/>

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8">
	<div class="mb-3 flex items-baseline justify-between px-0.5">
		<h1 class="font-display text-ink text-[22px] font-semibold">Goals</h1>
		<span class="text-ink-muted text-[11.5px] font-medium">
			{goals.length} goal{goals.length === 1 ? '' : 's'}
		</span>
	</div>

	{#if canAdd}
		<!-- Wizard entry (#79): the capture minigame launches from the top of the list. -->
		<a
			href="/trips/{data.trip.slug}/goals/capture"
			class="border-moss/40 bg-moss-tint mb-3 flex items-center gap-3 rounded-[14px] border px-[15px] py-3"
		>
			<span class="bg-moss text-paper flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg" aria-hidden="true">✦</span>
			<span class="min-w-0 flex-1">
				<span class="text-ink block text-[14.5px] font-semibold">Add &amp; review goals</span>
				<span class="text-ink-soft block text-[12px]">Brain-dump your goals and react to the group's</span>
			</span>
			<span class="text-moss" aria-hidden="true">›</span>
		</a>
	{/if}

	{#if goals.length > 0}
		<Card>
			{#each goals as goal, i (goal.id)}
				{@const author = authorOf(goal)}
				<div
					class="relative hover:bg-surface-2 flex items-center gap-3 px-[15px] py-[13px] {i < goals.length - 1
						? 'border-line border-b'
						: ''}"
				>
					<Avatar img={authorAvatar(goal)} initial={memberInitial(author)} alt={memberDisplayName(author)} size={28} />
					<div class="min-w-0 flex-1">
						<div class="text-ink text-[14.5px] font-semibold">
							<!-- Stretched link: the ::after covers the whole row for navigation, while the
							     sentiment-stacks button below sits above it (relative z-10) and stays tappable. -->
							<a href="/trips/{data.trip.slug}/goals/{goal.id}" class="after:absolute after:inset-0"
								>{goal.title}</a
							>
						</div>
						{#if goal.description}
							<div class="text-ink-soft mt-0.5 truncate text-[12px]">{goal.description}</div>
						{/if}
						<div class="text-ink-muted mt-0.5 text-[11px]">{memberDisplayName(author)}</div>
						{#if votesByGoal[goal.id]?.length}
							<div class="relative z-10 mt-1.5 w-fit">
								<GoalSentimentStacks
									votes={votesByGoal[goal.id]}
									members={data.members}
									onOpen={() => openResults(goal)}
								/>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</Card>
	{/if}

	{#if canAdd}
		<button
			type="button"
			onclick={() => (createOpen = true)}
			class="border-line text-moss mt-2.5 flex w-full items-center gap-2.5 rounded-[14px] border-[1.5px] border-dashed px-[15px] py-3"
		>
			<span
				class="border-moss text-moss flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed"
			>
				<svg width="13" height="13" viewBox="0 0 14 14" fill="none">
					<path d="M7 2.5v9M2.5 7h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
				</svg>
			</span>
			<span class="text-[13.5px] font-semibold">Add a goal</span>
		</button>
	{/if}

	{#if goals.length === 0}
		<p class="text-ink-muted font-display mt-6 px-1 text-sm italic">
			No goals yet. What does everyone want out of this trip?
		</p>
	{/if}
</main>

<GoalVoteResultsSheet
	bind:open={resultsOpen}
	title={resultsGoal?.title ?? 'Votes'}
	votes={resultsGoal ? (votesByGoal[resultsGoal.id] ?? []) : []}
	members={data.members}
/>

<BottomSheet bind:open={createOpen} title="Add a goal">
	{#if form?.error}
		<p class="text-error mb-3 text-sm">{form.error}</p>
	{/if}
	<form
		method="POST"
		action="?/create"
		use:enhance={({ formData }) => {
			creating = true;
			// Optimistic: drop a temporary row in immediately, authored by me.
			const title = formData.get('title')?.toString().trim() ?? '';
			const description = formData.get('description')?.toString().trim() ?? '';
			const temp = {
				id: `optimistic-${Date.now()}`,
				trip: data.trip.id,
				title,
				description,
				created_by: data.membership.id,
				manual_status: 'unplanned',
				sort_order: goals.length,
				items: [],
				expand: { created_by: data.membership }
			} as unknown as TripGoal;
			if (title) goals = [...goals, temp];

			return async ({ result, update }) => {
				creating = false;
				if (result.type === 'success') {
					createOpen = false;
					await update(); // re-load reconciles the temp row with the saved record
				} else {
					goals = goals.filter((g) => !g.id.startsWith('optimistic-'));
					await update();
				}
			};
		}}
		class="space-y-3"
	>
		<div>
			<label for="goal_title" class="text-ink-soft block text-sm font-medium">Goal</label>
			<input
				id="goal_title"
				name="title"
				type="text"
				required
				placeholder="See the northern lights, eat at every market…"
				class="border-line bg-surface text-ink mt-1 w-full rounded-md border px-3 py-2 text-sm"
			/>
		</div>
		<div>
			<label for="goal_description" class="text-ink-soft block text-sm font-medium">
				Notes <span class="text-ink-muted font-normal">(optional)</span>
			</label>
			<textarea
				id="goal_description"
				name="description"
				rows="2"
				placeholder="Anything to add?"
				class="border-line bg-surface text-ink mt-1 w-full rounded-md border px-3 py-2 text-sm"
			></textarea>
		</div>
		<Button type="submit" variant="moss" size="md" class="w-full" disabled={creating}>
			{creating ? 'Adding…' : 'Add goal'}
		</Button>
	</form>
</BottomSheet>
