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
	import type { Item, TripMember } from '$lib/types';
	import Card from '$lib/ui/Card.svelte';
	import AssigneeStacks from '$lib/itinerary/components/AssigneeStacks.svelte';
	import RailStack from './RailStack.svelte';
	import CardStrip, { type StripEntry } from './CardStrip.svelte';
	import { needsBooking } from '$lib/itinerary/booking-projection';
	import { timeShape } from '$lib/itinerary/timeline';
	import { cardAccessibleName, cardMeta, RAIL, TIMED_MIN_HEIGHT, type OverlapInfo } from '$lib/itinerary/card-anatomy';

	let {
		item,
		tripSlug,
		members = [],
		overlap,
		docCount = 0,
		mode = 'planning'
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
	} = $props();

	let height = $state(0);

	const shape = $derived(timeShape(item));
	const timed = $derived(shape !== 'untimed');
	const showNeedsBooking = $derived(!item.booked && needsBooking(item));
	const meta = $derived(cardMeta(item));
	const cost = $derived(mode === 'planning' ? item.cost_estimate_usd : 0);
	const overlapNote = $derived(mode === 'planning' ? overlap : undefined);
	const redConflict = $derived(!!overlapNote?.shared);

	const clip = (s: string, n = 16) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

	// Priority order (D2/D10): Overlaps > Needs booking > Booked > documents.
	const entries = $derived.by<StripEntry[]>(() => {
		const out: StripEntry[] = [];
		if (overlapNote)
			out.push({
				key: 'overlap',
				kind: 'overlap',
				text: `Overlaps ${clip(overlapNote.partnerTitle)}`,
				label: `Overlaps ${overlapNote.partnerTitle}`,
				tone: overlapNote.shared ? 'red' : 'ink'
			});
		if (showNeedsBooking)
			out.push({ key: 'needs', kind: 'needs-booking', text: 'Needs booking', label: 'Needs booking', tone: 'gold' });
		else if (item.booked)
			out.push({ key: 'booked', kind: 'booked', text: 'Booked', label: 'Booked', tone: 'quiet' });
		if (docCount > 0)
			out.push({
				key: 'docs',
				kind: 'docs',
				text: String(docCount),
				label: `${docCount} ${docCount === 1 ? 'document' : 'documents'}`,
				tone: 'ink'
			});
		return out;
	});

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
		redTop={redConflict && overlapNote?.role === 'later'}
		redBottom={redConflict && overlapNote?.role === 'earlier'}
	/>

	<Card class="group-hover:shadow-card-strong group-active:bg-surface-2 relative h-full {timed ? 'min-h-[62px]' : ''}">
		<div class="p-3">
			<a
				href={withOrigin(`/trips/${tripSlug}/items/${item.id}`, page.url.pathname)}
				class="absolute inset-0 rounded-lg"
				aria-label={accessibleName}
			></a>

			<div class="flex items-start justify-between gap-2">
				<h4 class="text-ink line-clamp-2 min-w-0 text-sm leading-5 font-semibold" data-card="title">{item.title}</h4>
				{#if cost > 0}
					<div class="text-ink shrink-0 text-sm leading-5 font-medium tabular-nums" data-card="cost">
						${cost.toLocaleString('en-US')}
					</div>
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
			<CardStrip {entries} right={showGoing ? going : undefined} />
		</div>
	</Card>
</div>
