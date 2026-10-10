<script lang="ts">
	// Tap-to-vote pills (#425; card system D3 amended 2026-10-06, D10). All four
	// sentiments always show (Love / Like / Flexible / Pass), each with its count;
	// my own pill is filled; tapping it again clears my vote. NEVER a score.
	//
	// Target-agnostic: pass the votes and the two form-action URLs. Items post to
	// the item page's `?/vote` / `?/unvote` (the same server path as VoteButtons);
	// a suggestion (#444) passes its own actions. Viewers (`canVote` false) see the
	// same four pills as plain counts, not tappable.
	//
	// Sits on a card that is a link and a drag source: a tap must neither navigate
	// (the host raises this above the stretched <a>) nor start a drag (mousedown /
	// touchstart never reach svelte-dnd-action's listeners on the wrapper).
	// Hit areas are REAL 44px boxes (no pseudo-element overlays: adjacent overlays
	// steal each other's clicks, #437).
	//
	// Desktop hover/focus shows who voted (names via memberDisplayName).
	import { enhance } from '$app/forms';
	import type { TripMember } from '$lib/types';
	import { memberDisplayName } from '$lib/itinerary/member-name';
	import { optimisticSubmit, nextVote } from '$lib/ui/optimistic-submit';
	import {
		votePills,
		votePillsLabel,
		withMyVote,
		type DisplayVote,
		type VoteValue
	} from '$lib/collaboration/voting';

	let {
		votes = [],
		members = [],
		myMemberId = '',
		canVote = false,
		voteAction,
		unvoteAction,
		labels = false,
		class: klass = ''
	}: {
		votes?: DisplayVote[];
		/** Resolves voter names for the tooltip. */
		members?: TripMember[];
		/** The viewer's trip_members.id: marks their pill, finds their vote. */
		myMemberId?: string;
		/** False for viewers: counts only, no buttons. */
		canVote?: boolean;
		/** Full form-action URL that sets my vote (`value`), e.g. `/trips/x/items/y?/vote`. */
		voteAction: string;
		/** Full form-action URL that clears it (`vote_id`), e.g. `…?/unvote`. */
		unvoteAction: string;
		/** Show the word beside the glyph (item page, #442: room to spare). Cards stay glyph + count. */
		labels?: boolean;
		class?: string;
	} = $props();

	// Optimistic (#364): `override` (undefined = trust the server) holds the tapped
	// value only while the submit is in flight.
	let override = $state<VoteValue | null | undefined>(undefined);
	let inflight = false;
	const myServerVote = $derived(votes.find((v) => v.member === myMemberId) ?? null);
	const serverValue = $derived((myServerVote?.value as VoteValue | undefined) ?? null);
	const shownVotes = $derived(
		override === undefined || !myMemberId ? votes : withMyVote(votes, myMemberId, override)
	);

	const nameOf = (id: string) => memberDisplayName(members.find((m) => m.id === id));
	const pills = $derived(votePills(shownVotes, myMemberId, nameOf));
	const groupLabel = $derived(votePillsLabel(pills));

	function voteEnhance(option: VoteValue) {
		return optimisticSubmit({
			busy: () => inflight,
			apply: () => {
				inflight = true;
				override = nextVote(override === undefined ? serverValue : override, option);
			},
			settle: () => {
				inflight = false;
				override = undefined;
			},
			errorMessage: 'Vote did not save — check your connection.'
		});
	}

	const FILLED: Record<VoteValue, string> = {
		love: 'bg-moss text-paper border-moss',
		like: 'bg-moss/15 text-moss border-moss/40',
		flexible: 'bg-line/60 text-ink border-line',
		dislike: 'bg-clay/15 text-clay border-clay/40'
	};
	const OPEN = 'border-line text-ink-muted';

	// Native listeners (not onmousedown): Svelte delegates those to the root, which
	// runs AFTER svelte-dnd-action's wrapper listeners. Stop the drag start here.
	function noDrag(node: HTMLElement) {
		const stop = (e: Event) => e.stopPropagation();
		node.addEventListener('mousedown', stop);
		node.addEventListener('touchstart', stop, { passive: true });
		return {
			destroy() {
				node.removeEventListener('mousedown', stop);
				node.removeEventListener('touchstart', stop);
			}
		};
	}

	// Tooltip: mouse hover / keyboard focus only (touch has no hover; nothing here
	// exists only on hover: the names are also in each pill's accessible name).
	let tip = $state<number | null>(null);
	const tipText = (i: number) => {
		const p = pills[i];
		return p.names.length ? `${p.label}: ${p.names.join(', ')}` : `${p.label}: no one yet`;
	};
</script>

<div
	use:noDrag
	class="relative flex w-fit flex-wrap items-center {klass}"
	role="group"
	aria-label={groupLabel}
	data-vote-pills
	onpointerleave={() => (tip = null)}
>
	{#each pills as pill, i (pill.value)}
		{#if canVote && myMemberId}
			{@const selected = serverValue === pill.value}
			<form
				method="POST"
				action={selected ? unvoteAction : voteAction}
				use:enhance={voteEnhance(pill.value)}
				class="contents"
			>
				{#if selected}
					<input type="hidden" name="vote_id" value={myServerVote?.id} />
				{:else}
					<input type="hidden" name="value" value={pill.value} />
				{/if}
				<button
					type="submit"
					aria-pressed={pill.mine}
					aria-label="{pill.label}, {pill.count}{pill.names.length ? `: ${pill.names.join(', ')}` : ''}"
					data-vote={pill.value}
					class="-mt-2 flex min-h-[44px] min-w-[44px] items-center justify-center"
					onpointerenter={(e) => (tip = e.pointerType === 'mouse' ? i : null)}
					onfocus={() => (tip = i)}
					onblur={() => (tip = null)}
				>
					{@render pillBody(pill, true)}
				</button>
			</form>
		{:else}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<span
				class="-mt-2 flex min-h-[44px] min-w-[44px] items-center justify-center"
				data-vote={pill.value}
				aria-label="{pill.label}, {pill.count}"
				onpointerenter={(e) => (tip = e.pointerType === 'mouse' ? i : null)}
			>
				{@render pillBody(pill, false)}
			</span>
		{/if}
	{/each}
	{#if tip !== null}
		<span
			class="bg-ink text-paper pointer-events-none absolute bottom-full left-0 z-30 mb-0.5 w-max max-w-[16rem] rounded-md px-2 py-1 text-xs shadow-card-strong"
			aria-hidden="true"
			data-vote-tip
		>
			{tipText(tip)}
		</span>
	{/if}
</div>

{#snippet pillBody(pill: import('$lib/collaboration/voting').VotePill, interactive: boolean)}
	<span
		class="inline-flex min-w-[2.5rem] items-center justify-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold tabular-nums transition-colors
			{pill.mine ? FILLED[pill.value] : OPEN}
			{interactive && !pill.mine ? 'hover:border-moss/40 hover:text-moss' : ''}"
		aria-hidden="true"
	>
		<span>{pill.glyph}</span>
		{#if labels}<span>{pill.label}</span>{/if}
		<span>{pill.count}</span>
	</span>
{/snippet}
