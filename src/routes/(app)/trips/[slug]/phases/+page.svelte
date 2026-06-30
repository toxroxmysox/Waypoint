<script lang="ts">
	import { enhance } from '$app/forms';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import SectionH from '$lib/ui/SectionH.svelte';
	import SubTabs from '$lib/ui/SubTabs.svelte';
	import { toast } from '$lib/shell/stores/toast';

	let { data, form } = $props();

	// #273 — constrain phase date pickers to the trip range and prefill a new phase to
	// the trip start (in-range) rather than today/blank. Empty = dateless trip.
	const tripStart = $derived(String(data.trip.start_date || '').split(/[T ]/)[0]);
	const tripEnd = $derived(String(data.trip.end_date || '').split(/[T ]/)[0]);

	let showCreate = $state(false);
	let loading = $state(false);
	let error = $derived(form?.error ?? '');
	let confirmDeleteId = $state<string | null>(null);
	function formatDateRange(start: string, end: string): string {
		const s = new Date(start.replace(' ', 'T'));
		const e = new Date(end.replace(' ', 'T'));
		const startStr = s.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
		const endStr = e.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		});
		return `${startStr} – ${endStr}`;
	}

	function daysNightsLabel(start: string, end: string): string {
		const s = new Date(start.substring(0, 10) + 'T00:00:00.000Z');
		const e = new Date(end.substring(0, 10) + 'T00:00:00.000Z');
		const days = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
		if (days <= 1) return '1 day';
		return `${days} days · ${days - 1} night${days - 1 === 1 ? '' : 's'}`;
	}
</script>

<NavBar title="Phases" subtitle={data.trip.title} back backHref="/trips/{data.trip.slug}" />
<SubTabs tabs={[
	{ id: 'overview', label: 'Overview', href: `/trips/${data.trip.slug}` },
	{ id: 'phases', label: 'Phases', href: `/trips/${data.trip.slug}/phases` },
	{ id: 'lists', label: 'Lists', href: `/trips/${data.trip.slug}/lists` },
	{ id: 'goals', label: 'Goals', href: `/trips/${data.trip.slug}/goals` }
]} />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8 space-y-4">
	{#if error}
		<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">{error}</div>
	{/if}

	{#if data.unratedTotal > 0 && data.launchPhaseId}
		<a
			href="/trips/{data.trip.slug}/swipe/{data.launchPhaseId}"
			class="bg-moss text-paper hover:bg-moss-soft flex items-center gap-3 rounded-lg px-4 py-3 shadow-card transition-colors"
		>
			<span aria-hidden="true" class="text-xl">♥</span>
			<span class="min-w-0 flex-1">
				<span class="block text-sm font-semibold">Swipe through {data.unratedTotal} unrated</span>
				<span class="text-paper/80 block text-xs">Rate items fast, one phase at a time</span>
			</span>
			<span aria-hidden="true" class="text-lg">›</span>
		</a>
	{/if}

	{#if data.orphans.length > 0}
		<section
			aria-label="Unsorted ideas"
			class="border-clay/30 bg-clay/10 rounded-lg border p-4 space-y-2"
		>
			<div class="flex items-center gap-2">
				<span aria-hidden="true" class="text-clay text-lg">⚠</span>
				<h2 class="text-ink text-sm font-semibold">
					{data.orphans.length} Unsorted idea{data.orphans.length === 1 ? '' : 's'}
				</h2>
			</div>
			<p class="text-ink-muted text-xs">
				These ideas have no phase, so they don't appear in any parking lot. Open each one and
				assign it a phase (or a day) to file it back.
			</p>
			<ul class="space-y-1">
				{#each data.orphans as orphan}
					<li>
						<a
							href="/trips/{data.trip.slug}/items/{orphan.id}/edit"
							class="bg-surface hover:bg-surface-2 border-line text-ink flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors"
						>
							<span class="min-w-0 truncate">{orphan.title || 'Untitled idea'}</span>
							<span class="text-ink-muted shrink-0 text-xs capitalize">{orphan.type}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<div class="flex items-center justify-between">
		<SectionH>
			{data.phases.length} Phase{data.phases.length !== 1 ? 's' : ''}
		</SectionH>
		<Button onclick={() => (showCreate = !showCreate)} variant={showCreate ? 'ghost' : 'primary'} size="sm">
			{showCreate ? 'Cancel' : 'Add phase'}
		</Button>
	</div>

	{#if showCreate}
		<Card>
			<form
				method="POST"
				action="?/create"
				use:enhance={() => {
					loading = true;
					return async ({ result, update }) => {
						loading = false;
						if (result.type === 'success') {
							showCreate = false;
							toast.show('Phase created');
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
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						placeholder="Barcelona"
					/>
				</div>

				<div>
					<label for="location" class="text-ink-soft block text-sm font-medium">Location</label>
					<input
						type="text"
						id="location"
						name="location"
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						placeholder="Barcelona, Spain"
					/>
				</div>

				<div>
					<label for="start_date" class="text-ink-soft block text-sm font-medium">Starts</label>
					<input
						type="date"
						id="start_date"
						name="start_date"
						required
						value={tripStart}
						min={tripStart || undefined}
						max={tripEnd || undefined}
						class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-3 py-2 text-sm"
					/>
					<p class="text-ink-muted mt-1 text-xs">Runs until the next phase begins (or the end of the trip).</p>
				</div>

				<div>
					<label for="country_code" class="text-ink-soft block text-sm font-medium">Country</label>
					<input
						type="text"
						id="country_code"
						name="country_code"
						maxlength="2"
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm uppercase"
						placeholder="ES"
					/>
				</div>

				<Button type="submit" disabled={loading} loading={loading} variant="moss" size="md" class="w-full">
					{loading ? 'Creating…' : 'Create phase'}
				</Button>
			</form>
		</Card>
	{/if}

	{#if data.phases.length === 0 && !showCreate}
		<Card>
			<div class="p-6 text-center">
				<p class="font-display text-ink-soft text-base italic">No phases yet.</p>
				<p class="text-ink-muted mt-1 text-sm">
					Group days by city, leg, or whatever fits.
				</p>
			</div>
		</Card>
	{/if}

	<div class="space-y-2">
		{#each data.phases as phase, i}
			<Card>
				<div class="flex items-start justify-between p-4">
					<a href="/trips/{data.trip.slug}/phases/{phase.id}" class="min-w-0 flex-1">
						<h3 class="text-ink truncate font-semibold">{phase.name}</h3>
						<p class="text-ink-muted font-mono mt-1 text-[11.5px]">
							{formatDateRange(phase.start_date, phase.end_date)}
							<span class="text-line">·</span>
							{daysNightsLabel(phase.start_date, phase.end_date)}
							{#if phase.location}
								<span class="text-line">·</span> {phase.location}
							{/if}
						</p>
					</a>

					<div class="flex shrink-0 items-center gap-1">
						{#if i > 0}
							<form method="POST" action="?/reorder" use:enhance>
								<input type="hidden" name="phase_id" value={phase.id} />
								<input type="hidden" name="direction" value="up" />
								<button
									type="submit"
									class="text-ink-muted hover:bg-surface-2 hover:text-ink-soft rounded p-1"
									title="Move up"
									aria-label="Move up"
								>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<path d="M5 15l7-7 7 7" />
									</svg>
								</button>
							</form>
						{/if}
						{#if i < data.phases.length - 1}
							<form method="POST" action="?/reorder" use:enhance>
								<input type="hidden" name="phase_id" value={phase.id} />
								<input type="hidden" name="direction" value="down" />
								<button
									type="submit"
									class="text-ink-muted hover:bg-surface-2 hover:text-ink-soft rounded p-1"
									title="Move down"
									aria-label="Move down"
								>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<path d="M19 9l-7 7-7-7" />
									</svg>
								</button>
							</form>
						{/if}

						{#if confirmDeleteId === phase.id}
							<form
								method="POST"
								action="?/delete"
								use:enhance={() => {
									return async ({ update, result }) => {
										confirmDeleteId = null;
										if (result.type === 'success') toast.show('Phase deleted');
										// #196 — surface the block-until-moved message as a toast too
										// (the form alert is above the fold; the action is below it).
										else if (result.type === 'failure' && result.data?.error)
											toast.show(String(result.data.error));
										await update();
									};
								}}
								class="flex items-center gap-1"
							>
								<input type="hidden" name="phase_id" value={phase.id} />
								<button
									type="submit"
									class="bg-clay text-paper hover:bg-clay/90 rounded px-2 py-1 text-xs font-semibold"
								>
									Delete?
								</button>
								<button
									type="button"
									onclick={() => (confirmDeleteId = null)}
									class="text-ink-muted hover:text-ink-soft rounded px-2 py-1 text-xs"
								>
									Cancel
								</button>
							</form>
						{:else}
							<button
								type="button"
								onclick={() => (confirmDeleteId = phase.id)}
								class="text-ink-muted hover:bg-clay/10 hover:text-clay rounded p-1"
								title="Delete phase"
								aria-label="Delete phase"
							>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
								</svg>
							</button>
						{/if}
					</div>
				</div>
			</Card>
		{/each}
	</div>
</main>
