<script lang="ts">
	// Compact per-sentiment vote summary for an item card (#350 — amends ADR-0011).
	// ADR-0011 (#224) moved votes off card avatars onto a single count pill, but a
	// lone thumbs-up glyph miscommunicated a mixed tally as unanimous approval
	// (#350). This renders the SAME glyph vocabulary as VoteStacks — ♥ love /
	// + like / ~ flexible / – pass — as glyph+count groups, showing only non-zero
	// groups. Card avatars still mean assignees (ADR-0011 stands); votes stay off
	// the avatars. NEVER a numeric weighted score (design invariant). Display-only.
	// Target-agnostic (ADR-0004/0009): renders item/goal/suggestion vote arrays.
	import {
		VOTE_OPTIONS,
		groupVotesByOption,
		type DisplayVote,
		type VoteValue
	} from '$lib/collaboration/voting';

	let {
		votes = []
	}: {
		votes?: DisplayVote[];
	} = $props();

	// Glyph + tint per option, identical to VoteStacks. `dislike` surfaces as "Pass"
	// across the UI (cerebrum) — the glyph carries that; the aria label reads "pass".
	const OPTION_META: Record<VoteValue, { glyph: string; tint: string; label: string }> = {
		love: { glyph: '♥', tint: 'text-moss', label: 'love' },
		like: { glyph: '+', tint: 'text-moss-soft', label: 'like' },
		flexible: { glyph: '~', tint: 'text-ink-muted', label: 'flexible' },
		dislike: { glyph: '–', tint: 'text-clay', label: 'pass' }
	};

	const grouped = $derived(groupVotesByOption(votes));
	const activeOptions = $derived(VOTE_OPTIONS.filter((o) => grouped[o].length > 0));
</script>

{#if activeOptions.length > 0}
	<span
		class="text-ink-muted inline-flex items-center gap-2 text-[12px] font-medium tabular-nums"
		aria-label="Votes"
	>
		{#each activeOptions as option (option)}
			<span
				class="inline-flex items-center gap-0.5"
				aria-label="{grouped[option].length} {OPTION_META[option].label}"
			>
				<span class="{OPTION_META[option].tint} font-semibold" aria-hidden="true"
					>{OPTION_META[option].glyph}</span
				>
				{grouped[option].length}
			</span>
		{/each}
	</span>
{/if}
