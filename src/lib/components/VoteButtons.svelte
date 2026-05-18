<script lang="ts">
	import { enhance } from '$app/forms';

	let {
		voteCount = 0,
		myVoteId = null as string | null,
		itemUrl = ''
	}: {
		voteCount?: number;
		myVoteId?: string | null;
		itemUrl?: string;
	} = $props();

	let submitting = $state(false);
</script>

{#if myVoteId}
	<form
		method="POST"
		action="{itemUrl}?/unvote"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				submitting = false;
				await update();
			};
		}}
		class="inline-flex"
	>
		<input type="hidden" name="vote_id" value={myVoteId} />
		<button
			type="submit"
			disabled={submitting}
			class="bg-moss/15 text-moss border-moss/30 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold transition-colors"
			aria-label="Remove vote"
		>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
				<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
				<path d="M1 21h4V10H1z" />
			</svg>
			<span>{voteCount}</span>
		</button>
	</form>
{:else}
	<form
		method="POST"
		action="{itemUrl}?/vote"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				submitting = false;
				await update();
			};
		}}
		class="inline-flex"
	>
		<button
			type="submit"
			disabled={submitting}
			class="border-line text-ink-muted hover:border-moss/40 hover:text-moss inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors"
			aria-label="Vote for this option"
		>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
				<path d="M1 21h4V10H1z" />
			</svg>
			<span>{voteCount || ''}</span>
		</button>
	</form>
{/if}
