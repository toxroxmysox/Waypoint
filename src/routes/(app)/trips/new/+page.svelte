<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { validateForm } from '$lib/shell/actions/validate-form';
	import { goto } from '$app/navigation';
	import { markReplaceNavigation } from '$lib/shell/stores/nav-depth';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';

	let { form } = $props();

	let title = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let timezone = $state('');
	let loading = $state(false);
	let error = $derived(form?.error ?? '');

	onMount(() => {
		timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});

	let duration = $derived(
		startDate && endDate
			? Math.max(
					Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1,
					0
				)
			: null
	);
</script>

<NavBar title="New trip" back backHref="/trips" />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8">
	{#if error}
		<div role="alert" class="border-error/30 bg-error/10 text-error-deep mb-4 rounded-md border p-3 text-sm">{error}</div>
	{/if}

	<Card>
		<form
			method="POST"
			use:validateForm
			use:enhance={() => {
				loading = true;
				return async ({ update, result }) => {
					loading = false;
					if (result.type === 'redirect') {
						// replaceState so back from the new trip skips the creation
						// form and returns to the trips list (#214 / ADR-0012).
						// #235: don't let the depth counter count this replace.
						markReplaceNavigation();
						await goto(result.location, { replaceState: true });
					} else {
						await update();
					}
				};
			}}
			class="p-4 space-y-4"
		>
			<div>
				<label for="title" class="text-ink-soft block text-sm font-medium">Trip name</label>
				<input
					type="text"
					id="title"
					name="title"
					required
					bind:value={title}
					class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					placeholder="Spain 2026"
				/>
			</div>

			<div>
				<div class="flex items-end gap-3">
					<div class="min-w-0 flex-1">
						<label for="start_date" class="text-ink-soft block text-sm font-medium">Start date</label>
						<input
							type="date"
							id="start_date"
							name="start_date"
							required
							bind:value={startDate}
							max={endDate || undefined}
							class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-3 py-2 text-sm"
						/>
					</div>
					<div class="text-ink-muted font-mono pb-2 text-xs">
						{#if duration}
							{duration} {duration === 1 ? 'day' : 'days'}
						{:else}
							→
						{/if}
					</div>
					<div class="min-w-0 flex-1">
						<label for="end_date" class="text-ink-soft block text-sm font-medium">End date</label>
						<input
							type="date"
							id="end_date"
							name="end_date"
							required
							bind:value={endDate}
							min={startDate || undefined}
							class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-3 py-2 text-sm"
						/>
					</div>
				</div>
			</div>

			<div>
				<label for="timezone" class="text-ink-soft block text-sm font-medium">Timezone</label>
				<input
					type="text"
					id="timezone"
					name="timezone"
					list="timezone-list"
					bind:value={timezone}
					class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					placeholder="America/Chicago"
				/>
				<datalist id="timezone-list">
					<option value="America/New_York"></option>
					<option value="America/Chicago"></option>
					<option value="America/Denver"></option>
					<option value="America/Los_Angeles"></option>
					<option value="America/Phoenix"></option>
					<option value="America/Anchorage"></option>
					<option value="Pacific/Honolulu"></option>
					<option value="Europe/London"></option>
					<option value="Europe/Paris"></option>
					<option value="Europe/Berlin"></option>
					<option value="Europe/Madrid"></option>
					<option value="Europe/Rome"></option>
					<option value="Europe/Amsterdam"></option>
					<option value="Europe/Zurich"></option>
					<option value="Europe/Athens"></option>
					<option value="Europe/Istanbul"></option>
					<option value="Asia/Dubai"></option>
					<option value="Asia/Kolkata"></option>
					<option value="Asia/Bangkok"></option>
					<option value="Asia/Singapore"></option>
					<option value="Asia/Shanghai"></option>
					<option value="Asia/Tokyo"></option>
					<option value="Asia/Seoul"></option>
					<option value="Australia/Sydney"></option>
					<option value="Pacific/Auckland"></option>
				</datalist>
				<p class="text-ink-muted mt-1 text-xs">Leave blank to use your local timezone.</p>
			</div>

			<div>
				<label for="location_summary" class="text-ink-soft block text-sm font-medium">
					Location <span class="text-ink-muted font-normal">(optional)</span>
				</label>
				<input
					type="text"
					id="location_summary"
					name="location_summary"
					class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					placeholder="Spain & Portugal"
				/>
				<p class="text-ink-muted mt-1 text-xs">
					Freeform — city, country, region, whatever fits.
				</p>
			</div>

			<Button type="submit" disabled={loading} loading={loading} variant="moss" size="lg" class="w-full">
				{loading ? 'Creating…' : 'Create trip'}
			</Button>
		</form>
	</Card>
</main>
