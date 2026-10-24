<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { validateForm } from '$lib/shell/actions/validate-form';
	import ServerErrorAlert from '$lib/ui/ServerErrorAlert.svelte';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import { toast } from '$lib/shell/stores/toast';
	let { data, form } = $props();

	let loading = $state(false);
	let deleting = $state(false);
	let savingDigest = $state(false);
	// #272 — client-owned so Svelte can't clobber the user's toggle on a flush:
	// an UNBOUND `checked={expr}` input is re-synced to the expression on any
	// template-effect re-run, silently reverting the tap before submit (same
	// class as the money-units checkbox race — cerebrum 2026-07-02).
	let digestOn = $state(untrack(() => !data.membership.digest_opt_out));
	let confirmDelete = $state(false);
	// #503 — client-owned for the same #272 reason. Changes needs read: with read
	// off the changes box is disabled (not submitted) and the server keeps ai_write.
	let aiRead = $state(untrack(() => data.trip.ai_access !== false));
	let aiWrite = $state(untrack(() => data.trip.ai_write !== false));

	let success = $derived(form?.success ?? false);
	// #176 — Settings is an owner console: non-owner/co-owner sees read-only trip
	// details, no forms, no archive controls, no danger zone. (Actions still 403
	// server-side — this hides affordances the user could never submit.)
	const privileged = $derived(
		data.membership.role === 'owner' || data.membership.role === 'co_owner'
	);
</script>

<NavBar title="Settings" subtitle={data.trip.title} back backHref="/trips/{data.trip.slug}" />
<main class="mx-auto w-full max-w-lg flex-1 space-y-6 px-4 pt-4 pb-8 md-desktop:max-w-2xl">
	<ServerErrorAlert {form} />

	{#if success}
		<div class="rounded-md border border-moss/30 bg-moss-tint p-3 text-sm text-moss">
			Trip updated.
		</div>
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
				class="space-y-4 p-4"
			>
				<div>
					<label for="title" class="block text-sm font-medium text-ink-soft">Trip name</label>
					<input
						type="text"
						id="title"
						name="title"
						required
						value={data.trip.title}
						class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
					/>
				</div>

				<!-- #270: a forming (dateless) trip may stay dateless — required only once
			     dated (dates can move, never be removed; the action + hook enforce). -->
				<div class="grid grid-cols-2 gap-3">
					<div class="min-w-0">
						<label for="start_date" class="block text-sm font-medium text-ink-soft"
							>Start date</label
						>
						<input
							type="date"
							id="start_date"
							name="start_date"
							required={!!data.trip.start_date}
							value={data.trip.start_date.split('T')[0].split(' ')[0]}
							class="mt-1 block w-full min-w-0 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
						/>
					</div>
					<div class="min-w-0">
						<label for="end_date" class="block text-sm font-medium text-ink-soft">End date</label>
						<input
							type="date"
							id="end_date"
							name="end_date"
							required={!!data.trip.start_date}
							value={data.trip.end_date.split('T')[0].split(' ')[0]}
							class="mt-1 block w-full min-w-0 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
						/>
					</div>
				</div>

				<div>
					<label for="timezone" class="block text-sm font-medium text-ink-soft">Timezone</label>
					<input
						type="text"
						id="timezone"
						name="timezone"
						value={data.trip.timezone}
						class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
						placeholder="Europe/Madrid"
					/>
				</div>

				<div>
					<label for="location_summary" class="block text-sm font-medium text-ink-soft"
						>Location</label
					>
					<input
						type="text"
						id="location_summary"
						name="location_summary"
						value={data.trip.location_summary}
						class="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
						placeholder="Spain"
					/>
				</div>

				<label class="flex items-center gap-3">
					<input
						type="checkbox"
						name="auto_approve_suggestions"
						checked={data.trip.auto_approve_suggestions}
						class="h-4 w-4 rounded border-line"
					/>
					<div>
						<span class="block text-sm font-medium text-ink">Auto-approve traveler suggestions</span
						>
						<span class="block text-xs text-ink-muted"
							>When on, traveler suggestions are added immediately without owner review.</span
						>
					</div>
				</label>

				<label class="flex items-center gap-3">
					<input
						type="checkbox"
						name="ai_access"
						bind:checked={aiRead}
						class="h-4 w-4 rounded border-line"
					/>
					<div>
						<span class="block text-sm font-medium text-ink">AI can read this trip</span>
						<span class="block text-xs text-ink-muted"
							>Lets members' connected AI assistants (like Claude) read this trip. Turning it off
							hides everything but the trip's name and dates.</span
						>
					</div>
				</label>

				<label class="flex items-center gap-3" class:opacity-50={!aiRead}>
					<input
						type="checkbox"
						name="ai_write"
						bind:checked={aiWrite}
						disabled={!aiRead}
						class="h-4 w-4 rounded border-line"
					/>
					<div>
						<span class="block text-sm font-medium text-ink">AI can make changes</span>
						<span class="block text-xs text-ink-muted"
							>Lets a member's AI make the changes they could make themselves, after they confirm.
							Needs reading on.</span
						>
					</div>
				</label>

				<Button type="submit" disabled={loading} {loading} variant="moss" size="md" class="w-full">
					{loading ? 'Saving…' : 'Save changes'}
				</Button>
			</form>
		</Card>

		<Card>
			<div class="space-y-3 p-4">
				<h2 class="text-sm font-semibold text-ink">Public Archive</h2>
				<p class="text-xs text-ink-muted">
					When enabled, a public read-only link is generated after the trip is archived.
				</p>

				{#if form?.archiveError}
					<div
						role="alert"
						class="rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error-deep"
					>
						{form.archiveError}
					</div>
				{/if}
				{#if form?.archiveSuccess}
					<div class="rounded-md border border-moss/30 bg-moss-tint p-3 text-sm text-moss">
						Archive settings saved.
					</div>
				{/if}

				<form method="POST" action="?/toggleArchive" use:enhance class="space-y-3">
					<label class="flex items-center gap-3">
						<input
							type="checkbox"
							name="archive_enabled"
							checked={data.trip.archive_enabled}
							class="h-4 w-4 rounded border-line"
						/>
						<span class="text-sm font-medium text-ink">Enable public archive</span>
					</label>

					<div>
						<label for="archive_publish_after_days" class="block text-sm font-medium text-ink-soft">
							Publish delay (days after archiving)
						</label>
						<input
							type="number"
							inputmode="numeric"
							id="archive_publish_after_days"
							name="archive_publish_after_days"
							min="0"
							max="365"
							value={data.trip.archive_publish_after_days ?? 7}
							class="mt-1 block w-24 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
						/>
					</div>

					{#if data.trip.public_share_token}
						<div>
							<p class="text-sm font-medium text-ink-soft">Share URL</p>
							<div class="mt-1 rounded-md bg-surface-2 px-3 py-2">
								<code class="text-xs break-all text-ink"
									>/archive/{data.trip.public_share_token}</code
								>
							</div>
						</div>
					{/if}

					<Button type="submit" variant="ghost" size="sm">Save archive settings</Button>
				</form>
			</div>
		</Card>
	{:else}
		<Card>
			<div class="space-y-3 p-4">
				<p class="text-xs text-ink-muted">Only an owner or co-owner can change trip settings.</p>
				<dl class="space-y-2 text-sm">
					<div>
						<dt class="text-xs text-ink-muted">Trip name</dt>
						<dd class="text-ink">{data.trip.title}</dd>
					</div>
					<div>
						<dt class="text-xs text-ink-muted">Dates</dt>
						<dd class="text-ink">
							{data.trip.start_date.split('T')[0].split(' ')[0]} – {data.trip.end_date
								.split('T')[0]
								.split(' ')[0]}
						</dd>
					</div>
					<div>
						<dt class="text-xs text-ink-muted">Timezone</dt>
						<dd class="text-ink">{data.trip.timezone || 'UTC'}</dd>
					</div>
					<div>
						<dt class="text-xs text-ink-muted">Location</dt>
						<dd class="text-ink">{data.trip.location_summary || '—'}</dd>
					</div>
				</dl>
			</div>
		</Card>
	{/if}

	<!-- #272 — per-member digest preference: visible to every active member
	     (incl. viewers), unlike the owner-only cards above. -->
	<Card>
		<div class="space-y-3 p-4">
			<h2 class="text-sm font-semibold text-ink">Email digest</h2>
			<p class="text-xs text-ink-muted">
				A morning email with what changed on this trip — only on days something changed.
			</p>

			{#if form?.digestError}
				<div
					role="alert"
					class="rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error-deep"
				>
					{form.digestError}
				</div>
			{/if}
			{#if form?.digestSuccess}
				<div class="rounded-md border border-moss/30 bg-moss-tint p-3 text-sm text-moss">
					Digest emails {form.digestOn ? 'on' : 'off'} for this trip.
				</div>
			{/if}

			<form
				method="POST"
				action="?/digest"
				use:enhance={() => {
					savingDigest = true;
					return async ({ update, result }) => {
						savingDigest = false;
						if (result.type === 'success') toast.show('Digest preference saved');
						await update({ reset: false });
					};
				}}
				class="space-y-3"
			>
				<label class="flex items-center gap-3">
					<input
						type="checkbox"
						name="digest_emails"
						bind:checked={digestOn}
						class="h-4 w-4 rounded border-line"
					/>
					<span class="text-sm font-medium text-ink">Send me digest emails for this trip</span>
				</label>

				<Button type="submit" disabled={savingDigest} variant="ghost" size="sm">
					{savingDigest ? 'Saving…' : 'Save digest preference'}
				</Button>
			</form>
		</div>
	</Card>

	{#if privileged}
		<div class="rounded-lg border border-error/30 p-4">
			<h2 class="text-sm font-semibold text-error">Danger zone</h2>
			<p class="mt-1 text-xs text-error/80">
				Deleting a trip removes all phases, days, and items permanently.
			</p>
			{#if !confirmDelete}
				<button
					type="button"
					onclick={() => (confirmDelete = true)}
					class="hit-44 mt-3 rounded-md border border-error/40 px-3 py-1.5 text-sm font-semibold text-error hover:bg-error/10 active:bg-error/10"
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
						class="hit-44 rounded-md bg-error px-3 py-1.5 text-sm font-semibold text-paper hover:bg-error/90 active:bg-error/90 disabled:opacity-40"
					>
						{deleting ? 'Deleting…' : 'Confirm delete'}
					</button>
					<button
						type="button"
						onclick={() => (confirmDelete = false)}
						class="hit-44 text-sm text-ink-muted hover:text-ink-soft active:text-ink-soft"
					>
						Cancel
					</button>
				</form>
			{/if}
		</div>
	{/if}
</main>
