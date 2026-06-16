<script lang="ts">
	import type { Item, Vote, TripMember } from '$lib/types';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import Card from '$lib/ui/Card.svelte';
	import VoteCountPill from '$lib/collaboration/components/VoteCountPill.svelte';
	import AssigneeStacks from '$lib/itinerary/components/AssigneeStacks.svelte';
	import { formatTime, titleCase } from '$lib/shell/format';

	let {
		item,
		tripSlug,
		temporal,
		votes = [],
		members = []
	}: {
		item: Item;
		tripSlug: string;
		temporal: 'past' | 'current' | 'future';
		votes?: Vote[];
		members?: TripMember[];
	} = $props();

	const dimmed = $derived(temporal === 'past');
</script>

<div
	class="relative transition-opacity"
	class:opacity-50={dimmed}
	id="item-{item.id}"
>
	{#if temporal === 'current'}
		<div class="bg-clay absolute -left-2 top-0 bottom-0 w-1 rounded-full"></div>
	{/if}

	<Card href="/trips/{tripSlug}/items/{item.id}?from=trip">
		<div class="flex items-start gap-3 p-3">
			<TypeIcon type={item.type} sub={item.subtype} size={32} />
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<h4 class="text-ink truncate text-sm font-semibold">{item.title}</h4>
					{#if temporal === 'current'}
						<Pill variant="trip" size="sm">Right now</Pill>
					{/if}
					{#if item.status === 'done'}
						<Pill variant="booked" size="sm">Done</Pill>
					{/if}
				</div>
				{#if item.start_time || item.location_name}
					<p class="text-ink-muted mt-0.5 text-[12px]">
						{#if item.start_time}
							<span class="font-mono">
								{formatTime(item.start_time)}{item.end_time ? ` – ${formatTime(item.end_time)}` : ''}
							</span>
						{/if}
						{#if item.start_time && item.location_name}<span class="text-line"> · </span>{/if}
						{#if item.location_name}{item.location_name}{/if}
					</p>
				{/if}
				{#if item.subtype}
					<p class="text-ink-muted mt-1 text-[11px] uppercase tracking-wide">{titleCase(item.subtype)}</p>
				{/if}
				{#if votes.length}
					<div class="mt-1.5">
						<VoteCountPill {votes} />
					</div>
				{/if}
			</div>
			<a
				href="/trips/{tripSlug}/items/{item.id}/edit"
				class="text-ink-muted hover:text-ink shrink-0 p-1"
				aria-label="Edit {item.title}"
				onclick={(e) => e.stopPropagation()}
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
				</svg>
			</a>
		</div>
	</Card>

	<!-- Assignee avatars (ADR-0011) — sibling of the card link (button never nests
	     in an anchor). Tap opens the read-only view-names sheet. -->
	{#if members.length > 1 && item.assigned_to.length}
		<div class="mt-1.5 pl-1">
			<AssigneeStacks
				itemTitle={item.title}
				assignedTo={item.assigned_to}
				{members}
				size={18}
			/>
		</div>
	{/if}
</div>
