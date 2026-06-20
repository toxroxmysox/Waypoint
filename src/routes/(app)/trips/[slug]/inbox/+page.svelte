<script lang="ts">
	import { enhance } from '$app/forms';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import type { Suggestion } from '$lib/types';
	import { titleCase } from '$lib/shell/format';
	import { toast } from '$lib/shell/stores/toast';

	let { data, form } = $props();

	let rejecting = $state<string | null>(null);
	let approving = $state<string | null>(null);
	// #250 — reject demands a one-line note. Track which card's note field is open
	// and its text, keyed by suggestion id.
	let rejectOpenId = $state<string | null>(null);
	let rejectNote = $state('');

	const rejectForm = $derived((form?.reject ?? null) as { success?: boolean; error?: string } | null);
	const approveForm = $derived((form?.approve ?? null) as { success?: boolean; error?: string } | null);
	const actionError = $derived(rejectForm?.error ?? approveForm?.error ?? '');

	function payloadSummary(s: Suggestion): string {
		const p = s.payload;
		if (!p) return 'No details';
		const parts: string[] = [];
		if (p.type) parts.push(titleCase(p.type));
		if (p.day) parts.push('scheduled');
		if (p.booked) parts.push('booked');
		return parts.join(' · ') || 'New item';
	}

	function formatDate(iso: string): string {
		if (!iso) return '';
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<NavBar title="Inbox" subtitle={data.trip.title} back backHref="/trips/{data.trip.slug}" />
<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8 space-y-6">
	{#if actionError}
		<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">{actionError}</div>
	{/if}

	<section class="space-y-3">
		<h2 class="text-ink-soft text-xs font-semibold tracking-wider uppercase">
			Pending ({data.pending.length})
		</h2>

		{#if data.pending.length === 0}
			<Card>
				<p class="text-ink-muted p-4 text-sm">No pending suggestions.</p>
			</Card>
		{:else}
			{#each data.pending as s (s.id)}
				<Card>
					<div class="p-4 space-y-3">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<p class="text-ink text-sm font-semibold truncate">{s.payload?.title ?? '(no title)'}</p>
								<p class="text-ink-muted text-xs">{payloadSummary(s)}</p>
							</div>
							<Pill variant="default" size="sm">{titleCase(s.author_role)}</Pill>
						</div>

						<div class="text-ink-muted text-xs">
							Suggested by <span class="text-ink-soft font-medium">{s.author_name || 'Unknown'}</span>
							{#if s.created} · {formatDate(s.created)}{/if}
						</div>

						<div class="bg-surface-2 rounded-md p-3 space-y-1 text-xs">
							{#if s.payload?.description}
								<p class="text-ink-soft">{s.payload.description}</p>
							{/if}
							{#if s.payload?.location_name}
								<p class="text-ink-muted">{s.payload.location_name}</p>
							{/if}
							{#if s.payload?.start_time || s.payload?.end_time}
								<p class="text-ink-muted">
									{s.payload?.start_time ?? ''}{s.payload?.start_time && s.payload?.end_time ? ' – ' : ''}{s.payload?.end_time ?? ''}
								</p>
							{/if}
							{#if s.payload?.cost_estimate_usd}
								<p class="text-ink-muted">~${s.payload.cost_estimate_usd} estimated</p>
							{/if}
						</div>

						<div class="flex gap-2">
							<form
								method="POST"
								action="?/approve"
								use:enhance={() => {
									approving = s.id;
									return async ({ update, result }) => {
										approving = null;
										if (result.type === 'success') toast.show('Suggestion approved');
										await update();
									};
								}}
							>
								<input type="hidden" name="suggestion_id" value={s.id} />
								<Button
									type="submit"
									variant="moss"
									size="sm"
									disabled={approving === s.id || rejecting === s.id}
								>
									{approving === s.id ? 'Approving…' : 'Approve'}
								</Button>
							</form>

							<a
								href="/trips/{data.trip.slug}/items/new?suggestion={s.id}"
								class="border-line text-ink-soft hover:bg-surface-2 inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-semibold"
							>
								Edit &amp; Approve
							</a>

							{#if rejectOpenId !== s.id}
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={approving === s.id || rejecting === s.id}
									onclick={() => { rejectOpenId = s.id; rejectNote = ''; }}
								>
									Reject
								</Button>
							{/if}
						</div>

						{#if rejectOpenId === s.id}
							<!-- #250 — reject requires a one-line note (no one-tap reject). -->
							<form
								method="POST"
								action="?/reject"
								use:enhance={() => {
									rejecting = s.id;
									return async ({ update, result }) => {
										rejecting = null;
										if (result.type === 'success') {
											rejectOpenId = null;
											rejectNote = '';
											toast.show('Suggestion rejected');
										}
										await update();
									};
								}}
								class="space-y-2"
							>
								<input type="hidden" name="suggestion_id" value={s.id} />
								<label for="reject-note-{s.id}" class="text-ink-soft block text-xs font-medium">
									Reason for rejecting (required)
								</label>
								<input
									id="reject-note-{s.id}"
									name="review_note"
									type="text"
									required
									bind:value={rejectNote}
									placeholder="Why isn’t this a fit?"
									class="border-line bg-surface text-ink block w-full rounded-md border px-3 py-2 text-sm"
								/>
								<div class="flex items-center gap-2">
									<Button type="submit" variant="outline" size="sm" disabled={rejecting === s.id || !rejectNote.trim()}>
										{rejecting === s.id ? 'Rejecting…' : 'Confirm reject'}
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										disabled={rejecting === s.id}
										onclick={() => { rejectOpenId = null; rejectNote = ''; }}
									>
										Cancel
									</Button>
								</div>
							</form>
						{/if}
					</div>
				</Card>
			{/each}
		{/if}
	</section>

	{#if data.approved.length > 0}
		<section class="space-y-3">
			<h2 class="text-ink-soft text-xs font-semibold tracking-wider uppercase">
				Recently approved ({data.approved.length})
			</h2>
			{#each data.approved.slice(0, 10) as s (s.id)}
				<Card>
					<div class="flex items-center justify-between gap-2 px-4 py-3">
						<div class="min-w-0">
							<p class="text-ink text-sm truncate">{s.payload?.title ?? '(no title)'}</p>
							<p class="text-ink-muted text-xs">
								By {s.author_name || 'Unknown'} · {formatDate(s.created)}
							</p>
						</div>
						<Pill variant="booked" size="sm">Approved</Pill>
					</div>
				</Card>
			{/each}
		</section>
	{/if}
</main>
