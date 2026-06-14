<script lang="ts">
	import { enhance } from '$app/forms';
	import { validateForm } from '$lib/shell/actions/validate-form';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import { toast } from '$lib/shell/stores/toast';
	let { data, form } = $props();

	let loading = $state(false);
	let deleting = $state(false);
	let confirmDelete = $state(false);
	let error = $derived(form?.error ?? '');
	let success = $derived(form?.success ?? false);
	// #176 — Settings is an owner console: non-owner/co-owner sees read-only trip
	// details, no forms, no archive controls, no danger zone. (Actions still 403
	// server-side — this hides affordances the user could never submit.)
	const privileged = $derived(data.membership.role === 'owner' || data.membership.role === 'co_owner');
</script>

<NavBar title="Settings" subtitle={data.trip.title} back backHref="/trips/{data.trip.slug}" />
<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8 space-y-6">
	{#if error}
		<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">{error}</div>
	{/if}

	{#if success}
		<div class="border-moss/30 bg-moss-tint text-moss rounded-md border p-3 text-sm">Trip updated.</div>
	{/if}

	{#if privileged}
	<Card>
		<form
			method="POST"
			action="?/update"
			use:validateForm
			use:enhance={() => {
				loading = true;
				return async ({ update, result }) => {
					loading = false;
					if (result.type === 'success') toast.show('Settings saved');
					await update();
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
					value={data.trip.title}
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
						value={data.trip.start_date.split('T')[0].split(' ')[0]}
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
						value={data.trip.end_date.split('T')[0].split(' ')[0]}
						class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-3 py-2 text-sm"
					/>
				</div>
			</div>

			<div>
				<label for="timezone" class="text-ink-soft block text-sm font-medium">Timezone</label>
				<input
					type="text"
					id="timezone"
					name="timezone"
					value={data.trip.timezone}
					class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					placeholder="Europe/Madrid"
				/>
			</div>

			<div>
				<label for="location_summary" class="text-ink-soft block text-sm font-medium">Location</label>
				<input
					type="text"
					id="location_summary"
					name="location_summary"
					value={data.trip.location_summary}
					class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					placeholder="Spain"
				/>
			</div>

			<label class="flex items-center gap-3">
				<input
					type="checkbox"
					name="auto_approve_suggestions"
					checked={data.trip.auto_approve_suggestions}
					class="border-line h-4 w-4 rounded"
				/>
				<div>
					<span class="text-ink block text-sm font-medium">Auto-approve traveler suggestions</span>
					<span class="text-ink-muted block text-xs">When on, traveler suggestions are added immediately without owner review.</span>
				</div>
			</label>

			<Button type="submit" disabled={loading} loading={loading} variant="moss" size="md" class="w-full">
				{loading ? 'Saving…' : 'Save changes'}
			</Button>
		</form>
	</Card>

	<Card>
		<div class="p-4 space-y-3">
			<h2 class="text-ink text-sm font-semibold">Public Archive</h2>
			<p class="text-ink-muted text-xs">
				When enabled, a public read-only link is generated after the trip is archived.
			</p>

			{#if form?.archiveError}
				<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">{form.archiveError}</div>
			{/if}
			{#if form?.archiveSuccess}
				<div class="border-moss/30 bg-moss-tint text-moss rounded-md border p-3 text-sm">Archive settings saved.</div>
			{/if}

			<form
				method="POST"
				action="?/toggleArchive"
				use:enhance
				class="space-y-3"
			>
				<label class="flex items-center gap-3">
					<input
						type="checkbox"
						name="archive_enabled"
						checked={data.trip.archive_enabled}
						class="border-line h-4 w-4 rounded"
					/>
					<span class="text-ink text-sm font-medium">Enable public archive</span>
				</label>

				<div>
					<label for="archive_publish_after_days" class="text-ink-soft block text-sm font-medium">
						Publish delay (days after archiving)
					</label>
					<input
						type="number"
						id="archive_publish_after_days"
						name="archive_publish_after_days"
						min="0"
						max="365"
						value={data.trip.archive_publish_after_days ?? 7}
						class="border-line bg-surface text-ink mt-1 block w-24 rounded-md border px-3 py-2 text-sm"
					/>
				</div>

				{#if data.trip.public_share_token}
					<div>
						<p class="text-ink-soft text-sm font-medium">Share URL</p>
						<div class="bg-surface-2 mt-1 rounded-md px-3 py-2">
							<code class="text-ink text-xs break-all">/archive/{data.trip.public_share_token}</code>
						</div>
					</div>
				{/if}

				<Button type="submit" variant="ghost" size="sm">Save archive settings</Button>
			</form>
		</div>
	</Card>

	<div class="border-clay/30 rounded-lg border p-4">
		<h2 class="text-clay text-sm font-semibold">Danger zone</h2>
		<p class="text-clay/80 mt-1 text-xs">
			Deleting a trip removes all phases, days, and items permanently.
		</p>
		{#if !confirmDelete}
			<button
				type="button"
				onclick={() => (confirmDelete = true)}
				class="border-clay/40 text-clay hover:bg-clay/10 mt-3 rounded-md border px-3 py-1.5 text-sm font-semibold"
			>
				Delete trip
			</button>
		{:else}
			<form
				method="POST"
				action="?/delete"
				use:enhance={() => {
					deleting = true;
					return async ({ update }) => {
						deleting = false;
						await update();
					};
				}}
				class="mt-3 flex items-center gap-2"
			>
				<button
					type="submit"
					disabled={deleting}
					class="bg-clay text-paper hover:bg-clay/90 rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
				>
					{deleting ? 'Deleting…' : 'Confirm delete'}
				</button>
				<button
					type="button"
					onclick={() => (confirmDelete = false)}
					class="text-ink-muted hover:text-ink-soft text-sm"
				>
					Cancel
				</button>
			</form>
		{/if}
	</div>
	{:else}
	<Card>
		<div class="p-4 space-y-3">
			<p class="text-ink-muted text-xs">Only an owner or co-owner can change trip settings.</p>
			<dl class="space-y-2 text-sm">
				<div><dt class="text-ink-muted text-xs">Trip name</dt><dd class="text-ink">{data.trip.title}</dd></div>
				<div><dt class="text-ink-muted text-xs">Dates</dt><dd class="text-ink">{data.trip.start_date.split('T')[0].split(' ')[0]} – {data.trip.end_date.split('T')[0].split(' ')[0]}</dd></div>
				<div><dt class="text-ink-muted text-xs">Timezone</dt><dd class="text-ink">{data.trip.timezone || 'UTC'}</dd></div>
				<div><dt class="text-ink-muted text-xs">Location</dt><dd class="text-ink">{data.trip.location_summary || '—'}</dd></div>
			</dl>
		</div>
	</Card>
	{/if}
</main>
