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
			<!--
				CARD_CONTENT_SPEC §2 parking-lot card: drag handle, type glyph, title,
				subtype, reactor avatars, pull-up affordance. NO booking pill (uncommitted
				items never show "Needs booking"); no location, no type badge.
				Drag + pull-to-plan wiring is owned by #60 — the handle and pull-up here are
				visual affordances only.
			-->
			<Card href="/trips/{tripSlug}/items/{item.id}">
				<div class="flex items-center gap-3 px-3 py-2">
					<!-- Slot: drag handle (visual affordance — DnD wiring is #60) -->
					<div class="text-line flex shrink-0 cursor-grab items-center" aria-label="Drag to reorder">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
							<circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
							<circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
						</svg>
					</div>

					<!-- Slot: type glyph -->
					<TypeIcon type={item.type} sub={item.subtype} size={18} />

					<div class="min-w-0 flex-1">
						<!-- Slot: title -->
						<p class="text-ink truncate text-sm" title={item.title}>{item.title}</p>

						<!-- Slot: subtype -->
						{#if item.subtype}
							<p class="text-ink-muted mt-0.5 text-[11px] uppercase tracking-wide">{titleCase(item.subtype)}</p>
						{/if}

						<!-- Slot: reactor avatars (votes only) -->
						{#if votesByItem[item.id]?.length}
							<div class="mt-1.5">
								<VoteStacks votes={votesByItem[item.id]} {members} size={18} />
							</div>
						{/if}
					</div>

					<!-- Slot: pull-up affordance (pull-to-plan — wiring owned by #60) -->
					<div class="text-ink-muted shrink-0" aria-label="Pull up to plan">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<polyline points="18 15 12 9 6 15" />
						</svg>
					</div>
				</div>
			</Card>
		{/each}
	</section>
{/if}
