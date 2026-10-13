<script lang="ts">
	import { formatCalendarDate } from '$lib/shell/format';
	import { withOrigin } from '$lib/shell/back-nav';
	import { page } from '$app/state';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import SectionH from '$lib/ui/SectionH.svelte';
	import FAB from '$lib/shell/components/FAB.svelte';
	import IdeaCaptureSheet from '$lib/itinerary/components/IdeaCaptureSheet.svelte';
	import DayNav from '$lib/shell/components/DayNav.svelte';
	import DayTimeline from '$lib/itinerary/components/DayTimeline.svelte';
	import { ideaScores } from '$lib/itinerary/idea-groups';
	import ParkingDivider from '$lib/itinerary/components/ParkingDivider.svelte';
	import DragDropTimeline from '$lib/itinerary/components/DragDropTimeline.svelte';
	import { itemPermissions } from '$lib/itinerary/item-actions';
	import SpanBand from '$lib/itinerary/components/SpanBand.svelte';
	import ServerErrorAlert from '$lib/ui/ServerErrorAlert.svelte';
	import LevelHeader from '$lib/itinerary/components/LevelHeader.svelte';
	import NotesEditor from '$lib/itinerary/components/NotesEditor.svelte';

	let { data, form } = $props();

	// #252 — consistent capture affordance, defaulting to this day + its phase.
	let ideaSheetOpen = $state(false);

	function dayLabel(): string {
		return formatCalendarDate(data.day.date, {
			weekday: 'long',
			month: 'long',
			day: 'numeric'
		});
	}

	function shortDayLabel(): string {
		return formatCalendarDate(data.day.date, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}

	let backHref = $derived(
		data.dayPhases.length > 0
			? `/trips/${data.trip.slug}/phases/${data.dayPhases[0].id}`
			: `/trips/${data.trip.slug}`
	);
</script>

<NavBar title={shortDayLabel()} subtitle={data.trip.title} back {backHref} />
<DayNav days={data.days} currentDayId={data.day.id} tripSlug={data.trip.slug} />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-24 space-y-4">
	<!-- #401 — day Level Header; keyed by day id so an unsaved notes draft is discarded on day navigation -->
	{#key data.day.id}
		<LevelHeader
			title={dayLabel()}
			span=""
			chips={data.dayPhases.map((p) => ({
				label: p.name,
				href: `/trips/${data.trip.slug}/phases/${p.id}`
			}))}
		>
			{#snippet actions()}
				{#if data.dayPhases.length > 1}
					<Pill variant="info" size="sm">Travel day</Pill>
				{/if}
			{/snippet}
			{#snippet notes()}
				<NotesEditor
					notes={data.day.notes}
					action="?/updateNotes"
					canEdit={data.membership.role !== 'viewer'}
					emptyPrompt="Add day notes"
				/>
			{/snippet}
		</LevelHeader>
	{/key}

	<ServerErrorAlert {form} />

	{#if data.spanningItems.length > 0}
		<div class="space-y-2">
			{#each data.spanningItems as item (item.id)}
				<SpanBand
					{item}
					days={data.allDays}
					dayDate={data.day.date.split(/[T ]/)[0]}
					tripSlug={data.trip.slug}
				/>
			{/each}
		</div>
	{/if}

	<DragDropTimeline
		dayItems={data.dayItems}
		parkingByPhase={data.dayPhases.map((p) => ({
			phaseId: p.id,
			items: data.parkingLotItems.filter((i) => i.phase === p.id)
		}))}
		dayPhaseIds={data.dayPhases.map((p) => p.id)}
		scoreById={ideaScores(data.votesByItem)}
		tripSlug={data.trip.slug}
		dayId={data.day.id}
		canArrange={data.membership.role === 'owner' || data.membership.role === 'co_owner'}
		canPullUp={(i) => itemPermissions(data.membership, i).canMove}
	>
		{#snippet children({ timelineItems, pullUp, onTimelineConsider, onTimelineFinalize, parkingZones, planDrop, dragDisabled, canPullUp })}
			<!-- Items -->
			<section class="space-y-1.5">
				<SectionH>
					{#snippet right()}
						<a
							href={withOrigin(`/trips/${data.trip.slug}/items/new?day=${data.day.id}`, page.url.pathname)}
							class="text-ink-muted hover:text-ink-soft active:text-ink-soft"
							aria-label="Add item"
						>
							+ Add
						</a>
					{/snippet}
					Items
				</SectionH>

				<DayTimeline
					items={timelineItems}
					tripSlug={data.trip.slug}
					dayId={data.day.id}
					docCountByItem={data.docCountByItem}
					members={data.members}
					onConsider={onTimelineConsider}
					onFinalize={onTimelineFinalize}
					{planDrop}
					{dragDisabled}
				/>
			</section>

			<!-- Parking lot (mobile/tablet) — a collapsed divider per phase, always a
			     drop target even when empty/collapsed. On a boundary day the two phases
			     get separate zones so a cross-phase pull is rejected (#87). -->
			<div class="space-y-2 lg-desktop:hidden">
				{#each parkingZones as zone (zone.phaseId)}
					<ParkingDivider
						items={zone.items}
						phases={data.dayPhases}
						tripSlug={data.trip.slug}
						phaseName={data.dayPhases.length > 1
							? (data.dayPhases.find((p) => p.id === zone.phaseId)?.name ?? null)
							: null}
						votesByItem={data.votesByItem}
						members={data.members}
						myMemberId={data.membership.id}
						canVote={data.membership.role !== 'viewer'}
						dragActive={zone.dragActive}
						{dragDisabled}
						{canPullUp}
						{pullUp}
						onConsider={zone.onConsider}
						onFinalize={zone.onFinalize}
					/>
				{/each}
			</div>
		{/snippet}
	</DragDropTimeline>
</main>

<!-- #252 — same capture affordance + position as the Overview and Phase Detail;
     opens the idea/plan fork sheet (defaults to this day + its phase) instead of
     jumping straight to the fuller items/new flow. -->
<FAB onclick={() => (ideaSheetOpen = true)} label="Add idea or plan" />
<IdeaCaptureSheet
	bind:open={ideaSheetOpen}
	slug={data.trip.slug}
	phases={data.phases}
	defaultPhaseId={data.dayPhases[0]?.id ?? ''}
	defaultDayId={data.day.id}
/>
