<script lang="ts">
	import { enhance } from '$app/forms';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import SectionH from '$lib/ui/SectionH.svelte';
	import DayCard from '$lib/itinerary/components/DayCard.svelte';
	import PhaseParkingReorder from '$lib/itinerary/components/PhaseParkingReorder.svelte';
	import GhostCard from '$lib/itinerary/components/GhostCard.svelte';
	import DayMetricToggle from '$lib/itinerary/components/DayMetricToggle.svelte';
	import FAB from '$lib/shell/components/FAB.svelte';
	import IdeaCaptureSheet from '$lib/itinerary/components/IdeaCaptureSheet.svelte';
	import { toast } from '$lib/shell/stores/toast';
	import { titleCase } from '$lib/shell/format';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';

	let { data, form } = $props();

	// #273 — constrain the phase date pickers to the trip range (a phase span lives
	// inside the trip). Empty = dateless trip → no bound.
	const tripStart = $derived(String(data.trip.start_date || '').split(/[T ]/)[0]);
	const tripEnd = $derived(String(data.trip.end_date || '').split(/[T ]/)[0]);
	// #323 — the first phase (start == trip start) is pinned; under the tiling model
	// (ADR-0021) its boundary can't move, so its start picker is locked to trip start.
	const isFirstPhase = $derived(
		String(data.phase.start_date || '').split(/[T ]/)[0] === tripStart
	);

	// #252 — consistent capture affordance, defaulting to THIS phase.
	let ideaSheetOpen = $state(false);

	// #252 — show the post-submit toast carried by the /ideas redirect param, then
	// strip it from the URL so a refresh doesn't re-toast. Matches the expenses/
	// documents ?action= cleanup: shallow `replaceState` (no navigation, so it never
	// touches the contextual-back depth counter — ADR-0012 scar).
	$effect(() => {
		const msg = page.url.searchParams.get('ideaToast');
		if (msg) {
			toast.show(msg);
			const url = new URL(page.url);
			url.searchParams.delete('ideaToast');
			replaceState(url, page.state);
		}
	});

	let today = new Date().toISOString().split('T')[0];

	let editing = $state(false);
	let loading = $state(false);
	let error = $derived(form?.error ?? form?.reviewError ?? '');
	const parkingLotItems = $derived(data.phaseItems.filter((it) => it.status === 'unplanned'));
	// #248 — pending suggestions for this phase, as Ghost Cards (dotted "pending"),
	// sourced from the pure parking-lot-cards merge so they tag + sort consistently.
	const ghostCards = $derived(data.parkingCards.filter((c) => c.kind === 'ghost'));
	// Viewers see ghosts read-only-but-can-see (no cast buttons).
	const canVoteGhosts = $derived(data.viewerRole !== 'viewer');
	// #249/#250 — owner/co_owner get in-place approve/reject on each ghost.
	const canReviewGhosts = $derived(data.viewerRole === 'owner' || data.viewerRole === 'co_owner');

	// #249/#250 — surface the review outcome as a toast (enhance already re-ran load,
	// so the ghost has already promoted/left by the time this fires).
	$effect(() => {
		if (form?.approved) toast.show('Idea approved');
		else if (form?.rejected) toast.show('Idea rejected');
	});
	const parkingLotCount = $derived(parkingLotItems.length + ghostCards.length);

	// #57 — quick-add an idea into this phase's parking lot.
	let addingIdea = $state(false);
	let savingIdea = $state(false);
	let ideaTitle = $state('');
	let ideaType = $state('activity');
	let ideaError = $derived(form?.ideaError ?? '');
	const ideaTypes = ['activity', 'meal', 'lodging', 'transportation', 'flight', 'note'] as const;

	function daysNightsLabel(start: string, end: string): string {
		const s = new Date(start.substring(0, 10) + 'T00:00:00.000Z');
		const e = new Date(end.substring(0, 10) + 'T00:00:00.000Z');
		const days = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
		if (days <= 1) return '1 day';
		return `${days} days · ${days - 1} night${days - 1 === 1 ? '' : 's'}`;
	}
</script>

<NavBar title={data.phase.name} subtitle={data.trip.title} back backHref="/trips/{data.trip.slug}/phases" />

<!-- #89 layout pass — composition only. Three zones with distinct textures:
     1. Phase identity as a masthead set directly on paper (typography carries
        the hierarchy, not card chrome), closed by a hairline.
     2. Days — the committed plan — lead as standard cards on paper.
     3. Parking lot below, as a recessed surface-2 tray — white idea cards pop
        against it, and the tray reads as "holding area" vs. the plan above.
     ≥900px the two working zones sit side by side (7fr plan / 5fr pool).
     Card content, drag wiring (#87/#88), and DayCard internals (#65) untouched. -->
<main class="mx-auto w-full max-w-lg md-desktop:max-w-4xl flex-1 px-4 pt-5 pb-10">
	{#if error}
		<div role="alert" class="border-error/30 bg-error/10 text-error-deep mb-4 rounded-md border p-3 text-sm">{error}</div>
	{/if}

	<header class="border-line border-b pb-4">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<h2 class="font-display text-ink text-[26px] leading-[1.15] font-semibold tracking-[-0.3px]">{data.phase.name}</h2>
				{#if data.phase.location}
					<p class="text-ink-soft mt-1 text-sm">{data.phase.location}</p>
				{/if}
			</div>
			<Button onclick={() => (editing = !editing)} variant="ghost" size="sm">
				{editing ? 'Cancel' : 'Edit'}
			</Button>
		</div>
		<p class="text-ink-muted font-mono mt-2.5 text-[11.5px]">
			{new Date(data.phase.start_date.replace(' ', 'T')).toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				timeZone: 'UTC'
			})}
			–
			{new Date(data.phase.end_date.replace(' ', 'T')).toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
				timeZone: 'UTC'
			})}
			<span class="text-line">·</span>
			{daysNightsLabel(data.phase.start_date, data.phase.end_date)}
		</p>
	</header>

	{#if editing}
		<Card class="mt-4">
			<form
				method="POST"
				action="?/update"
				use:enhance={() => {
					loading = true;
					return async ({ result, update }) => {
						loading = false;
						if (result.type === 'success') {
							editing = false;
							toast.show('Phase updated');
						}
						await update();
					};
				}}
				class="p-4 space-y-3"
			>
				<div>
					<label for="name" class="text-ink-soft block text-sm font-medium">Name</label>
					<input
						type="text"
						id="name"
						name="name"
						required
						value={data.phase.name}
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					/>
				</div>

				<div>
					<label for="location" class="text-ink-soft block text-sm font-medium">Location</label>
					<input
						type="text"
						id="location"
						name="location"
						value={data.phase.location}
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					/>
				</div>

				<div>
					<label for="start_date" class="text-ink-soft block text-sm font-medium">Starts</label>
					<input
						type="date"
						id="start_date"
						name="start_date"
						required
						value={data.phase.start_date.split('T')[0].split(' ')[0]}
						min={tripStart || undefined}
						max={(isFirstPhase ? tripStart : tripEnd) || undefined}
						class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-3 py-2 text-sm"
					/>
					<p class="text-ink-muted mt-1 text-xs">
						{isFirstPhase
							? 'The first phase always starts when the trip begins.'
							: 'Runs until the next phase begins (or the end of the trip).'}
					</p>
				</div>

				<div>
					<label for="country_code" class="text-ink-soft block text-sm font-medium">Country</label>
					<input
						type="text"
						id="country_code"
						name="country_code"
						maxlength="2"
						value={data.phase.country_code}
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm uppercase"
					/>
				</div>

				<Button type="submit" disabled={loading} loading={loading} variant="moss" size="md" class="w-full">
					{loading ? 'Saving…' : 'Save changes'}
				</Button>
			</form>
		</Card>
	{/if}

	<div class="mt-6 space-y-7 md-desktop:grid md-desktop:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md-desktop:items-start md-desktop:gap-x-10 md-desktop:space-y-0">
		<section class="md-desktop:mt-0">
			<div class="mb-2 flex items-center justify-between gap-2">
				<div class="flex items-baseline gap-2">
					<SectionH>Days</SectionH>
					<span class="text-ink-muted font-mono text-[11px]">{data.phaseDays.length}</span>
				</div>
				{#if data.phaseDays.length > 0}
					<DayMetricToggle />
				{/if}
			</div>
			{#if data.phaseDays.length === 0}
				<div class="px-4 py-7 text-center">
					<p class="font-display text-ink-soft text-base italic">A blank stretch of calendar.</p>
					<p class="text-ink-muted mt-1 text-[13px]">No days fall within this phase's date range.</p>
				</div>
			{:else}
				<div class="space-y-1.5">
					{#each data.phaseDays as day}
						<DayCard
							{day}
							href="/trips/{data.trip.slug}/days/{day.id}"
							summary={data.daySummaries[day.id]}
							{today}
						/>
					{/each}
				</div>
			{/if}
		</section>

		<section>
			<div class="mb-2 flex items-center justify-between gap-2">
				<div class="flex items-baseline gap-2">
					<SectionH>Parking lot</SectionH>
					<span class="text-ink-muted font-mono text-[11px]">{parkingLotCount}</span>
				</div>
				<Button onclick={() => (addingIdea = !addingIdea)} variant="ghost" size="sm">
					{addingIdea ? 'Cancel' : '+ Add idea'}
				</Button>
			</div>

			<div class="border-line bg-surface-2 rounded-lg border p-2.5 space-y-3">
				{#if addingIdea}
					<Card>
						<form
							method="POST"
							action="?/addIdea"
							use:enhance={() => {
								savingIdea = true;
								return async ({ result, update }) => {
									savingIdea = false;
									if (result.type === 'success') {
										addingIdea = false;
										ideaTitle = '';
										ideaType = 'activity';
										toast.show('Idea added to parking lot');
									}
									await update();
								};
							}}
							class="p-3 space-y-3"
						>
							{#if ideaError}
								<p role="alert" class="text-error-deep text-sm">{ideaError}</p>
							{/if}
							<div>
								<label for="idea-title" class="text-ink-soft block text-sm font-medium">Idea</label>
								<input
									type="text"
									id="idea-title"
									name="title"
									required
									bind:value={ideaTitle}
									placeholder="e.g. Tapas crawl in Seville"
									class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
								/>
							</div>
							<div>
								<label for="idea-type" class="text-ink-soft block text-sm font-medium">Type</label>
								<select
									id="idea-type"
									name="type"
									bind:value={ideaType}
									class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
								>
									{#each ideaTypes as t}
										<option value={t}>{titleCase(t)}</option>
									{/each}
								</select>
							</div>
							<Button type="submit" disabled={savingIdea} loading={savingIdea} variant="moss" size="md" class="w-full">
								{savingIdea ? 'Adding…' : 'Add to parking lot'}
							</Button>
						</form>
					</Card>
				{/if}

				{#if parkingLotItems.length > 0}
					<!-- #88 — drag-reorder ideas; persists sort_order among this phase's unplanned items. -->
					<PhaseParkingReorder items={parkingLotItems} tripSlug={data.trip.slug} />
				{/if}

				{#if ghostCards.length > 0}
					<!-- #248 — pending suggestions as dotted Ghost Cards, visible to all
					     members and votable (viewers read-only). Below the real ideas;
					     they're proposals awaiting review, not settled parking-lot items. -->
					<div class="space-y-1.5">
						{#each ghostCards as card (card.id)}
							<GhostCard
								{card}
								members={data.members}
								myMemberId={data.myMemberId}
								canVote={canVoteGhosts}
								canReview={canReviewGhosts}
							/>
						{/each}
					</div>
				{/if}

				{#if parkingLotItems.length === 0 && ghostCards.length === 0 && !addingIdea}
					<div class="px-4 py-7 text-center">
						<p class="font-display text-ink-soft text-base italic">No ideas yet.</p>
						<p class="text-ink-muted mt-1 text-[13px]">Add one to start a parking lot for this phase.</p>
					</div>
				{/if}
			</div>
		</section>
	</div>
</main>

<!-- #252 — same capture affordance + position as the Overview and day views.
     Defaults the idea's phase to THIS phase. -->
<FAB onclick={() => (ideaSheetOpen = true)} label="Add idea or plan" />
<IdeaCaptureSheet
	bind:open={ideaSheetOpen}
	slug={data.trip.slug}
	phases={data.phases}
	defaultPhaseId={data.phase.id}
/>
