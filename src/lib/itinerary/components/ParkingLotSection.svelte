<script lang="ts">
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import type { Item, Phase, Vote, TripMember } from '$lib/types';
	import IdeaCard from '$lib/itinerary/components/IdeaCard.svelte';
	import IdeaGroupHeading from '$lib/itinerary/components/IdeaGroupHeading.svelte';
	import { ideaDisplayOrder, ideaRunStarts, ideaScores } from '$lib/itinerary/idea-groups';

	// #424: ideas under type headings (Lodging · Flights · Transportation ·
	// Activities · Meals · Notes), idea cards without a type icon, no grip handle.
	// Dnd mode: the WHOLE card is the drag source (touch: long-press; mouse:
	// immediate) and `items` arrives already in display order from the day page, so
	// svelte-dnd-action's children map 1:1 to the bound array; each group heading
	// lives INSIDE the wrapper of the first idea of its run.
	let {
		items,
		phases,
		tripSlug,
		votesByItem = {},
		members = [],
		myMemberId = '',
		canVote = false,
		dndEnabled = false,
		collapsed = false,
		dragActive = false,
		pullUp = () => {},
		onConsider = () => {},
		onFinalize = () => {}
	}: {
		items: Item[];
		phases: Phase[];
		tripSlug: string;
		votesByItem?: Record<string, Vote[]>;
		members?: TripMember[];
		/** The viewer's trip_members.id + whether they may vote (#425 pills). */
		myMemberId?: string;
		canVote?: boolean;
		/** Turns the section into a svelte-dnd-action drop zone + drag source (#60). */
		dndEnabled?: boolean;
		/**
		 * Collapsed divider mode (#87): the zone stays mounted and droppable, but each
		 * item renders as a zero-height placeholder so DOM children still map 1:1 to the
		 * bound array. Keeps the parking lot a drop target while the cards are hidden.
		 */
		collapsed?: boolean;
		/** A drag is in flight anywhere on the day: the collapsed strip grows so the drop target is easy to hit (#294). */
		dragActive?: boolean;
		/** Tap-to-plan from the pull-up chevron (appends the idea to the day). */
		pullUp?: (itemId: string) => void;
		onConsider?: (e: CustomEvent<DndEvent<Item>>) => void;
		onFinalize?: (e: CustomEvent<DndEvent<Item>>) => void;
	} = $props();

	const typeOf = (i: Item) => i.type;

	// Inert callers (desktop rail) pass mixed lists: filter to unplanned, then group
	// and sort by vote score. In dnd mode the day page passes the already-ordered
	// parking list verbatim so the dnd children map 1:1 to the bound array.
	const inertItems = $derived(
		ideaDisplayOrder(
			items.filter((i) => i.status === 'unplanned'),
			typeOf,
			ideaScores(votesByItem)
		)
	);
	const starts = $derived(ideaRunStarts(dndEnabled ? items : inertItems, typeOf));
	const FLIP_MS = 150;

	// #353: hold this long before a touch becomes a drag (same as the timeline);
	// below it the press is a tap (the card opens) and movement means scroll.
	const LONG_PRESS_MS = 250;

	// The dragged clone drops its heading: the heading belongs to the list, not the card.
	function dropHeading(el: HTMLElement | undefined) {
		el?.querySelector('[data-idea-heading]')?.remove();
	}
</script>

{#if dndEnabled}
	<!-- Drop zone: always rendered (even empty/collapsed) so the first item can be
	     parked. When collapsed, items become zero-height placeholders — the zone is
	     still a drop target but the cards are hidden behind the divider (#87).
	     Collapsed: a visible dashed "drop strip" so the hit area matches the
	     affordance (#294); the strip's centered hint reads inside the zone, not as a
	     detached <p> below it. `dropTargetClasses` tints the strip moss while any
	     itinerary-item is in flight so the user sees where they can drop (#294). -->
	<section
		class="parking-dropzone {collapsed
			? `parking-dropzone--collapsed flex ${dragActive ? 'min-h-[5.5rem]' : 'min-h-[2.75rem]'} items-center justify-center rounded-lg border border-dashed border-line px-2 transition-[min-height] duration-150`
			: 'min-h-[3rem] space-y-1.5'}"
		data-empty={items.length === 0}
		data-parking-zone
		use:dndzone={{
			items,
			dragDisabled: false,
			type: 'itinerary-item',
			flipDurationMs: FLIP_MS,
			dropTargetStyle: {},
			dropTargetClasses: ['parking-dropzone--over'],
			delayTouchStart: LONG_PRESS_MS,
			transformDraggedElement: dropHeading,
			// #324: resolve the target zone by the FINGER/cursor position, not the
			// dragged card's centre. A thin collapsed empty strip (min-h-[2.75rem])
			// loses the default centre-of-card overlap contest to its taller
			// neighbours (timeline above, sibling zone below) → drops never land. With
			// cursor detection the strip wins whenever the finger is over it, however
			// tall the card. svelte-dnd-action reads this from the DRAG-ORIGIN zone's
			// config, so the timeline zone (DayTimeline) sets it too — keep in sync.
			useCursorForDetection: true
		}}
		onconsider={onConsider}
		onfinalize={onFinalize}
	>
		{#each items as item (item.id)}
			{@const start = starts.get(item.id)}
			<!-- The flip wrapper must be the only keyed child. When collapsed it renders
			     empty + zero-height: still a 1:1 DOM child for svelte-dnd-action, but the
			     card is hidden behind the divider (#87). Otherwise it IS the drag target
			     (whole-card drag) and carries the idea's name for the library's
			     announcements. -->
			<div
				animate:flip={{ duration: FLIP_MS }}
				class={collapsed ? 'no-callout h-0 w-0 shrink-0 basis-0 overflow-hidden' : 'no-callout group transition-transform hover:-translate-y-px'}
				aria-hidden={collapsed}
				aria-label={collapsed ? undefined : item.title}
			>
				{#if !collapsed}
					{#if start}
						<IdeaGroupHeading type={start} />
					{/if}
					<div class="flex items-stretch gap-1">
						<div class="min-w-0 flex-1">
							<IdeaCard {item} {tripSlug} votes={votesByItem[item.id] ?? []} {members} {myMemberId} {canVote} />
						</div>
						<!-- Pull-up: the owner's one primary action on the card (tap to plan). -->
						<button
							type="button"
							class="text-ink-muted hover:text-ink-soft active:text-ink-soft flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center"
							aria-label="Pull up to plan"
							onclick={() => pullUp(item.id)}
						>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<polyline points="18 15 12 9 6 15" />
							</svg>
						</button>
					</div>
				{/if}
			</div>
		{/each}
	</section>
	{#if !collapsed && items.length === 0}
		<p class="text-ink-muted mt-1.5 px-2 py-3 text-center text-xs italic">Drag an item here to unschedule it.</p>
	{/if}
{:else if inertItems.length === 0}
	<p class="text-ink-muted text-sm italic">No parking lot items.</p>
{:else}
	<section class="space-y-1.5">
		{#each inertItems as item (item.id)}
			{@const start = starts.get(item.id)}
			<!-- Inert mode (desktop Ideas panel): same grouping and card; no drag yet
			     (mouse drag-to-plan from the rail is #445). The chevron is the
			     card's affordance, not a control. -->
			<div class="group">
				{#if start}
					<IdeaGroupHeading type={start} />
				{/if}
				<div class="flex items-stretch gap-1">
					<div class="min-w-0 flex-1">
						<IdeaCard {item} {tripSlug} votes={votesByItem[item.id] ?? []} {members} {myMemberId} {canVote} />
					</div>
					<div class="text-ink-muted flex shrink-0 items-center px-1" aria-label="Pull up to plan">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<polyline points="18 15 12 9 6 15" />
						</svg>
					</div>
				</div>
			</div>
		{/each}
	</section>
{/if}
