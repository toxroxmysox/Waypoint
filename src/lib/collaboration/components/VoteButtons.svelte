<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Vote } from '$lib/types';
	import { VOTE_OPTIONS, type VoteValue } from '$lib/collaboration/voting';
	import { optimisticSubmit, nextVote } from '$lib/ui/optimistic-submit';

	let {
		myVote = null,
		itemUrl = ''
	}: {
		myVote?: Vote | null;
		itemUrl?: string;
	} = $props();

	// #364 — optimistic vote. `override` (undefined = trust server) holds the
	// tapped value only while the submit is in flight; it's dropped once fresh
	// data lands, or on failure (= revert + toast).
	let override = $state<VoteValue | null | undefined>(undefined);
	let inflight = false;
	const serverValue = $derived((myVote?.value as VoteValue | undefined) ?? null);
	const shownValue = $derived(override === undefined ? serverValue : override);

	function voteEnhance(option: VoteValue) {
		return optimisticSubmit({
			busy: () => inflight,
			apply: () => {
				inflight = true;
				override = nextVote(shownValue, option);
			},
			settle: () => {
				inflight = false;
				override = undefined;
			},
			errorMessage: 'Vote did not save — check your connection.'
		});
	}

	const OPTION_META: Record<VoteValue, { label: string; glyph: string; active: string }> = {
		love: { label: 'Love', glyph: '♥', active: 'bg-moss text-paper border-moss' },
		like: { label: 'Like', glyph: '+', active: 'bg-moss/15 text-moss border-moss/40' },
		flexible: { label: 'Flexible', glyph: '~', active: 'bg-line/60 text-ink border-line' },
		dislike: { label: 'Pass', glyph: '–', active: 'bg-clay/15 text-clay border-clay/40' }
	};
</script>

<div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Vote on this item">
	{#each VOTE_OPTIONS as option (option)}
		<!-- The form posts against SERVER state (vote vs unvote + vote_id); only the
		     rendering follows the optimistic value. They differ only mid-flight,
		     when further submits are cancelled anyway. -->
		{@const selected = serverValue === option}
		{@const shown = shownValue === option}
		<form
			method="POST"
			action="{itemUrl}?/{selected ? 'unvote' : 'vote'}"
			use:enhance={voteEnhance(option)}
		>
			{#if selected}
				<input type="hidden" name="vote_id" value={myVote?.id} />
			{:else}
				<input type="hidden" name="value" value={option} />
			{/if}
			<button
				type="submit"
				aria-pressed={shown}
				class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors
					{shown
					? OPTION_META[option].active
					: 'border-line text-ink-muted hover:border-moss/40 active:border-moss/40 hover:text-moss active:text-moss'}"
			>
				<span aria-hidden="true">{OPTION_META[option].glyph}</span>
				<span>{OPTION_META[option].label}</span>
			</button>
		</form>
	{/each}
</div>
