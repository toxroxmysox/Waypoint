<script lang="ts">
	// The Card shape for a rail-hosted list (#420; spec §Card anatomy, CARD_SYSTEM
	// D2): head (title + Item Cost) · meta (the best "where") · strip (what needs
	// attention, who's going). The Timeline Rail beside it owns time, so the card
	// never prints one. Heights follow content, never duration; a card with a time
	// label is at least ~62px. No votes on planned cards.
	//
	// Navigation is a stretched <a> over the card (a button can't nest in an
	// anchor; stretched-link pattern, #77/#78/#231). The strip's Going controls sit
	// above it (relative z-10). The host supplies the drag wrapper.
	import { withOrigin } from '$lib/shell/back-nav';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import type { Item, TripMember } from '$lib/types';
	import Card from '$lib/ui/Card.svelte';
	import AssigneeStacks from '$lib/itinerary/components/AssigneeStacks.svelte';
	import RailStack from './RailStack.svelte';
	import CardStrip from './CardStrip.svelte';
	import { needsBooking } from '$lib/itinerary/booking-projection';
	import { timeShape } from '$lib/itinerary/timeline';
	import {
		cardAccessibleName,
		cardMeta,
		stripEntries,
		RAIL,
		TIMED_MIN_HEIGHT,
		type OverlapInfo
	} from '$lib/itinerary/card-anatomy';

	let {
		item,
		tripSlug,
		members = [],
		overlap,
		docCount = 0,
		mode = 'planning',
		muted = false,
		menu
	}: {
		item: Item;
		tripSlug: string;
		members?: TripMember[];
		/** This item's overlap pair (Planning Mode only; D10). */
		overlap?: OverlapInfo;
		/** Attached documents (files), for the strip. */
		docCount?: number;
		/** Trip Mode shows no cost and no conflicts (spec §Overlap, D2). */
		mode?: 'planning' | 'trip';
		/** Earlier today (#429): same shape, no white fill, ink-muted text (never
		 *  opacity), a lighter rail rule and an outlined node. Still a link. */
		muted?: boolean;
		/** The head's top-right slot: Trip Mode's `⋯` (Coming up, #429). Role logic
		 *  stays with the caller; this only hosts it. */
		menu?: Snippet;
	} = $props();

	let height = $state(0);

	const shape = $derived(timeShape(item));
	const timed = $derived(shape !== 'untimed');
	const showNeedsBooking = $derived(!item.booked && needsBooking(item));
	const meta = $derived(cardMeta(item));
	const cost = $derived(mode === 'planning' ? item.cost_estimate_usd : 0);
	const overlapNote = $derived(mode === 'planning' ? overlap : undefined);

	// Priority order (D2/D10): Overlaps > Needs booking > Booked (the `✓ {code}`
	// chip in Trip Mode) > documents. Trip Mode drops the overlap note (#429).
	const entries = $derived(
		stripEntries({
			mode,
			overlap: overlapNote,
			needsBooking: showNeedsBooking,
			booked: !!item.booked,
			codes: item.confirmation_codes,
			docCount
		})
	);

	const accessibleName = $derived(
		cardAccessibleName({
			item,
			needsBooking: showNeedsBooking,
			booked: !!item.booked,
			overlapWith: overlapNote?.partnerTitle
		})
	);
	const showGoing = $derived(members.length > 1);
</script>

<div
	class="group relative no-callout"
	style="padding-left:{RAIL.column + RAIL.gap}px;{timed ? `min-height:${TIMED_MIN_HEIGHT}px;` : ''}"
	bind:clientHeight={height}
>
	<RailStack
		{item}
		{height}
		redTop={!!overlapNote?.redStart}
		redBottom={!!overlapNote?.redEnd}
		past={muted}
	/>

	<Card
		class="group-hover:shadow-card-strong group-active:bg-surface-2 relative h-full {timed ? 'min-h-[62px]' : ''} {muted
			? 'bg-transparent! shadow-none!'
			: ''}"
	>
		<div class="p-3">
			<a
				href={withOrigin(`/trips/${tripSlug}/items/${item.id}`, page.url.pathname)}
				class="absolute inset-0 rounded-lg"
				aria-label={accessibleName}
			></a>

			<div class="flex items-start justify-between gap-2">
				<h4 class="{muted ? 'text-ink-muted' : 'text-ink'} line-clamp-2 min-w-0 text-sm leading-5 font-semibold" data-card="title">{item.title}</h4>
				{#if cost > 0}
					<div class="text-ink shrink-0 text-sm leading-5 font-medium tabular-nums" data-card="cost">
						${cost.toLocaleString('en-US')}
					</div>
				{/if}
				{#if menu}
					<!-- 44px hit inside the card's own padding: -my-3 cancels the p-3 above and below. -->
					<div class="relative z-10 focus-within:z-30 -my-3 -mr-1 shrink-0">{@render menu()}</div>
				{/if}
			</div>

			{#if meta}
				<p class="text-ink-muted mt-0.5 truncate text-[12px] leading-4" data-card="meta">{meta}</p>
			{/if}

			{#snippet going()}
				<div class="relative z-10">
					<AssigneeStacks
						itemId={item.id}
						itemTitle={item.title}
						assignedTo={item.assigned_to}
						notGoing={item.not_going ?? []}
						{members}
						size={20}
						variant="strip"
					/>
				</div>
			{/snippet}
			<CardStrip {entries} {muted} right={showGoing ? going : undefined} />
		</div>
	</Card>
</div>
