<script lang="ts">
	import { enhance } from '$app/forms';
	import { validateForm } from '$lib/shell/actions/validate-form';
	import ServerErrorAlert from '$lib/ui/ServerErrorAlert.svelte';
	import { goto } from '$app/navigation';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import { titleCase } from '$lib/shell/format';
	import { CLONEABLE_ITEM_TYPES } from '$lib/itinerary/clone-items';

	let { data, form } = $props();

	let loading = $state(false);

	// Single source of truth for cloneable types — includes `flight` (#173;
	// flights were silently dropped because this list omitted the type).
	const itemTypes = CLONEABLE_ITEM_TYPES;

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

<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-8 md-desktop:max-w-2xl">
	<ServerErrorAlert {form} class="mb-4" />

	<form
		method="POST"
		use:validateForm
		use:enhance={() => {
			loading = true;
			return async ({ result, update }) => {
				loading = false;
				if (result.type === 'redirect') {
					// replaceState so back from the cloned trip skips the clone
					// form and returns to the source trip (#214 / ADR-0012).
					await goto(result.location, { replaceState: true });
				} else {
					await update();
				}
			};
		}}
		class="space-y-4"
	>
		<Card>
			<div class="space-y-3 p-4">
				<div>
					<label for="title" class="block text-sm font-medium text-ink-soft">New trip title</label>
					<input
						type="text"
						id="title"
						name="title"
						required
						value="{data.sourceTrip.title} (Copy)"
						class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
					/>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="min-w-0">
						<label for="start_date" class="block text-sm font-medium text-ink-soft"
							>Start date</label
						>
						<input
							type="date"
							id="start_date"
							name="start_date"
							required
							value={sourceStartStr}
							class="mt-1 block w-full min-w-0 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
						/>
					</div>
					<div class="min-w-0">
						<label for="end_date" class="block text-sm font-medium text-ink-soft">End date</label>
						<input
							type="date"
							id="end_date"
							name="end_date"
							required
							value={sourceEndStr}
							class="mt-1 block w-full min-w-0 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
						/>
					</div>
				</div>

				<p class="text-xs text-ink-muted">
					Original trip: {sourceStartStr} to {sourceEndStr} ({sourceDays} days). Phases and day dates
					will be shifted to match the new date range.
				</p>
			</div>
		</Card>

		<Card>
			<div class="space-y-3 p-4">
				<div class="flex items-center gap-3">
					<input
						type="checkbox"
						id="include_phases"
						name="include_phases"
						checked
						class="h-4 w-4 accent-moss"
					/>
					<label for="include_phases" class="text-sm font-medium text-ink">
						Clone phases & days
						<span class="font-normal text-ink-muted">({data.phases.length} phases)</span>
					</label>
				</div>
			</div>
		</Card>

		<Card>
			<div class="space-y-3 p-4">
				<p class="text-sm font-medium text-ink-soft">Clone items by type</p>
				{#each itemTypes as type (type)}
					{@const count = data.itemTypeCounts[type] ?? 0}
					{#if count > 0}
						<div class="flex items-center gap-3">
							<input
								type="checkbox"
								id="item_{type}"
								name="include_item_types"
								value={type}
								checked
								class="h-4 w-4 accent-moss"
							/>
							<label for="item_{type}" class="text-sm text-ink">
								{titleCase(type)}
								<span class="text-ink-muted">({count})</span>
							</label>
						</div>
					{/if}
				{/each}
				{#if Object.keys(data.itemTypeCounts).length === 0}
					<p class="text-sm text-ink-muted italic">No items to clone.</p>
				{/if}
			</div>
		</Card>

		<Button type="submit" disabled={loading} {loading} variant="moss" size="lg" class="w-full">
			{loading ? 'Cloning…' : 'Clone trip'}
		</Button>
	</form>
</main>
