<script lang="ts">
	import type { GoalVote, TripMember } from '$lib/types';
	import Avatar from '$lib/ui/Avatar.svelte';

	let {
		votes = [],
		members = [],
		onOpen
	}: {
		votes?: GoalVote[];
		members?: Array<TripMember & { avatarUrl?: string }>;
		onOpen?: () => void;
	} = $props();

	const memberName = (id: string) => {
		const m = members.find((mm) => mm.id === id);
		return m?.display_name || m?.placeholder_name || '?';
	};

	const memberAvatar = (id: string) => members.find((mm) => mm.id === id)?.avatarUrl ?? '';

	// Row-level split: LIKED = Love + Like, PASSED = Pass (dislike). Flexible is
	// neither — it only surfaces in the full results sheet. The number is never
	// shown; the avatar stack IS the signal.
	const liked = $derived(votes.filter((v) => v.value === 'love' || v.value === 'like'));
	const passed = $derived(votes.filter((v) => v.value === 'dislike'));
</script>

{#if votes.length > 0}
	<button
		type="button"
		onclick={(e) => {
			e.preventDefault();
			e.stopPropagation();
			onOpen?.();
		}}
		class="flex flex-wrap items-center gap-x-3 gap-y-1 text-left"
		aria-label="See who voted"
	>
		{#if liked.length > 0}
			<span class="flex items-center gap-1.5">
				<span class="text-moss text-[10px] font-semibold tracking-wide uppercase">Liked</span>
				<span class="flex -space-x-1.5">
					{#each liked as v (v.id)}
						<span class="ring-surface rounded-full ring-2" title={memberName(v.member)}>
							<Avatar img={memberAvatar(v.member)} initial={memberName(v.member)} alt={memberName(v.member)} size={18} />
						</span>
					{/each}
				</span>
			</span>
		{/if}
		{#if passed.length > 0}
			<span class="flex items-center gap-1.5">
				<span class="text-clay text-[10px] font-semibold tracking-wide uppercase">Passed</span>
				<span class="flex -space-x-1.5">
					{#each passed as v (v.id)}
						<span class="ring-surface rounded-full ring-2" title={memberName(v.member)}>
							<Avatar img={memberAvatar(v.member)} initial={memberName(v.member)} alt={memberName(v.member)} size={18} />
						</span>
					{/each}
				</span>
			</span>
		{/if}
	</button>
{/if}
