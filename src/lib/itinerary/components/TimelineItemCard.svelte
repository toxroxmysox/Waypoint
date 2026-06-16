<script lang="ts">
	import type { Item, Vote, TripMember } from '$lib/types';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import Card from '$lib/ui/Card.svelte';
	import VoteCountPill from '$lib/collaboration/components/VoteCountPill.svelte';
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
		<Card href="/trips/{tripSlug}/items/{item.id}">
			<div class="flex items-start gap-3 p-3" class:border-l-2={overlapping} class:border-gold={overlapping}>
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
						{:else}
							<span>No Time Set</span>
						{/if}
						{#if item.location_name}<span class="text-line">·</span> {item.location_name}{/if}
					</p>

					<!-- Slot: subtype -->
					{#if item.subtype}
						<p class="text-ink-muted mt-1 text-[11px] uppercase tracking-wide">{titleCase(item.subtype)}</p>
					{/if}

					<!-- Slot: vote count pill (ADR-0011 — avatars now mean assignees, votes are a count) -->
					{#if votes.length}
						<div class="mt-1.5">
							<VoteCountPill {votes} />
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
		</Card>

		<!-- Slot: assignee avatars + self-assign (ADR-0011 / #226). Sibling of the
		     card link — a button must never nest inside the card's <a>. Tap opens
		     the view-names sheet (with a "+ Me" toggle for members). Self-gates on
		     >1 member, so it renders nothing on solo trips. -->
		<AssigneeStacks
			itemId={item.id}
			itemTitle={item.title}
			assignedTo={item.assigned_to}
			{members}
			size={18}
		/>
	</div>
</div>
