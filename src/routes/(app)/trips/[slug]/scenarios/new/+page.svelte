<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PhaseSketchSegment } from '$lib/ideation/types';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import SketchEditor from '$lib/ideation/components/SketchEditor.svelte';
	import { untrack } from 'svelte';

	let { data, form } = $props();

	const f = untrack(() => data.fork);
	// Prefer a failed submit's values, else the fork pre-fill, else blank. Reading
	// `form` here only captures its initial value on purpose (the pre-fill) — wrap in
	// untrack so Svelte doesn't warn about a locally-referenced prop in $state init.
	const v = untrack(
		() =>
			(form && 'values' in form ? form.values : undefined) as
				| { title: string; pitch: string; date_start: string; date_end: string; budget_per_person: string }
				| undefined
	);
	let title = $state(v?.title ?? f?.title ?? '');
	let pitch = $state(v?.pitch ?? f?.pitch ?? '');
	let dateStart = $state(v?.date_start ?? f?.dateStart ?? '');
	let dateEnd = $state(v?.date_end ?? f?.dateEnd ?? '');
	let budget = $state(v?.budget_per_person ?? (f?.budgetPerPerson ? String(f.budgetPerPerson) : ''));
	let sketch = $state<PhaseSketchSegment[]>(f?.sketch ? [...f.sketch] : []);
	let selectedKeystones = $state<Set<string>>(new Set(f?.keystones ?? []));
	let newKeystones = $state('');
	let submitting = $state(false);

	function toggleKeystone(id: string) {
		const next = new Set(selectedKeystones);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedKeystones = next;
	}
</script>

<NavBar title={f ? 'Fork this scenario' : 'New scenario'} back backHref="/trips/{data.trip.slug}" />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-10">
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
			<p class="text-moss mb-3 font-mono text-[11px]">⑂ forking “{f.title}” — tweak anything.</p>
		{/if}

		{#if form?.error}
			<p role="alert" class="text-error-deep mb-3 text-sm">{form.error}</p>
		{/if}

		<!-- Title first — the only required field. -->
		<Card>
			<div class="p-4">
				<label for="sc-title" class="text-ink-soft block text-xs font-semibold">The pitch</label>
				<input
					id="sc-title"
					name="title"
					bind:value={title}
					required
					maxlength="120"
					placeholder="e.g. Thailand, north → islands"
					data-testid="sc-title"
					class="border-line bg-surface text-ink font-display mt-1 block w-full rounded-md border px-3 py-2 text-base"
				/>
				<label for="sc-pitch" class="text-ink-soft mt-3 block text-xs font-semibold">One-liner (optional)</label>
				<input
					id="sc-pitch"
					name="pitch"
					bind:value={pitch}
					maxlength="200"
					placeholder="What's the idea in a sentence?"
					class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
				/>
			</div>
		</Card>

		<!-- Everything below is optional — the group fleshes it out over time. -->
		<p class="text-ink-muted mt-4 mb-1.5 px-0.5 text-[9.5px] font-bold tracking-[0.12em] uppercase">
			Optional — fill in what you know
		</p>

		<Card>
			<div class="space-y-4 p-4">
				<div>
					<p class="text-ink-soft text-xs font-semibold">When</p>
					<div class="mt-1 flex items-end gap-3">
						<div class="min-w-0 flex-1">
							<label for="sc-start" class="text-ink-muted block text-[11px]">Start</label>
							<input type="date" id="sc-start" name="date_start" bind:value={dateStart} class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-2.5 py-1.5 text-sm" />
						</div>
						<div class="min-w-0 flex-1">
							<label for="sc-end" class="text-ink-muted block text-[11px]">End</label>
							<input type="date" id="sc-end" name="date_end" bind:value={dateEnd} class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-2.5 py-1.5 text-sm" />
						</div>
					</div>
					<p class="text-ink-muted mt-1 text-[11px]">Both dates are needed to win the vote — but you can pitch without them.</p>
				</div>

				<div>
					<label for="sc-budget" class="text-ink-soft text-xs font-semibold">Budget per person</label>
					<div class="mt-1 flex items-center gap-1.5">
						<span class="text-ink-muted text-sm">~$</span>
						<input id="sc-budget" name="budget_per_person" bind:value={budget} inputmode="numeric" placeholder="rough, USD" class="border-line bg-surface text-ink w-32 rounded-md border px-2.5 py-1.5 text-sm" />
					</div>
				</div>

				<div>
					<p class="text-ink-soft text-xs font-semibold">The shape of it</p>
					<p class="text-ink-muted mt-0.5 mb-2 text-[11px]">Sketch the legs — a name and how many nights.</p>
					<SketchEditor bind:segments={sketch} {dateStart} {dateEnd} />
				</div>
			</div>
		</Card>

		<!-- Keystones — anchor ideas. Pick from existing, or quick-create new ones. -->
		<Card>
			<div class="p-4">
				<p class="text-ink-soft text-xs font-semibold">Anchor ideas</p>
				<p class="text-ink-muted mt-0.5 text-[11px]">The must-dos that make this pitch worth it.</p>
				{#if data.ideas.length > 0}
					<div class="mt-2 flex flex-wrap gap-1.5" data-testid="keystone-picker">
						{#each data.ideas as idea (idea.id)}
							{@const on = selectedKeystones.has(idea.id)}
							<button
								type="button"
								onclick={() => toggleKeystone(idea.id)}
								aria-pressed={on}
								class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors
									{on ? 'bg-moss text-paper border-moss' : 'border-line text-ink-soft hover:border-moss/40'}"
							>
								<TypeIcon type={idea.type} size={13} />
								{idea.title}
							</button>
						{/each}
					</div>
				{/if}
				{#each [...selectedKeystones] as id (id)}
					<input type="hidden" name="keystone" value={id} />
				{/each}
				<label for="sc-newk" class="text-ink-muted mt-3 block text-[11px]">Add new anchors (one per line)</label>
				<textarea
					id="sc-newk"
					name="new_keystones"
					bind:value={newKeystones}
					rows="2"
					placeholder="Doi Suthep sunrise&#10;Street-food crawl"
					class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-2.5 py-1.5 text-sm"
				></textarea>
			</div>
		</Card>

		<div class="mt-4 flex gap-2">
			<Button type="submit" variant="moss" size="md" class="flex-1" disabled={submitting || !title.trim()} loading={submitting}>
				{submitting ? 'Pitching…' : f ? 'Pitch this fork' : 'Pitch it'}
			</Button>
			<Button href="/trips/{data.trip.slug}" variant="ghost" size="md">Cancel</Button>
		</div>
	</form>
</main>
