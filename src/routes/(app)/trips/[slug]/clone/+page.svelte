<script lang="ts">
	import { enhance } from '$app/forms';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { titleCase } from '$lib/utils/format';

	let { data, form } = $props();

	let loading = $state(false);
	let error = $derived(form?.error ?? '');

	const itemTypes = ['lodging', 'transportation', 'activity', 'meal', 'note', 'checklist'] as const;

	const sourceStartStr = $derived(data.sourceTrip.start_date.split(/[T ]/)[0]);
	const sourceEndStr = $derived(data.sourceTrip.end_date.split(/[T ]/)[0]);
	const sourceDays = $derived.by(() => {
		const s = new Date(sourceStartStr + 'T00:00:00Z');
		const e = new Date(sourceEndStr + 'T00:00:00Z');
		return Math.round((e.getTime() - s.getTime()) / 86_400_000);
	});
</script>

<NavBar
	title="Clone Trip"
	subtitle={data.sourceTrip.title}
	back
	backHref="/trips/{data.sourceTrip.slug}/more"
/>

<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-8">
	{#if error}
		<div class="border-clay/30 bg-clay/10 text-clay mb-4 rounded-md border p-3 text-sm">
			{error}
		</div>
	{/if}

	<form
		method="POST"
		use:enhance={() => {
			loading = true;
			return async ({ result, update }) => {
				loading = false;
				await update();
			};
		}}
		class="space-y-4"
	>
		<Card>
			<div class="space-y-3 p-4">
				<div>
					<label for="title" class="text-ink-soft block text-sm font-medium">New trip title</label>
					<input
						type="text"
						id="title"
						name="title"
						required
						value="{data.sourceTrip.title} (Copy)"
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					/>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="min-w-0">
						<label for="start_date" class="text-ink-soft block text-sm font-medium">Start date</label>
						<input
							type="date"
							id="start_date"
							name="start_date"
							required
							value={sourceStartStr}
							class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-3 py-2 text-sm"
						/>
					</div>
					<div class="min-w-0">
						<label for="end_date" class="text-ink-soft block text-sm font-medium">End date</label>
						<input
							type="date"
							id="end_date"
							name="end_date"
							required
							value={sourceEndStr}
							class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-3 py-2 text-sm"
						/>
					</div>
				</div>

				<p class="text-ink-muted text-xs">
					Original trip: {sourceStartStr} to {sourceEndStr} ({sourceDays} days). Phases and day dates will be shifted to match the new date range.
				</p>
			</div>
		</Card>

		<Card>
			<div class="space-y-3 p-4">
				<div class="flex items-center gap-3">
					<input type="checkbox" id="include_phases" name="include_phases" checked class="accent-moss h-4 w-4" />
					<label for="include_phases" class="text-ink text-sm font-medium">
						Clone phases & days
						<span class="text-ink-muted font-normal">({data.phases.length} phases)</span>
					</label>
				</div>
			</div>
		</Card>

		<Card>
			<div class="space-y-3 p-4">
				<p class="text-ink-soft text-sm font-medium">Clone items by type</p>
				{#each itemTypes as type}
					{@const count = data.itemTypeCounts[type] ?? 0}
					{#if count > 0}
						<div class="flex items-center gap-3">
							<input
								type="checkbox"
								id="item_{type}"
								name="include_item_types"
								value={type}
								checked
								class="accent-moss h-4 w-4"
							/>
							<label for="item_{type}" class="text-ink text-sm">
								{titleCase(type)}
								<span class="text-ink-muted">({count})</span>
							</label>
						</div>
					{/if}
				{/each}
				{#if Object.keys(data.itemTypeCounts).length === 0}
					<p class="text-ink-muted text-sm italic">No items to clone.</p>
				{/if}
			</div>
		</Card>

		<Button type="submit" disabled={loading} variant="moss" size="lg" class="w-full">
			{loading ? 'Cloning…' : 'Clone trip'}
		</Button>
	</form>
</main>
