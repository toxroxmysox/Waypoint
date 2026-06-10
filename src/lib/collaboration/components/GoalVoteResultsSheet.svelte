<script lang="ts">
	import type { GoalVote, Vote, TripMember } from '$lib/types';
	import { VOTE_OPTIONS, groupVotesByOption, type VoteValue } from '$lib/collaboration/voting';
	import Avatar from '$lib/ui/Avatar.svelte';
	import BottomSheet from '$lib/ui/BottomSheet.svelte';

	let {
		open = $bindable(false),
		title = '',
		votes = [],
		members = []
	}: {
		open: boolean;
		title?: string;
		votes?: GoalVote[];
		members?: Array<TripMember & { avatarUrl?: string }>;
	} = $props();

	// `dislike` surfaces to members as "Pass" (the harvest/swipe vocabulary); the
	// other three keep their names. No numeric count anywhere — order IS the rank.
	const OPTION_LABEL: Record<VoteValue, string> = {
		love: 'Love',
		like: 'Like',
		flexible: 'Flexible',
		dislike: 'Pass'
	};
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

	const memberAvatar = (id: string) => members.find((mm) => mm.id === id)?.avatarUrl ?? '';

	// voting.ts groups by VoteValue; GoalVote is structurally compatible (id +
	// member + value) — reuse it unforked (ADR-0004) rather than a parallel impl.
	const grouped = $derived(groupVotesByOption(votes as unknown as Vote[]));
</script>

<BottomSheet bind:open {title}>
	<div class="space-y-4 p-4">
		{#each VOTE_OPTIONS as option (option)}
			{@const voters = grouped[option]}
			<div>
				<div class="mb-1.5 flex items-center gap-1.5">
					<span class="text-sm font-semibold {OPTION_META[option].tint}" aria-hidden="true"
						>{OPTION_META[option].glyph}</span
					>
					<span class="text-ink text-[13px] font-semibold">{OPTION_LABEL[option]}</span>
				</div>
				{#if voters.length > 0}
					<div class="flex items-start gap-2">
						<div class="flex -space-x-1.5 pt-0.5">
							{#each voters as v (v.id)}
								<span class="ring-surface rounded-full ring-2" title={memberName(v.member)}>
									<Avatar img={memberAvatar(v.member)} initial={memberName(v.member)} alt={memberName(v.member)} size={22} />
								</span>
							{/each}
						</div>
						<p class="text-ink-soft flex-1 text-[12.5px] leading-relaxed">
							{voters.map((v) => memberName(v.member)).join(', ')}
						</p>
					</div>
				{:else}
					<p class="text-ink-muted text-[12.5px] italic">No one yet</p>
				{/if}
			</div>
		{/each}
	</div>
</BottomSheet>
