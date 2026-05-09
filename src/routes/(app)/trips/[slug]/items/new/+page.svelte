<script lang="ts">
	import { enhance } from '$app/forms';
	import { itemFieldConfig, itemTypeLabels, slotOptions } from '$lib/config/item-fields';
	import type { ItemType } from '$lib/types';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import SectionH from '$lib/components/ui/SectionH.svelte';
	import { titleCase } from '$lib/utils/format';
	import { untrack } from 'svelte';

	let { data, form } = $props();

	let selectedType = $state<ItemType>(untrack(() => (data.prefill?.type as ItemType) ?? 'activity'));
	let loading = $state(false);
	let error = $derived(form?.error ?? '');

	let submitAsSuggestion = $derived(data.submitAsSuggestion ?? false);
	let prefill = $derived(data.prefill ?? null);
	let suggestionId = $derived((prefill as Record<string, unknown> | null)?._suggestion_id as string ?? '');
	let prefillAuthorName = $derived((prefill as Record<string, unknown> | null)?._author_name as string ?? '');

	let buttonLabel = $derived(
		loading
			? (submitAsSuggestion ? 'Submitting…' : suggestionId ? 'Approving…' : 'Creating…')
			: (submitAsSuggestion ? 'Submit suggestion' : suggestionId ? 'Approve with edits' : 'Create item')
	);

	let fields = $derived(itemFieldConfig[selectedType]);

	let confirmationCodes = $state<{ label: string; value: string }[]>(
		untrack(() => Array.isArray(data.prefill?.confirmation_codes) ? data.prefill.confirmation_codes : [])
	);

	function addCode() {
		confirmationCodes = [...confirmationCodes, { label: '', value: '' }];
	}

	function removeCode(index: number) {
		confirmationCodes = confirmationCodes.filter((_, i) => i !== index);
	}

	function normalizeUrl(e: FocusEvent) {
		const el = e.currentTarget as HTMLInputElement;
		const v = el.value.trim();
		if (v && !/^https?:\/\//i.test(v)) {
			el.value = `https://${v}`;
		}
	}
</script>

<NavBar title="New item" subtitle={data.trip.title} back backHref="/trips/{data.trip.slug}" />

<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-8 space-y-4">
	{#if error}
		<div class="border-clay/30 bg-clay/10 text-clay rounded-md border p-3 text-sm">{error}</div>
	{/if}

	{#if submitAsSuggestion}
		<div class="border-sky/30 bg-sky/10 text-sky-700 rounded-md border p-3 text-sm">
			You're a traveler on this trip. Your item will be submitted as a suggestion for the owner to review.
		</div>
	{/if}

	{#if suggestionId && prefillAuthorName}
		<div class="border-moss/30 bg-moss-tint text-moss rounded-md border p-3 text-sm">
			Reviewing suggestion from <strong>{prefillAuthorName}</strong>. Edit as needed, then approve.
		</div>
	{/if}

	<form
		method="POST"
		use:enhance={() => {
			loading = true;
			return async ({ update }) => {
				loading = false;
				await update();
			};
		}}
		class="space-y-4"
	>
		{#if suggestionId}
			<input type="hidden" name="suggestion_id" value={suggestionId} />
		{/if}

		<Card>
			<div class="p-4 space-y-4">
				<div>
					<label for="title" class="text-ink-soft block text-sm font-medium">Title</label>
					<input
						type="text"
						id="title"
						name="title"
						required
						value={prefill?.title ?? ''}
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						placeholder="Hotel check-in, Train to Madrid, etc."
					/>
				</div>

				<fieldset>
					<legend class="text-ink-soft block text-sm font-medium">Type</legend>
					<div class="mt-1 flex flex-wrap gap-2">
						{#each Object.entries(itemTypeLabels) as [type, label]}
							{@const active = selectedType === type}
							<button
								type="button"
								aria-pressed={active}
								onclick={() => (selectedType = type as ItemType)}
								class="rounded-full px-3 py-1 text-sm font-semibold border transition-colors
									{active
									? 'bg-ink text-paper border-ink'
									: 'bg-surface text-ink-soft border-line hover:bg-surface-2'}"
							>
								{label}
							</button>
						{/each}
					</div>
					<input type="hidden" name="type" value={selectedType} />
				</fieldset>

				{#if fields.subtype && fields.subtypes.length > 0}
					<div>
						<label for="subtype" class="text-ink-soft block text-sm font-medium">Subtype</label>
						<select
							id="subtype"
							name="subtype"
							class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						>
							<option value="">None</option>
							{#each fields.subtypes as st}
								<option value={st}>{titleCase(st)}</option>
							{/each}
						</select>
					</div>
				{/if}

				<div>
					<label for="description" class="text-ink-soft block text-sm font-medium">Description</label>
					<textarea
						id="description"
						name="description"
						rows="2"
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					>{prefill?.description ?? ''}</textarea>
				</div>
			</div>
		</Card>

		<Card>
			<div class="p-4 space-y-4">
				<SectionH>When</SectionH>
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label for="day" class="text-ink-soft block text-sm font-medium">Day</label>
						<select
							id="day"
							name="day"
							class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						>
							<option value="">Unscheduled</option>
							{#each data.days as d}
								<option value={d.id} selected={d.id === data.preselectedDay}>
									{new Date(d.date.replace(' ', 'T')).toLocaleDateString('en-US', {
										weekday: 'short',
										month: 'short',
										day: 'numeric',
										timeZone: 'UTC'
									})}
								</option>
							{/each}
						</select>
					</div>
					<div>
						<label for="slot" class="text-ink-soft block text-sm font-medium">Slot</label>
						<select
							id="slot"
							name="slot"
							class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						>
							{#each slotOptions as opt}
								<option value={opt.value} selected={opt.value === data.preselectedSlot}
									>{opt.label}</option
								>
							{/each}
						</select>
					</div>
				</div>

				<div>
					<label for="phase" class="text-ink-soft block text-sm font-medium">Phase</label>
					<select
						id="phase"
						name="phase"
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					>
						<option value="">None</option>
						{#each data.phases as p}
							<option value={p.id} selected={p.id === data.preselectedPhase}>
								{p.name}
							</option>
						{/each}
					</select>
				</div>

				{#if fields.times}
					<div class="grid grid-cols-2 gap-3">
						<div class="min-w-0">
							<label for="start_time" class="text-ink-soft block text-sm font-medium">Start time</label>
							<input
								type="time"
								id="start_time"
								name="start_time"
								value={prefill?.start_time ?? ''}
								class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-3 py-2 text-sm"
							/>
						</div>
						<div class="min-w-0">
							<label for="end_time" class="text-ink-soft block text-sm font-medium">End time</label>
							<input
								type="time"
								id="end_time"
								name="end_time"
								value={prefill?.end_time ?? ''}
								class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-3 py-2 text-sm"
							/>
						</div>
					</div>
				{/if}
			</div>
		</Card>

		{#if fields.location}
			<Card>
				<div class="p-4 space-y-4">
					<SectionH>Location</SectionH>
					<div>
						<label for="location_name" class="text-ink-soft block text-sm font-medium">Name</label>
						<input
							type="text"
							id="location_name"
							name="location_name"
							value={prefill?.location_name ?? ''}
							class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
							placeholder="Hotel Barcelona"
						/>
					</div>
					<div>
						<label for="location_address" class="text-ink-soft block text-sm font-medium">Address</label>
						<input
							type="text"
							id="location_address"
							name="location_address"
							value={prefill?.location_address ?? ''}
							class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						/>
					</div>
				</div>
			</Card>
		{/if}

		{#if fields.booking}
			<Card>
				<div class="p-4 space-y-3">
					<SectionH>Booking</SectionH>
					<label class="flex items-center gap-2">
						<input type="checkbox" name="booked" checked={prefill?.booked === true} class="border-line rounded" />
						<span class="text-ink-soft text-sm">Booked</span>
					</label>
					<div>
						<label for="reservation_url" class="text-ink-soft block text-sm font-medium"
							>Reservation URL</label
						>
						<input
							type="url"
							id="reservation_url"
							name="reservation_url"
							inputmode="url"
							onblur={normalizeUrl}
							value={prefill?.reservation_url ?? ''}
							placeholder="example.com"
							class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						/>
					</div>
					<label class="flex items-center gap-2">
						<input type="checkbox" name="free_cancellation" checked={prefill?.free_cancellation === true} class="border-line rounded" />
						<span class="text-ink-soft text-sm">Free cancellation</span>
					</label>
				</div>
			</Card>
		{/if}

		{#if fields.confirmationCodes}
			<Card>
				<div class="p-4 space-y-2">
					<SectionH>
						{#snippet right()}
							<button
								type="button"
								onclick={addCode}
								class="text-ink-muted hover:text-ink-soft"
							>
								+ Add code
							</button>
						{/snippet}
						Confirmation codes
					</SectionH>
					{#each confirmationCodes as code, i}
						<div class="flex gap-2">
							<input
								type="text"
								name="confirmation_code_label"
								placeholder="Label"
								bind:value={code.label}
								class="border-line bg-surface text-ink block w-1/3 rounded-md border px-2 py-1.5 text-sm"
							/>
							<input
								type="text"
								name="confirmation_code_value"
								placeholder="Code"
								bind:value={code.value}
								class="border-line bg-surface text-ink font-mono block flex-1 rounded-md border px-2 py-1.5 text-sm"
							/>
							<button
								type="button"
								aria-label="Remove confirmation code"
								onclick={() => removeCode(i)}
								class="text-ink-muted hover:text-clay"
							>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<path d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						</div>
					{/each}
				</div>
			</Card>
		{/if}

		{#if fields.costs}
			<Card>
				<div class="p-4">
					<SectionH>Costs</SectionH>
					<div class="mt-2 grid grid-cols-2 gap-3">
						<div>
							<label for="cost_estimate_usd" class="text-ink-soft block text-sm font-medium"
								>Estimate (USD)</label
							>
							<input
								type="number"
								id="cost_estimate_usd"
								name="cost_estimate_usd"
								step="0.01"
								min="0"
								value={prefill?.cost_estimate_usd ?? ''}
								class="border-line bg-surface text-ink font-mono mt-1 block w-full rounded-md border px-3 py-2 text-sm"
							/>
						</div>
						<div>
							<label for="cost_actual_usd" class="text-ink-soft block text-sm font-medium"
								>Actual (USD)</label
							>
							<input
								type="number"
								id="cost_actual_usd"
								name="cost_actual_usd"
								step="0.01"
								min="0"
								value={prefill?.cost_actual_usd ?? ''}
								class="border-line bg-surface text-ink font-mono mt-1 block w-full rounded-md border px-3 py-2 text-sm"
							/>
						</div>
					</div>
				</div>
			</Card>
		{/if}

		{#if data.members.length > 1}
			<Card>
				<div class="p-4">
					<fieldset>
						<legend class="text-moss text-[11px] font-bold tracking-[0.2em] uppercase">Assigned to</legend>
						<div class="mt-2 space-y-1">
							{#each data.members as member}
								<label class="flex items-center gap-2">
									<input
										type="checkbox"
										name="assigned_to"
										value={member.id}
										class="border-line rounded"
									/>
									<span class="text-ink-soft text-sm">
										{member.display_name ||
											member.expand?.user?.name ||
											member.expand?.user?.email ||
											member.placeholder_name ||
											'Unknown'}
									</span>
								</label>
							{/each}
						</div>
					</fieldset>
				</div>
			</Card>
		{/if}

		<Button type="submit" disabled={loading} variant="moss" size="lg" class="w-full">
			{buttonLabel}
		</Button>
	</form>
</main>
