<script lang="ts">
	import type { Item, Vote, TripMember } from '$lib/types';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import Card from '$lib/ui/Card.svelte';
	import VoteSentimentPill from '$lib/collaboration/components/VoteSentimentPill.svelte';
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

	<!-- #231: assignee footer must sit INSIDE the card border. A button can't nest
	     in an anchor, so the card is a bordered <div> and the card-body tap is a
	     stretched <a> (after:absolute after:inset-0). The edit link + assignee
	     footer ride above it (relative z-10) and stay tappable. -->
	<Card class="group-hover:shadow-card-strong group-active:bg-surface-2">
		<div class="relative flex items-start gap-3 p-3">
			<!-- Stretched link: card body navigates to the item detail. -->
			<a
				href="/trips/{tripSlug}/items/{item.id}?from=trip"
				class="absolute inset-0 rounded-lg after:absolute after:inset-0"
				aria-label={item.title}
			></a>

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
					<div class="relative z-10 mt-1.5 w-fit">
						<VoteSentimentPill {votes} />
					</div>
				{/if}
			</div>
			<a
				href="/trips/{tripSlug}/items/{item.id}/edit"
				class="text-ink-muted hover:text-ink relative z-10 shrink-0 p-1"
				aria-label="Edit {item.title}"
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
				</svg>
			</a>
		</div>

		<!-- Assignee avatars + self-assign (ADR-0011 / #226) — now a child of the
		     bordered card (#231). relative z-10 lifts the buttons above the stretched
		     link; padding/indent on the row collapses the footer on solo trips. -->
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
