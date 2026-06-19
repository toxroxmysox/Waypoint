<script lang="ts">
	// Compact vote count for an item card (#224, ADR-0011). Card avatars now denote
	// assignees, so votes retreat from avatar stacks to this icon + count pill. The
	// who-voted-what avatar stacks (VoteStacks) stay on item detail + the swipe deck.
	// Shows a COUNT, never the (still never-numeric) weighted score. Display-only.
	// Target-agnostic (ADR-0004/0009): renders item/goal/suggestion vote arrays.
	import type { DisplayVote } from '$lib/collaboration/voting';

	let {
		votes = [],
		size = 14
	}: {
		votes?: DisplayVote[];
		size?: number;
	} = $props();

	const count = $derived(votes.length);
</script>

{#if count > 0}
	<span
		class="text-ink-muted inline-flex items-center gap-1 text-[12px] font-medium tabular-nums"
		aria-label="{count} {count === 1 ? 'vote' : 'votes'}"
		title="{count} {count === 1 ? 'vote' : 'votes'}"
	>
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
		</svg>
		{count}
	</span>
{/if}
