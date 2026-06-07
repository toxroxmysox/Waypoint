<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Vote } from '$lib/types';
	import { VOTE_OPTIONS, type VoteValue } from '$lib/collaboration/voting';

	let {
		myVote = null,
		itemUrl = ''
	}: {
		myVote?: Vote | null;
		itemUrl?: string;
	} = $props();

	let submitting = $state(false);

	const OPTION_META: Record<VoteValue, { label: string; glyph: string; active: string }> = {
		love: { label: 'Love', glyph: '♥', active: 'bg-moss text-paper border-moss' },
		like: { label: 'Like', glyph: '+', active: 'bg-moss/15 text-moss border-moss/40' },
		flexible: { label: 'Flexible', glyph: '~', active: 'bg-line/60 text-ink border-line' },
		dislike: { label: 'Pass', glyph: '–', active: 'bg-clay/15 text-clay border-clay/40' }
	};
</script>

<div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Vote on this item">
	{#each VOTE_OPTIONS as option (option)}
		{@const selected = myVote?.value === option}
		<form
			method="POST"
			action="{itemUrl}?/{selected ? 'unvote' : 'vote'}"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					submitting = false;
					await update();
				};
			}}
		>
			{#if selected}
				<input type="hidden" name="vote_id" value={myVote?.id} />
			{:else}
				<input type="hidden" name="value" value={option} />
			{/if}
			<button
				type="submit"
				disabled={submitting}
				aria-pressed={selected}
				class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50
					{selected
					? OPTION_META[option].active
					: 'border-line text-ink-muted hover:border-moss/40 hover:text-moss'}"
			>
				<span aria-hidden="true">{OPTION_META[option].glyph}</span>
				<span>{OPTION_META[option].label}</span>
			</button>
		</form>
	{/each}
</div>
