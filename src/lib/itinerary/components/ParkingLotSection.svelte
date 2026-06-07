<script lang="ts">
	import type { Item, Phase, Vote, TripMember } from '$lib/types';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import Card from '$lib/ui/Card.svelte';
	import VoteStacks from '$lib/collaboration/components/VoteStacks.svelte';
	import { titleCase } from '$lib/shell/format';

	let {
		items,
		phases,
		tripSlug,
		votesByItem = {},
		members = []
	}: {
		items: Item[];
		phases: Phase[];
		tripSlug: string;
		votesByItem?: Record<string, Vote[]>;
		members?: TripMember[];
	} = $props();

	// Items arrive pre-sorted (vote score, then sort_order). Keep the unplanned filter
	// for callers that pass a mixed list, but preserve incoming order.
	const unplannedItems = $derived(items.filter((i) => i.status === 'unplanned'));
</script>

{#if unplannedItems.length === 0}
	<p class="text-ink-muted text-sm italic">No parking lot items.</p>
{:else}
	<section class="space-y-1.5">
		{#each unplannedItems as item (item.id)}
			<Card href="/trips/{tripSlug}/items/{item.id}">
				<div class="flex items-center gap-3 px-3 py-2">
					<TypeIcon type={item.type} size={18} />
					<div class="min-w-0 flex-1">
						<p class="text-ink truncate text-sm" title={item.title}>{item.title}</p>
						{#if item.location_name}
							<p class="text-ink-muted truncate text-xs">{item.location_name}</p>
						{/if}
						{#if votesByItem[item.id]?.length}
							<div class="mt-1.5">
								<VoteStacks votes={votesByItem[item.id]} {members} size={18} />
							</div>
						{/if}
					</div>
					<span class="bg-paper text-ink-muted shrink-0 rounded px-1.5 py-0.5 text-[11px]">
						{titleCase(item.type)}
					</span>
				</div>
			</Card>
		{/each}
	</section>
{/if}
