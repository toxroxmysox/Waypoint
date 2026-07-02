<script lang="ts">
	import type { DndEvent } from 'svelte-dnd-action';
	import type { Item, Phase, Vote, TripMember } from '$lib/types';
	import ParkingLotSection from './ParkingLotSection.svelte';

	let {
		items,
		phases,
		tripSlug,
		phaseName = null,
		votesByItem = {},
		members = [],
		dragDisabled = true,
		startDrag = () => {},
		pullUp = () => {},
		onConsider = () => {},
		onFinalize = () => {}
	}: {
		items: Item[];
		phases: Phase[];
		tripSlug: string;
		/** Shown on boundary days to disambiguate the two per-phase zones (#87). */
		phaseName?: string | null;
		votesByItem?: Record<string, Vote[]>;
		members?: TripMember[];
		dragDisabled?: boolean;
		startDrag?: () => void;
		pullUp?: (itemId: string) => void;
		onConsider?: (e: CustomEvent<DndEvent<Item>>) => void;
		onFinalize?: (e: CustomEvent<DndEvent<Item>>) => void;
	} = $props();

	// Collapsed by default — the day stays focused on the plan, ideas one tap away.
	let expanded = $state(false);
	const label = $derived(phaseName ? `${phaseName} · ${items.length}` : `Parking lot · ${items.length}`);
	// #325: when there ARE parked ideas, the header must read as a tap-to-reveal control
	// (a first-time user missed the tiny chevron on a divider-styled header). A count pill.
	const hasIdeas = $derived(items.length > 0);
	const zoneName = $derived(phaseName ?? 'Parking lot');
	const countLabel = $derived(`${items.length} ${items.length === 1 ? 'idea' : 'ideas'}`);
</script>

<section class="space-y-1.5">
	<!-- Divider header: a count chip flanked by rules; tap toggles the ideas list. -->
	<button
		type="button"
		class="text-ink-muted hover:text-ink-soft flex w-full items-center gap-3"
		aria-expanded={expanded}
		onclick={() => (expanded = !expanded)}
	>
		<span class="border-line flex-1 border-t"></span>
		{#if hasIdeas}
			<!-- #325: a pill that clearly reads as a tap-to-expand control (bordered, raised)
			     with the idea count + a moss chevron; collapses back to the divider line. -->
			<span class="border-line bg-surface-2 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap">
				<span class="text-ink-soft">{zoneName}</span>
				<span class="text-ink-muted">·</span>
				<span class="text-ink">{expanded ? 'Hide' : countLabel}</span>
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="text-moss transition-transform duration-150 {expanded ? 'rotate-180' : ''}"
					aria-hidden="true"
				>
					<polyline points="6 9 12 15 18 9" />
				</svg>
			</span>
		{:else}
			<!-- Empty zone (e.g. a boundary day where this phase has no ideas): a plain
			     divider label — nothing to reveal, but still a drop target (#324). -->
			<span class="text-ink-muted flex items-center gap-1 text-[11px] font-medium tracking-wider whitespace-nowrap uppercase">
				{label}
			</span>
		{/if}
		<span class="border-line flex-1 border-t"></span>
	</button>

	<!-- Always mounted so it stays a drop target even while collapsed. -->
	<ParkingLotSection
		{items}
		{phases}
		{tripSlug}
		{votesByItem}
		{members}
		dndEnabled={true}
		collapsed={!expanded}
		{dragDisabled}
		{startDrag}
		{pullUp}
		{onConsider}
		{onFinalize}
	/>
</section>
