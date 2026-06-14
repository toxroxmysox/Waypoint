<script lang="ts">
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
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
		members = [],
		dndEnabled = false,
		collapsed = false,
		dragDisabled = true,
		startDrag = () => {},
		pullUp = () => {},
		onConsider = () => {},
		onFinalize = () => {}
	}: {
		items: Item[];
		phases: Phase[];
		tripSlug: string;
		votesByItem?: Record<string, Vote[]>;
		members?: TripMember[];
		/** Turns the section into a svelte-dnd-action drop zone + drag source (#60). */
		dndEnabled?: boolean;
		/**
		 * Collapsed divider mode (#87): the zone stays mounted and droppable, but each
		 * item renders as a zero-height placeholder so DOM children still map 1:1 to the
		 * bound array. Keeps the parking lot a drop target while the cards are hidden.
		 */
		collapsed?: boolean;
		dragDisabled?: boolean;
		startDrag?: () => void;
		/** Tap-to-plan from the pull-up chevron (appends the idea to the day). */
		pullUp?: (itemId: string) => void;
		onConsider?: (e: CustomEvent<DndEvent<Item>>) => void;
		onFinalize?: (e: CustomEvent<DndEvent<Item>>) => void;
	} = $props();

	// Inert callers (desktop rail) pass mixed lists; keep the unplanned filter.
	// In dnd mode the day page passes the already-scoped parking list verbatim so
	// svelte-dnd-action's children map 1:1 to the bound array.
	const unplannedItems = $derived(dndEnabled ? items : items.filter((i) => i.status === 'unplanned'));
	const FLIP_MS = 150;

	function onHandlePointer(e: Event) {
		e.stopPropagation();
		e.preventDefault();
		startDrag();
	}
	function onHandleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') startDrag();
	}
</script>

{#if dndEnabled}
	<!-- Drop zone: always rendered (even empty/collapsed) so the first item can be
	     parked. When collapsed, items become zero-height placeholders — the zone is
	     still a drop target but the cards are hidden behind the divider (#87). -->
	<section
		class={collapsed ? 'min-h-[2.5rem]' : 'min-h-[3rem] space-y-1.5'}
		use:dndzone={{ items, dragDisabled, type: 'itinerary-item', flipDurationMs: FLIP_MS, dropTargetStyle: {} }}
		onconsider={onConsider}
		onfinalize={onFinalize}
	>
		{#each items as item (item.id)}
			<!-- The flip wrapper must be the only keyed child. When collapsed it renders
			     empty + zero-height: still a 1:1 DOM child for svelte-dnd-action, but the
			     card is hidden behind the divider (#87). -->
			<div
				animate:flip={{ duration: FLIP_MS }}
				class={collapsed ? 'no-callout h-0 overflow-hidden' : 'no-callout flex items-stretch gap-1'}
				aria-hidden={collapsed}
			>
				{#if !collapsed}
				<!-- Slot: drag handle (sibling of the link → no navigation) -->
				<button
					type="button"
					class="text-ink-muted flex shrink-0 touch-none cursor-grab items-center px-1"
					aria-label="Drag to plan or reorder"
					onpointerdown={onHandlePointer}
					onmousedown={onHandlePointer}
					ontouchstart={onHandlePointer}
					onkeydown={onHandleKeydown}
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
						<circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
						<circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
						<circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
					</svg>
				</button>

				<div class="min-w-0 flex-1">
					<Card href="/trips/{tripSlug}/items/{item.id}" class="no-callout">
						<div class="flex items-center gap-3 px-3 py-2">
							<TypeIcon type={item.type} sub={item.subtype} size={18} />
							<div class="min-w-0 flex-1">
								<p class="text-ink truncate text-sm" title={item.title}>{item.title}</p>
								{#if item.subtype}
									<p class="text-ink-muted mt-0.5 text-[11px] tracking-wide uppercase">{titleCase(item.subtype)}</p>
								{/if}
								{#if votesByItem[item.id]?.length}
									<div class="mt-1.5">
										<VoteStacks votes={votesByItem[item.id]} {members} size={18} />
									</div>
								{/if}
							</div>
						</div>
					</Card>
				</div>

				<!-- Slot: pull-up affordance (tap to plan — sibling of the link) -->
				<button
					type="button"
					class="text-ink-muted hover:text-ink-soft flex shrink-0 items-center px-1"
					aria-label="Pull up to plan"
					onclick={() => pullUp(item.id)}
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<polyline points="18 15 12 9 6 15" />
					</svg>
				</button>
				{/if}
			</div>
		{/each}
	</section>
	{#if collapsed}
		{#if items.length === 0}
			<p class="text-ink-muted px-2 py-2 text-center text-xs italic">Drop here to unschedule.</p>
		{/if}
	{:else if items.length === 0}
		<p class="text-ink-muted mt-1.5 px-2 py-3 text-center text-xs italic">Drag an item here to unschedule it.</p>
	{/if}
{:else if unplannedItems.length === 0}
	<p class="text-ink-muted text-sm italic">No parking lot items.</p>
{:else}
	<section class="space-y-1.5">
		{#each unplannedItems as item (item.id)}
			<!--
				CARD_CONTENT_SPEC §2 parking-lot card (inert mode — desktop rail).
				Drag/pull wiring lives in the dndEnabled branch above (#60).
			-->
			<Card href="/trips/{tripSlug}/items/{item.id}">
				<div class="flex items-center gap-3 px-3 py-2">
					<div class="text-line flex shrink-0 cursor-grab items-center" aria-label="Drag to reorder">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
							<circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
							<circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
						</svg>
					</div>

					<TypeIcon type={item.type} sub={item.subtype} size={18} />

					<div class="min-w-0 flex-1">
						<p class="text-ink truncate text-sm" title={item.title}>{item.title}</p>
						{#if item.subtype}
							<p class="text-ink-muted mt-0.5 text-[11px] tracking-wide uppercase">{titleCase(item.subtype)}</p>
						{/if}
						{#if votesByItem[item.id]?.length}
							<div class="mt-1.5">
								<VoteStacks votes={votesByItem[item.id]} {members} size={18} />
							</div>
						{/if}
					</div>

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
