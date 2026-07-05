<script lang="ts">
	// #271 / ADR-0023 — the availability poll page. Paint when you're free; the group
	// heatmap surfaces consensus (green = everyone available). Forming-phase tool;
	// frozen read-only once the trip is dated.
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import AvailabilityCalendar from '$lib/ideation/components/AvailabilityCalendar.svelte';

	let { data } = $props();
</script>

<NavBar
	title="When can everyone go?"
	back
	backHref="/trips/{data.trip.slug}"
/>

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-10 space-y-4">
	<div class="px-0.5">
		<p class="font-display text-ink-soft text-base italic">Paint the days you're free.</p>
		<p class="text-ink-muted mt-1 text-sm">
			{#if data.canPaint}
				Mark yourself free or maybe on a day. When everyone's free, the day turns green — then
				an organizer can lock in the dates.
			{:else}
				The dates are set, so the poll is closed. Here's how everyone's availability landed.
			{/if}
		</p>
	</div>

	<Card>
		<div class="p-3">
			<AvailabilityCalendar
				weeks={data.poll.weeks}
				members={data.poll.members}
				myMemberId={data.poll.myMemberId}
				activeMemberCount={data.poll.activeMemberCount}
				canPaint={data.canPaint}
			/>
		</div>
	</Card>

	{#if data.canPaint && data.poll.greenDays.length > 0}
		<Card>
			<div class="p-4">
				<div class="text-ink-muted text-[9.5px] font-bold tracking-[0.14em] uppercase">
					Everyone's free
				</div>
				<p class="text-ink-soft mt-1 text-sm">
					<span class="font-mono">{data.poll.greenDays.length}</span>
					{data.poll.greenDays.length === 1 ? 'day works' : 'days work'} for the whole group so far.
					An owner can pick a window and set the dates from the scenario board or the direct
					set-dates door.
				</p>
			</div>
		</Card>
	{/if}
</main>
