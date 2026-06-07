<script lang="ts">
	import type { Vote, TripMember } from '$lib/types';
	import { VOTE_OPTIONS, groupVotesByOption, type VoteValue } from '$lib/collaboration/voting';
	import Avatar from '$lib/ui/Avatar.svelte';

	let {
		votes = [],
		members = [],
		size = 20
	}: {
		votes?: Vote[];
		members?: TripMember[];
		size?: number;
	} = $props();

	// Option glyph + a tint so each stack reads at a glance. No numeric score by design.
	const OPTION_META: Record<VoteValue, { glyph: string; tint: string }> = {
		love: { glyph: '♥', tint: 'text-moss' },
		like: { glyph: '+', tint: 'text-moss-soft' },
		flexible: { glyph: '~', tint: 'text-ink-muted' },
		dislike: { glyph: '–', tint: 'text-clay' }
	};

	const memberName = (id: string) => {
		const m = members.find((mm) => mm.id === id);
		return m?.display_name || m?.placeholder_name || '?';
	};

	const grouped = $derived(groupVotesByOption(votes));
	const activeOptions = $derived(VOTE_OPTIONS.filter((o) => grouped[o].length > 0));
</script>

{#if activeOptions.length > 0}
	<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5" aria-label="Votes">
		{#each activeOptions as option (option)}
			<div class="flex items-center gap-1">
				<span class="text-xs font-semibold {OPTION_META[option].tint}" aria-hidden="true"
					>{OPTION_META[option].glyph}</span
				>
				<div class="flex -space-x-1.5">
					{#each grouped[option] as v (v.id)}
						<span class="ring-surface rounded-full ring-2" title={memberName(v.member)}>
							<Avatar initial={memberName(v.member)} alt={memberName(v.member)} {size} />
						</span>
					{/each}
				</div>
			</div>
		{/each}
	</div>
{/if}
