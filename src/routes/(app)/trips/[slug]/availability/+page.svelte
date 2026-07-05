<script lang="ts">
	// #271 / ADR-0023 — the availability poll page. Paint when you're free; the group
	// heatmap surfaces consensus (green = everyone available). Forming-phase tool;
	// frozen read-only once the trip is dated.
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import { enhance } from '$app/forms';
	import AvailabilityCalendar from '$lib/ideation/components/AvailabilityCalendar.svelte';

	let { data, form } = $props();

	// Direct-promotion window picker (owner/co_owner). Default to the contiguous run
	// of green days (everyone-free) if there is one; else leave blank for a manual pick.
	function contiguousGreenWindow(green: string[]): { start: string; end: string } {
		if (green.length === 0) return { start: '', end: '' };
		const sorted = [...green].sort();
		// Longest contiguous run.
		let bestStart = sorted[0], bestEnd = sorted[0], curStart = sorted[0], curEnd = sorted[0];
		const nextDay = (d: string) => {
			const dt = new Date(d + 'T00:00:00.000Z');
			dt.setUTCDate(dt.getUTCDate() + 1);
			return dt.toISOString().slice(0, 10);
		};
		for (let i = 1; i < sorted.length; i++) {
			if (sorted[i] === nextDay(curEnd)) {
				curEnd = sorted[i];
			} else {
				curStart = sorted[i];
				curEnd = sorted[i];
			}
			// track longest
			const curLen = (new Date(curEnd).getTime() - new Date(curStart).getTime());
			const bestLen = (new Date(bestEnd).getTime() - new Date(bestStart).getTime());
			if (curLen > bestLen) { bestStart = curStart; bestEnd = curEnd; }
		}
		return { start: bestStart, end: bestEnd };
	}
	const suggested = $derived(contiguousGreenWindow(data.poll.greenDays));
	let promoteOpen = $state(false);
	let promoting = $state(false);
	let winStart = $state('');
	let winEnd = $state('');
	$effect(() => {
		if (promoteOpen && !winStart && suggested.start) {
			winStart = suggested.start;
			winEnd = suggested.end;
		}
	});
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
				</p>

				{#if data.canPromote}
					{#if form?.error}
						<p role="alert" class="text-error-deep mt-2 text-sm">{form.error}</p>
					{/if}
					{#if !promoteOpen}
						<button
							type="button"
							onclick={() => (promoteOpen = true)}
							class="text-moss hover:text-ink mt-3 inline-flex items-center gap-1 text-xs font-semibold"
							data-testid="promote-toggle"
						>
							Go with a window — set the dates
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
						</button>
					{:else}
						<form
							method="POST"
							action="?/promote"
							data-testid="promote-form"
							use:enhance={() => {
								promoting = true;
								return async ({ update }) => {
									promoting = false;
									await update();
								};
							}}
							class="mt-3"
						>
							<p class="text-ink-muted text-xs">
								Setting the dates builds the day-by-day itinerary and closes the poll. One-way.
							</p>
							<div class="mt-2 flex items-end gap-3">
								<div class="min-w-0 flex-1">
									<label for="win-start" class="text-ink-soft block text-xs font-medium">Start</label>
									<input type="date" id="win-start" name="start" bind:value={winStart} required
										class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-3 py-2 text-sm" />
								</div>
								<div class="min-w-0 flex-1">
									<label for="win-end" class="text-ink-soft block text-xs font-medium">End</label>
									<input type="date" id="win-end" name="end" bind:value={winEnd} required
										class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-3 py-2 text-sm" />
								</div>
							</div>
							<Button type="submit" variant="moss" size="md" class="mt-3 w-full" disabled={promoting} loading={promoting}>
								{promoting ? 'Setting up the days…' : 'Set these dates'}
							</Button>
						</form>
					{/if}
				{:else}
					<p class="text-ink-muted mt-1 text-xs">
						An owner can pick a window and set the dates.
					</p>
				{/if}
			</div>
		</Card>
	{/if}
</main>
