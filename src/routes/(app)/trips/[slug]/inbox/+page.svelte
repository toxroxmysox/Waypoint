<script lang="ts">
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import GhostCard from '$lib/itinerary/components/GhostCard.svelte';
	import type { Suggestion } from '$lib/types';
	import type { InboxSuggestion } from './+page.server';
	import { titleCase } from '$lib/shell/format';
	import { tallyVotes, type VoteValue } from '$lib/collaboration/voting';

	let { data, form } = $props();

	// #251 — Pending / Approved / Rejected tabs.
	type TabId = 'pending' | 'approved' | 'rejected';
	let activeTab = $state<TabId>('pending');
	const tabs: { id: TabId; label: string }[] = [
		{ id: 'pending', label: 'Pending' },
		{ id: 'approved', label: 'Approved' },
		{ id: 'rejected', label: 'Rejected' }
	];
	const tabItems = $derived<InboxSuggestion[]>(
		activeTab === 'pending' ? data.pending : activeTab === 'approved' ? data.approved : data.rejected
	);

	const rejectForm = $derived((form?.reject ?? null) as { success?: boolean; error?: string } | null);
	const approveForm = $derived((form?.approve ?? null) as { success?: boolean; error?: string } | null);
	const actionError = $derived(rejectForm?.error ?? approveForm?.error ?? (form?.error as string | undefined) ?? '');

	// #251 — per-option vote glyphs for the compact tally (Approved / Rejected tabs;
	// the Pending tab uses the tap-to-vote pills on the pending idea card, #444).
	const TALLY_GLYPH: Record<VoteValue, string> = { love: '♥', like: '+', flexible: '~', dislike: '–' };

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
<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8 space-y-5">
	{#if actionError}
		<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">{actionError}</div>
	{/if}

	<!-- #251 — tab bar. Each tab shows its count; owner/co_owner-only (the loader
	     403s travelers/viewers, unchanged). -->
	<div class="border-line flex gap-1 border-b" role="tablist" aria-label="Suggestion queue">
		{#each tabs as t (t.id)}
			{@const count = (t.id === 'pending' ? data.pending : t.id === 'approved' ? data.approved : data.rejected).length}
			<button
				type="button"
				role="tab"
				aria-selected={activeTab === t.id}
				onclick={() => (activeTab = t.id)}
				class="-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors
					{activeTab === t.id ? 'border-moss text-ink' : 'border-transparent text-ink-muted hover:text-ink-soft active:text-ink-soft'}"
			>
				{t.label}
				<span class="text-ink-muted font-mono text-xs">({count})</span>
			</button>
		{/each}
	</div>

	<section class="space-y-3" role="tabpanel">
		{#if tabItems.length === 0}
			<Card>
				<p class="text-ink-muted p-4 text-sm">
					{#if activeTab === 'pending'}No pending suggestions.{:else if activeTab === 'approved'}Nothing approved yet.{:else}Nothing rejected.{/if}
				</p>
			</Card>
		{:else}
			{#each tabItems as s (s.id)}
				{#if activeTab === 'pending'}
					<!-- #444 — the pending idea card: dashed, gold Pending chip, vote pills, and
					     the Approve / Edit / Reject tray. No role badge. -->
					<GhostCard
						suggestion={s}
						votes={s.votes}
						members={data.members}
						myMemberId={data.myMemberId}
						canVote
						canReview
						review="inbox"
						tripSlug={data.trip.slug}
						actions={{ approve: '?/approve', reject: '?/reject', vote: '?/voteGhost', unvote: '?/unvoteGhost' }}
					/>
				{:else}
					{@const tally = tallyVotes(s.votes)}
					<Card>
						<div class="p-4 space-y-3">
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0">
									<p class="text-ink text-sm font-semibold truncate">{s.payload?.title ?? '(no title)'}</p>
									<p class="text-ink-muted text-xs">{payloadSummary(s)}</p>
								</div>
								{#if activeTab === 'approved'}
									<Pill variant="booked" size="sm">Approved</Pill>
								{:else}
									<Pill variant="default" size="sm">Rejected</Pill>
								{/if}
							</div>

							<div class="flex flex-wrap items-center justify-between gap-2">
								<div class="text-ink-muted text-xs">
									Suggested by <span class="text-ink-soft font-medium">{s.author_name || 'Unknown'}</span>
									{#if s.created} · {formatDate(s.created)}{/if}
								</div>
								<!-- #251 — vote tally on the history tabs. Compact per-option counts;
								     total in the aria label. "No votes" when none were cast. -->
								{#if tally.total > 0}
									<div
										class="text-ink-soft flex items-center gap-2 text-xs"
										aria-label="{tally.total} {tally.total === 1 ? 'vote' : 'votes'}"
									>
										{#each ['love', 'like', 'flexible', 'dislike'] as const as opt}
											{#if tally.counts[opt] > 0}
												<span class="inline-flex items-center gap-0.5 tabular-nums">
													<span aria-hidden="true">{TALLY_GLYPH[opt]}</span>{tally.counts[opt]}
												</span>
											{/if}
										{/each}
									</div>
								{:else}
									<span class="text-ink-muted text-xs">No votes</span>
								{/if}
							</div>

							{#if activeTab === 'rejected' && s.review_note}
								<!-- #250 — the reviewer's note, retained on the Rejected tab. -->
								<div class="border-clay/30 bg-clay/5 text-ink-soft rounded-md border p-2.5 text-xs">
									<span class="text-ink-muted">Note:</span> {s.review_note}
								</div>
							{/if}
						</div>
					</Card>
				{/if}
			{/each}
		{/if}
	</section>
</main>
