<script lang="ts">
	// #337 — the scenario board: the forming trip's home (spec §Surface). A vertical
	// scroll of rich cards under a quiet header. Empty → "Pitch the first scenario."
	import type { ScenarioBoardData } from '$lib/ideation/scenario-board.server';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import ScenarioCard from './ScenarioCard.svelte';

	let {
		board,
		slug,
		canPitch = false,
		onpitch
	}: {
		board: ScenarioBoardData;
		slug: string;
		canPitch?: boolean;
		onpitch?: () => void;
	} = $props();

	const count = $derived(board.scenarios.length);
</script>

<section class="space-y-2" data-testid="scenario-board">
	{#if count > 0}
		<div class="flex items-center justify-between px-0.5">
			<span class="text-ink-muted font-mono text-[11px] tracking-[0.08em] uppercase">
				Scenarios · {count} candidate{count === 1 ? '' : 's'}
			</span>
			{#if canPitch}
				<button
					type="button"
					onclick={onpitch}
					class="text-moss hover:text-ink inline-flex items-center gap-1 text-xs font-semibold"
					data-testid="pitch-scenario"
				>
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
					New scenario
				</button>
			{/if}
		</div>
		<div class="space-y-2.5">
			{#each board.scenarios as scenario (scenario.id)}
				<ScenarioCard
					{scenario}
					members={board.members}
					href="/trips/{slug}/scenarios/{scenario.id}"
				/>
			{/each}
		</div>
	{:else}
		<!-- Empty state — the forming home's front door (spec §Surface). -->
		<Card strong accent="var(--color-moss)">
			<div class="p-6 text-center" data-testid="scenario-empty">
				<p class="font-display text-ink text-lg italic">Pitch the first scenario.</p>
				<p class="text-ink-muted mx-auto mt-1.5 max-w-xs text-sm">
					A scenario is a take on the trip — where, when, roughly how much. Float one and
					the group weighs in; the winner sets the dates.
				</p>
				{#if canPitch}
					<div class="mt-4" data-testid="pitch-first">
						<Button variant="moss" size="md" onclick={onpitch}>
							Pitch a scenario
						</Button>
					</div>
				{:else}
					<p class="text-ink-muted mt-3 text-xs">
						Anyone on the trip can pitch one — check back as ideas land.
					</p>
				{/if}
			</div>
		</Card>
	{/if}
</section>
