<script lang="ts">
	// #252 / PRD #202 — the easy-capture fork sheet. One consistent affordance
	// across the Overview, Phase Detail, and day views opens this sheet, which leads
	// with a FORK:
	//   • Add an idea  → title + phase (REQUIRED) + type → an unplanned parking-lot
	//                    contribution (routed through /api/suggestions/create, so a
	//                    traveler queues / auto-approves and an owner auto-approves).
	//   • Plan it for a day → the existing fuller items/new flow.
	// Submitting an idea redirects to the phase where it now lives + a toast (handled
	// by the /ideas action's ?ideaToast redirect param, read on the phase page).
	//
	// Generalizes the buried Phase-Detail quick-add (#57) into a trip-wide capture.
	import BottomSheet from '$lib/ui/BottomSheet.svelte';
	import Button from '$lib/ui/Button.svelte';
	import { enhance } from '$app/forms';
	import { titleCase } from '$lib/shell/format';
	import type { Phase } from '$lib/types';

	let {
		open = $bindable(false),
		slug,
		phases = [],
		defaultPhaseId = '',
		defaultDayId = '',
		forming = false
	}: {
		open: boolean;
		slug: string;
		/** Every phase on the trip — the required-phase picker. #217 guarantees ≥1. */
		phases?: Phase[];
		/** Pre-selected phase (the current phase on Phase Detail / the day's phase). */
		defaultPhaseId?: string;
		/** When opened from a day, "Plan it for a day" preselects this day. */
		defaultDayId?: string;
		/**
		 * #270 / ADR-0022 — a forming (dateless) trip has no phases and no days:
		 * the fork collapses to the idea mini-form (no "plan it for a day"), and
		 * the phase picker is hidden (ideas are phase-less until promotion).
		 */
		forming?: boolean;
	} = $props();

	// Two-step within the sheet: the fork (choose), then the idea mini-form.
	// Forming skips the fork — ideas are the only capture path without days.
	let mode = $state<'fork' | 'idea'>('fork');
	let title = $state('');
	let phaseId = $state('');
	let type = $state('activity');
	let submitting = $state(false);
	let ideaError = $state('');
	const ideaTypes = ['activity', 'meal', 'lodging', 'transportation', 'flight', 'note'] as const;

	// Reset the sheet each time it opens, seeding the phase from context.
	$effect(() => {
		if (open) {
			mode = forming ? 'idea' : 'fork';
			title = '';
			phaseId = defaultPhaseId || phases[0]?.id || '';
			type = 'activity';
			ideaError = '';
		}
	});

	// "Plan it for a day" → the existing items/new flow, carrying day/phase context.
	const planHref = $derived.by(() => {
		const params = new URLSearchParams();
		if (defaultDayId) params.set('day', defaultDayId);
		if (phaseId || defaultPhaseId) params.set('phase', phaseId || defaultPhaseId);
		const qs = params.toString();
		return `/trips/${slug}/items/new${qs ? `?${qs}` : ''}`;
	});
</script>

<BottomSheet bind:open title={mode === 'idea' ? 'Add an idea' : 'Add to this trip'}>
	{#if mode === 'fork'}
		<div class="space-y-2">
			<button
				type="button"
				class="border-line hover:bg-surface-2 flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors"
				onclick={() => (mode = 'idea')}
			>
				<div class="bg-moss-tint text-moss flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" />
					</svg>
				</div>
				<div class="min-w-0">
					<p class="text-ink text-sm font-semibold">Add an idea</p>
					<p class="text-ink-muted text-xs">Drop it in a phase's parking lot — no day needed</p>
				</div>
			</button>

			<a
				href={planHref}
				class="border-line hover:bg-surface-2 flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors"
				onclick={() => (open = false)}
			>
				<div class="bg-clay-tint text-clay flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
					</svg>
				</div>
				<div class="min-w-0">
					<p class="text-ink text-sm font-semibold">Plan it for a day</p>
					<p class="text-ink-muted text-xs">Schedule it with times, booking, the works</p>
				</div>
			</a>
		</div>
	{:else}
		<!-- Idea mini-form. Posts to the shared /ideas action so all three entry
		     points submit identically; on success it redirects to the phase + toast. -->
		<form
			method="POST"
			action="/trips/{slug}/ideas?/create"
			use:enhance={() => {
				submitting = true;
				ideaError = '';
				return async ({ result, update }) => {
					submitting = false;
					if (result.type === 'failure') {
						ideaError = (result.data?.error as string) || 'Could not add the idea.';
					} else if (result.type === 'redirect') {
						open = false;
					}
					// On redirect, enhance follows it (goto) → the phase page shows the
					// toast from ?ideaToast. On failure, surface the message in-sheet.
					await update();
				};
			}}
			class="space-y-3"
		>
			{#if ideaError}
				<p role="alert" class="text-error-deep text-sm">{ideaError}</p>
			{/if}

			<div>
				<label for="idea-cap-title" class="text-ink-soft block text-sm font-medium">Idea</label>
				<input
					id="idea-cap-title"
					name="title"
					type="text"
					required
					bind:value={title}
					placeholder="e.g. Sunset kayak tour"
					class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
				/>
			</div>

			{#if !forming}
				<div>
					<label for="idea-cap-phase" class="text-ink-soft block text-sm font-medium">Phase</label>
					<select
						id="idea-cap-phase"
						name="phase"
						required
						bind:value={phaseId}
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					>
						{#each phases as p (p.id)}
							<option value={p.id}>{p.name}</option>
						{/each}
					</select>
					<p class="text-ink-muted mt-1 text-xs">Every idea lives in a phase.</p>
				</div>
			{/if}

			<div>
				<label for="idea-cap-type" class="text-ink-soft block text-sm font-medium">Type</label>
				<select
					id="idea-cap-type"
					name="type"
					bind:value={type}
					class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
				>
					{#each ideaTypes as t (t)}
						<option value={t}>{titleCase(t)}</option>
					{/each}
				</select>
			</div>

			<div class="flex items-center gap-2 pt-1">
				<Button type="submit" variant="moss" size="md" disabled={submitting || !title.trim() || (!forming && !phaseId)} class="flex-1">
					{submitting ? 'Sending…' : 'Add idea'}
				</Button>
				{#if !forming}
					<Button type="button" variant="ghost" size="md" disabled={submitting} onclick={() => (mode = 'fork')}>
						Back
					</Button>
				{/if}
			</div>
		</form>
	{/if}
</BottomSheet>
