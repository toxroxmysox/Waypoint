<script lang="ts">
	import type { Item, Vote, TripMember } from '$lib/types';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import Card from '$lib/ui/Card.svelte';
	import VoteSentimentPill from '$lib/collaboration/components/VoteSentimentPill.svelte';
	import AssigneeStacks from '$lib/itinerary/components/AssigneeStacks.svelte';
	import { needsBooking } from '$lib/itinerary/booking-projection';
	import { titleCase, formatTime } from '$lib/shell/format';

	let {
		item,
		tripSlug,
		anchored = false,
		overlapping = false,
		draggable = false,
		votes = [],
		members = [],
		startDrag = () => {}
	}: {
		item: Item;
		tripSlug: string;
		anchored?: boolean;
		overlapping?: boolean;
		draggable?: boolean;
		votes?: Vote[];
		members?: TripMember[];
		/** Enables drag on the host dndzone (handle-only pattern). #60 */
		startDrag?: () => void;
	} = $props();

	// CARD_CONTENT_SPEC §2: eyebrow pills are Booked XOR Needs-booking, mutually
	// exclusive. `needsBooking()` is the shared predicate (planned && requires_booking
	// && !booked) — booked wins when both could read true.
	const showNeedsBooking = $derived(!item.booked && needsBooking(item));
	const cost = $derived(item.cost_estimate_usd);

	// Handle-only drag (#60): the grip lives OUTSIDE the card <a> so the press
	// starts a drag (or, on keyboard, an arrow-key drag) without navigating.
	function onHandlePointer(e: Event) {
		e.stopPropagation();
		e.preventDefault();
		startDrag();
	}
	function onHandleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') startDrag();
	}
</script>

<div class="group relative flex items-stretch gap-1 no-callout" class:opacity-90={overlapping}>
	{#if anchored && item.start_time}
		<div class="text-ink-muted absolute -left-16 top-3 hidden text-xs font-mono md-desktop:block">
			{formatTime(item.start_time)}
		</div>
	{:else if anchored && item.end_time}
		<!-- #346: end-only deadline shows "by <end>" in the desktop time gutter. -->
		<div class="text-ink-muted absolute -left-16 top-3 hidden text-xs font-mono md-desktop:block">
			by {formatTime(item.end_time)}
		</div>
	{/if}

	{#if draggable}
		<!-- Slot: drag handle — sibling of the link so taps/keys don't navigate. -->
		<button
			type="button"
			class="text-ink-muted flex shrink-0 touch-none cursor-grab items-center px-1"
			aria-label="Drag to reorder"
			onpointerdown={onHandlePointer}
			onmousedown={onHandlePointer}
			ontouchstart={onHandlePointer}
			onkeydown={onHandleKeydown}
		>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
				<circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
				<circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
			</svg>
		</button>
	{/if}

	<div class="min-w-0 flex-1">
		<!-- #231: the assignee footer must sit INSIDE the card border. A button
		     can't nest in an anchor, so the card is a bordered <div> (not <Card href>)
		     and navigation is a stretched <a> (after:absolute after:inset-0) covering
		     the content row only — the assignee footer sits above it (relative z-10)
		     and stays tappable. Stretched-link pattern, per the #77/#78 cerebrum scar. -->
		<Card class="group-hover:shadow-card-strong group-active:bg-surface-2 {overlapping ? 'border-l-2 border-gold' : ''}">
			<div class="relative flex items-start gap-3 p-3">
				<!-- Stretched link: whole content row navigates to the item. -->
				<a
					href="/trips/{tripSlug}/items/{item.id}"
					class="absolute inset-0 rounded-lg after:absolute after:inset-0"
					aria-label={item.title}
				></a>

				<!-- Slot: type glyph (+ subtype) -->
				<TypeIcon type={item.type} sub={item.subtype} size={32} />

				<div class="min-w-0 flex-1">
					<!-- Slot: eyebrow pills (Booked XOR Needs-booking) -->
					{#if item.booked}
						<div class="mb-1"><Pill variant="booked" size="sm">Booked</Pill></div>
					{:else if showNeedsBooking}
						<div class="mb-1"><Pill variant="pending" size="sm">Needs booking</Pill></div>
					{/if}

					<!-- Slot: title -->
					<h4 class="text-ink truncate text-sm font-semibold">{item.title}</h4>

					<!-- Slot: time / location line — anchored shows time, flowing shows "flex" -->
					<p class="text-ink-muted mt-0.5 text-[12px]">
						{#if anchored && item.start_time}
							<span class="font-mono">{formatTime(item.start_time)}{item.end_time ? ` – ${formatTime(item.end_time)}` : ''}</span>
						{:else if anchored && item.end_time}
							<!-- #346: end-only item is a deadline, anchored at its end. -->
							<span class="font-mono">Ends by {formatTime(item.end_time)}</span>
						{:else}
							<span>No Time Set</span>
						{/if}
						{#if item.location_name}<span class="text-line">·</span> {item.location_name}{/if}
					</p>

					<!-- Slot: subtype -->
					{#if item.subtype}
						<p class="text-ink-muted mt-1 text-[11px] uppercase tracking-wide">{titleCase(item.subtype)}</p>
					{/if}

					<!-- Slot: vote sentiment pill (ADR-0011 — avatars mean assignees; #350 — votes read as per-sentiment glyph+count) -->
					{#if votes.length}
						<div class="relative z-10 mt-1.5 w-fit">
							<VoteSentimentPill {votes} />
						</div>
					{/if}
				</div>

				<!-- Slot: single Cost (cost_estimate_usd) -->
				{#if cost > 0}
					<div class="text-ink shrink-0 text-sm font-medium tabular-nums">
						${cost.toLocaleString('en-US')}
					</div>
				{/if}
			</div>

			<!-- Slot: assignee avatars + self-assign (ADR-0011 / #226). Now a child of
			     the bordered card (#231) so the bubbles sit inside the border; relative
			     z-10 lifts the buttons above the stretched link. The padding/indent is
			     on the row itself (via `class`) so the footer collapses to nothing on
			     solo trips. Indent aligns past the 32px glyph + gap to the title; the
			     row's own pl-1 + mt-1.5 are kept, so this only adds the rest. -->
			<AssigneeStacks
				itemId={item.id}
				itemTitle={item.title}
				assignedTo={item.assigned_to}
				{members}
				size={18}
				class="relative z-10 mb-3 pr-3 pl-[2.75rem]"
			/>
		</Card>
	</div>
</div>
