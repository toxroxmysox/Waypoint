<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PhaseSketchSegment } from '$lib/ideation/types';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Row from '$lib/ui/Row.svelte';
	import SketchEditor from '$lib/ideation/components/SketchEditor.svelte';
	import { untrack } from 'svelte';
	import { revealServerError, errorField } from '$lib/shell/actions/validate-form';

	let { data, form } = $props();

	const f = untrack(() => data.fork);
	// Prefer a failed submit's values, else the fork pre-fill, else blank. Reading
	// `form` here only captures its initial value on purpose (the pre-fill) — wrap in
	// untrack so Svelte doesn't warn about a locally-referenced prop in $state init.
	const v = untrack(
		() =>
			(form && 'values' in form ? form.values : undefined) as
				| {
						title: string;
						pitch: string;
						date_start: string;
						date_end: string;
						budget_per_person: string;
				  }
				| undefined
	);
	let title = $state(v?.title ?? f?.title ?? '');
	let pitch = $state(v?.pitch ?? f?.pitch ?? '');
	let dateStart = $state(v?.date_start ?? f?.dateStart ?? '');
	let dateEnd = $state(v?.date_end ?? f?.dateEnd ?? '');
	let budget = $state(
		v?.budget_per_person ?? (f?.budgetPerPerson ? String(f.budgetPerPerson) : '')
	);
	let sketch = $state<PhaseSketchSegment[]>(f?.sketch ? [...f.sketch] : []);
	let selectedCoreIdeas = $state<Set<string>>(new Set(f?.coreIdeas ?? []));
	let newCoreIdeas = $state('');

	// #375 — a server fail() renders its explanation at the top of the page,
	// out of sight from the submit control. Scroll it (or the named field) back
	// into view and give it focus.
	let alertEl = $state<HTMLElement | null>(null);
	$effect(() => {
		if (form?.error) revealServerError(alertEl, errorField(form));
	});
	let submitting = $state(false);

	function toggleCoreIdea(id: string) {
		const next = new Set(selectedCoreIdeas);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedCoreIdeas = next;
	}
</script>

<NavBar title={f ? 'Fork this scenario' : 'New scenario'} back backHref="/trips/{data.trip.slug}" />

<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-10 md-desktop:max-w-2xl">
	<form
		method="POST"
		action="?/create"
		data-testid="scenario-composer"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				submitting = false;
				await update();
			};
		}}
	>
		{#if f}
			<input type="hidden" name="fork_of" value={f.id} />
			<p class="mb-3 font-mono text-[11px] text-moss">⑂ forking “{f.title}” — tweak anything.</p>
		{/if}

		{#if form?.error}
			<p bind:this={alertEl} role="alert" class="mb-3 text-sm text-error-deep">{form.error}</p>
		{/if}

		<!-- Title first — the only required field. -->
		<Card>
			<div class="p-4">
				<label for="sc-title" class="block text-xs font-semibold text-ink-soft">The pitch</label>
				<input
					id="sc-title"
					name="title"
					bind:value={title}
					required
					maxlength="120"
					placeholder="e.g. Thailand, north → islands"
					data-testid="sc-title"
					class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 font-display text-base text-ink"
				/>
				<label for="sc-pitch" class="mt-3 block text-xs font-semibold text-ink-soft"
					>One-liner (optional)</label
				>
				<input
					id="sc-pitch"
					name="pitch"
					bind:value={pitch}
					maxlength="200"
					placeholder="What's the idea in a sentence?"
					class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
				/>
			</div>
		</Card>

		<!-- Everything below is optional — the group fleshes it out over time. -->
		<p class="mt-4 mb-1.5 px-0.5 text-[9.5px] font-bold tracking-[0.12em] text-ink-muted uppercase">
			Optional — fill in what you know
		</p>

		<Card>
			<div class="space-y-4 p-4">
				<div>
					<p class="text-xs font-semibold text-ink-soft">When</p>
					<div class="mt-1 flex items-end gap-3">
						<div class="min-w-0 flex-1">
							<label for="sc-start" class="block text-[11px] text-ink-muted">Start</label>
							<input
								type="date"
								id="sc-start"
								name="date_start"
								bind:value={dateStart}
								class="mt-1 block w-full min-w-0 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
							/>
						</div>
						<div class="min-w-0 flex-1">
							<label for="sc-end" class="block text-[11px] text-ink-muted">End</label>
							<input
								type="date"
								id="sc-end"
								name="date_end"
								bind:value={dateEnd}
								class="mt-1 block w-full min-w-0 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
							/>
						</div>
					</div>
					<p class="mt-1 text-[11px] text-ink-muted">
						Both dates are needed to win the vote — but you can pitch without them.
					</p>
				</div>

				<div>
					<label for="sc-budget" class="text-xs font-semibold text-ink-soft"
						>Budget per person</label
					>
					<div class="mt-1 flex items-center gap-1.5">
						<span class="text-sm text-ink-muted">~$</span>
						<input
							id="sc-budget"
							name="budget_per_person"
							bind:value={budget}
							inputmode="numeric"
							placeholder="rough, USD"
							class="w-32 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
						/>
					</div>
				</div>

				<div>
					<p class="text-xs font-semibold text-ink-soft">The shape of it</p>
					<p class="mt-0.5 mb-2 text-[11px] text-ink-muted">
						Sketch the legs — a name and how many nights.
					</p>
					<SketchEditor bind:segments={sketch} {dateStart} {dateEnd} />
				</div>
			</div>
		</Card>

		<!-- Core Ideas — anchor ideas. Pick from existing, or quick-create new ones. -->
		<Card>
			<div class="p-4">
				<p class="text-xs font-semibold text-ink-soft">Anchor ideas</p>
				<p class="mt-0.5 text-[11px] text-ink-muted">The must-dos that make this pitch worth it.</p>
				{#if data.ideas.length > 0}
					<div class="mt-1" data-testid="core-idea-picker">
						{#each data.ideas as idea, i (idea.id)}
							<Row
								type={idea.type}
								subtype={idea.subtype}
								title={idea.title}
								sub={idea.place}
								selected={selectedCoreIdeas.has(idea.id)}
								onselect={() => toggleCoreIdea(idea.id)}
								divider={i < data.ideas.length - 1}
							/>
						{/each}
					</div>
				{/if}
				{#each [...selectedCoreIdeas] as id (id)}
					<input type="hidden" name="core_idea" value={id} />
				{/each}
				<label for="sc-newk" class="mt-3 block text-[11px] text-ink-muted"
					>Add new anchors (one per line)</label
				>
				<textarea
					id="sc-newk"
					name="new_core_ideas"
					bind:value={newCoreIdeas}
					rows="2"
					placeholder="Doi Suthep sunrise&#10;Street-food crawl"
					class="mt-1 block w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
				></textarea>
			</div>
		</Card>

		<div class="mt-4 flex gap-2">
			<Button
				type="submit"
				variant="moss"
				size="md"
				class="flex-1"
				disabled={submitting || !title.trim()}
				loading={submitting}
			>
				{submitting ? 'Pitching…' : f ? 'Pitch this fork' : 'Pitch it'}
			</Button>
			<Button href="/trips/{data.trip.slug}" variant="ghost" size="md">Cancel</Button>
		</div>
	</form>
</main>
