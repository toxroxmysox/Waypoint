<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import PublishControl from '$lib/portability/components/PublishControl.svelte';
	import type { PublishStatus } from '$lib/portability/archive-visibility';

	// Share affordance on the closed Record view (#242). Sharing is the RESULT of closing
	// out, surfaced where the group looks — not a buried Settings toggle. It shows:
	//  - a copyable ABSOLUTE archive URL with a copy affordance (members can paste a
	//    working link into a group text),
	//  - a plain-language status line driven by publishStatus ("live now" / "publishes
	//    on [date]" / private),
	//  - owner/co_owner controls to publish / change the date / disable sharing, and the
	//    low-emphasis Reopen control (closed isn't a trap).
	// The parent gates `canManage`; the server actions re-enforce owner/co_owner.

	let {
		url = '',
		status,
		publishDate = '',
		showBudget = false,
		today = '',
		canManage = false
	}: {
		url?: string;
		status: PublishStatus;
		archiveEnabled?: boolean;
		publishDate?: string;
		showBudget?: boolean;
		/** Trip-LOCAL today (YYYY-MM-DD) for the publish-date default (#301). */
		today?: string;
		canManage?: boolean;
	} = $props();

	let copied = $state(false);
	async function copyLink() {
		if (!url) return;
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			copied = false;
		}
	}

	// Owner editor state. Seed from the current status so re-editing a scheduled record
	// pre-fills its date; "live" and "unpublished" start the editor at Publish-today /
	// Keep-private respectively.
	let editing = $state(false);
	let publish = $state(untrack(() => status.status === 'live' || status.status === 'scheduled'));
	let editDate = $state(untrack(() => publishDate));
	let editBudget = $state(untrack(() => showBudget));
	let confirmReopen = $state(false);

	const statusLine = $derived.by(() => {
		if (status.status === 'live')
			return { text: 'Live now — anyone with the link can view it.', tone: 'live' };
		if (status.status === 'scheduled') {
			const d = new Date(`${status.date}T00:00:00`).toLocaleDateString('en-US', {
				month: 'long',
				day: 'numeric',
				year: 'numeric'
			});
			return { text: `Publishes on ${d}.`, tone: 'scheduled' };
		}
		return { text: 'Private — only trip members can see this record.', tone: 'private' };
	});

	const isPublic = $derived(status.status === 'live' || status.status === 'scheduled');
</script>

<section
	class="overflow-hidden rounded-lg border border-line bg-surface shadow-card"
	aria-label="Share this trip's record"
>
	<div class="border-b border-line px-4 py-3">
		<p class="text-[9.5px] font-bold tracking-[0.14em] text-ink-muted uppercase">Share</p>
		<p class="mt-1 flex items-center gap-2 text-sm font-semibold text-ink">
			<span
				class="inline-block size-2 shrink-0 rounded-full {statusLine.tone === 'live'
					? 'bg-moss'
					: statusLine.tone === 'scheduled'
						? 'bg-gold'
						: 'bg-ink-muted'}"
				aria-hidden="true"
			></span>
			{statusLine.text}
		</p>
	</div>

	{#if isPublic && url}
		<!-- Copyable ABSOLUTE link. data-testid for the e2e critical path. -->
		<div class="flex items-center gap-2 px-4 py-3">
			<code
				class="min-w-0 flex-1 truncate rounded-md bg-surface-2 px-2.5 py-2 text-xs text-ink-soft"
				data-testid="share-url">{url}</code
			>
			<button
				type="button"
				onclick={copyLink}
				data-testid="share-copy"
				class="shrink-0 rounded-md bg-ink px-3 py-2 text-xs font-semibold text-paper"
			>
				{copied ? 'Copied!' : 'Copy link'}
			</button>
		</div>
	{/if}

	{#if canManage}
		<div class="border-t border-line px-4 py-3">
			{#if !editing}
				<div class="flex flex-wrap items-center gap-2">
					<button
						type="button"
						onclick={() => (editing = true)}
						data-testid="share-manage"
						class="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-2 active:bg-surface-2"
					>
						{isPublic ? 'Change sharing' : 'Publish record'}
					</button>
					{#if isPublic}
						<form
							method="POST"
							action="?/publishRecord"
							use:enhance={() =>
								async ({ update }) =>
									update({ reset: false })}
						>
							<input type="hidden" name="disable" value="on" />
							<button
								type="submit"
								class="px-2 py-1.5 text-xs font-medium text-ink-muted hover:text-ink active:text-ink"
							>
								Disable sharing
							</button>
						</form>
					{/if}
				</div>
			{:else}
				<form
					method="POST"
					action="?/publishRecord"
					use:enhance={() =>
						async ({ update }) => {
							editing = false;
							await update({ reset: false });
						}}
				>
					<PublishControl
						bind:publish
						bind:publishDate={editDate}
						bind:showBudget={editBudget}
						showBudgetToggle={true}
						{today}
					/>
					<div class="mt-3 flex items-center gap-2">
						<button
							type="submit"
							class="rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-paper">Save</button
						>
						<button
							type="button"
							onclick={() => (editing = false)}
							class="px-2 py-1.5 text-xs text-ink-muted">Cancel</button
						>
					</div>
				</form>
			{/if}
		</div>

		<!-- Reopen — low-emphasis; closed isn't a trap. Behind a confirm. Clears the
		     publish date server-side so a reopened trip isn't left publicly exposed. -->
		<div class="border-t border-line px-4 py-3">
			{#if !confirmReopen}
				<button
					type="button"
					onclick={() => (confirmReopen = true)}
					data-testid="reopen-trip"
					class="text-xs font-medium text-ink-muted hover:text-ink active:text-ink"
				>
					Reopen this trip
				</button>
			{:else}
				<div class="space-y-2">
					<p class="text-xs text-ink-soft">
						Reopening returns the trip to its editable state and <strong
							>pauses public sharing</strong
						>
						until you close out again. Continue?
					</p>
					<form method="POST" action="?/reopenTrip" use:enhance class="flex items-center gap-2">
						<button
							type="submit"
							class="rounded-md bg-clay px-3 py-1.5 text-xs font-semibold text-paper"
							>Reopen trip</button
						>
						<button
							type="button"
							onclick={() => (confirmReopen = false)}
							class="px-2 py-1.5 text-xs text-ink-muted">Cancel</button
						>
					</form>
				</div>
			{/if}
		</div>
	{/if}
</section>
