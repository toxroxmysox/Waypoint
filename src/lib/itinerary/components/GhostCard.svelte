<script lang="ts">
	// #248 / PRD #202 — a pending [[Suggestion]] rendered as a [[Ghost Card]] in a
	// parking lot. Dotted border + "Pending" badge mark it as a proposal, not a
	// settled plan. A shared, surface-agnostic card so a ghost reads identically on
	// every parking-lot surface — the dotted treatment lives here, in rendering, not
	// in the data (parking-lot-cards.ts). Wired into Phase Detail (the canonical
	// parking-lot home) in Slice 1; reuse this verbatim for the day-view zones.
	//
	// Visible to ALL members; voting reuses the target-agnostic voting.ts
	// scoring/avatar-stack logic (VoteStacks + VoteCountPill, identical to item
	// cards). Cast buttons appear only for a non-viewer who is NOT the author —
	// authorship is the implicit endorsement, and viewers are read-only-but-can-see
	// (the card + its vote stack still render for them).
	import { enhance } from '$app/forms';
	import type { GhostCard } from '$lib/itinerary/parking-lot-cards';
	import type { MemberWithAvatar } from '$lib/collaboration/member-avatar';
	import { VOTE_OPTIONS, type VoteValue } from '$lib/collaboration/voting';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import VoteStacks from '$lib/collaboration/components/VoteStacks.svelte';
	import VoteCountPill from '$lib/collaboration/components/VoteCountPill.svelte';
	import type { ItemType } from '$lib/itinerary/types';

	let {
		card,
		members = [],
		myMemberId = '',
		canVote = false,
		canReview = false
	}: {
		card: GhostCard;
		/** Trip members (with resolved avatars) for the vote stack. */
		members?: MemberWithAvatar[];
		/** The viewer's trip_members.id — used to find their own vote + author check. */
		myMemberId?: string;
		/** False for viewers (read-only). The author can never vote regardless. */
		canVote?: boolean;
		/** #249/#250 — owner/co_owner only. Adds in-place approve + reject (with a
		 *  required note) on the ghost. Posts to the surface's approveGhost/rejectGhost
		 *  form actions; on success the ghost promotes (approve) or leaves (reject). */
		canReview?: boolean;
	} = $props();

	const payload = $derived(card.suggestion.payload ?? {});
	const title = $derived((payload.title as string) || 'Untitled idea');
	const type = $derived(((payload.type as ItemType) || 'activity') as ItemType);
	const subtype = $derived((payload.subtype as string) || '');
	const authorName = $derived(card.suggestion.author_name || 'A member');

	// Authorship is the implicit endorsement — the author never votes their own.
	const isAuthor = $derived(!!myMemberId && card.suggestion.author_id === myMemberId);
	const showVoteButtons = $derived(canVote && !isAuthor);

	// The viewer's own vote on this ghost (if any) → toggles to "unvote".
	const myVote = $derived(card.votes.find((v) => v.member === myMemberId) ?? null);

	const OPTION_META: Record<VoteValue, { label: string; glyph: string; active: string }> = {
		love: { label: 'Love', glyph: '♥', active: 'bg-moss text-paper border-moss' },
		like: { label: 'Like', glyph: '+', active: 'bg-moss/15 text-moss border-moss/40' },
		flexible: { label: 'Flexible', glyph: '~', active: 'bg-line/60 text-ink border-line' },
		dislike: { label: 'Pass', glyph: '–', active: 'bg-clay/15 text-clay border-clay/40' }
	};

	let submitting = $state(false);

	// #249/#250 — owner review affordance state (in-place approve / reject-with-note).
	let reviewing = $state(false); // approve in flight
	let rejectOpen = $state(false); // note field expanded
	let rejectNote = $state('');
	let rejectSubmitting = $state(false);
</script>

<!-- Dotted border + recessed paper tint = "pending", distinct from a solid idea
     card. Not a link: a ghost has no item page yet (it's a view over a suggestion). -->
<div
	class="border-line bg-paper/60 rounded-lg border border-dashed"
	aria-label="Pending idea: {title}"
>
	<div class="flex items-start gap-3 px-3 py-2.5">
		<TypeIcon {type} sub={subtype} size={18} />
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<p class="text-ink truncate text-sm" title={title}>{title}</p>
				<span
					class="border-line text-ink-muted shrink-0 rounded-full border border-dashed px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase"
				>
					Pending
				</span>
			</div>
			<p class="text-ink-muted mt-0.5 text-[11px]">Suggested by {authorName}</p>

			{#if card.votes.length}
				<div class="mt-2">
					<VoteStacks votes={card.votes} {members} size={18} />
				</div>
			{/if}
		</div>
		{#if card.votes.length}
			<div class="shrink-0 pt-0.5">
				<VoteCountPill votes={card.votes} />
			</div>
		{/if}
	</div>

	{#if showVoteButtons}
		<!-- Cast / change / clear a vote on this ghost. Posts to the surface's
		     voteGhost/unvoteGhost form actions (progressive enhancement), writing a
		     suggestion_votes row. Hidden for viewers (read-only) and the author. -->
		<div
			class="border-line/70 flex flex-wrap items-center gap-1.5 border-t border-dashed px-3 py-2"
			role="group"
			aria-label="Vote on this pending idea"
		>
			{#each VOTE_OPTIONS as option (option)}
				{@const selected = myVote?.value === option}
				<form
					method="POST"
					action="?/{selected ? 'unvoteGhost' : 'voteGhost'}"
					use:enhance={() => {
						submitting = true;
						return async ({ update }) => {
							submitting = false;
							await update();
						};
					}}
				>
					<input type="hidden" name="suggestion_id" value={card.suggestion.id} />
					{#if selected}
						<input type="hidden" name="vote_id" value={myVote?.id} />
					{:else}
						<input type="hidden" name="value" value={option} />
					{/if}
					<button
						type="submit"
						disabled={submitting}
						aria-pressed={selected}
						class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50
							{selected
							? OPTION_META[option].active
							: 'border-line text-ink-muted hover:border-moss/40 hover:text-moss'}"
					>
						<span aria-hidden="true">{OPTION_META[option].glyph}</span>
						<span>{OPTION_META[option].label}</span>
					</button>
				</form>
			{/each}
		</div>
	{/if}

	{#if canReview}
		<!-- #249/#250 — owner/co_owner review. Approve promotes the ghost in place
		     (→ real item, author-attributed, votes carried). Reject demands a note
		     and removes it from every member's parking lot. Same endpoint as the
		     Inbox. Hidden from travelers/viewers. -->
		<div class="border-line/70 border-t border-dashed px-3 py-2 space-y-2">
			{#if !rejectOpen}
				<div class="flex items-center gap-2" role="group" aria-label="Review this pending idea">
					<form
						method="POST"
						action="?/approveGhost"
						use:enhance={() => {
							reviewing = true;
							return async ({ update }) => {
								reviewing = false;
								await update();
							};
						}}
					>
						<input type="hidden" name="suggestion_id" value={card.suggestion.id} />
						<button
							type="submit"
							disabled={reviewing}
							class="bg-moss text-paper border-moss inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50"
						>
							{reviewing ? 'Approving…' : 'Approve'}
						</button>
					</form>
					<button
						type="button"
						onclick={() => (rejectOpen = true)}
						disabled={reviewing}
						class="border-line text-ink-muted hover:border-clay/40 hover:text-clay inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50"
					>
						Reject
					</button>
				</div>
			{:else}
				<form
					method="POST"
					action="?/rejectGhost"
					use:enhance={() => {
						rejectSubmitting = true;
						return async ({ result, update }) => {
							rejectSubmitting = false;
							if (result.type === 'success') {
								rejectOpen = false;
								rejectNote = '';
							}
							await update();
						};
					}}
					class="space-y-2"
				>
					<input type="hidden" name="suggestion_id" value={card.suggestion.id} />
					<label class="text-ink-soft block text-[11px] font-medium" for="reject-note-{card.suggestion.id}">
						Reason for rejecting (required)
					</label>
					<input
						id="reject-note-{card.suggestion.id}"
						name="review_note"
						type="text"
						required
						bind:value={rejectNote}
						placeholder="Why isn’t this a fit?"
						class="border-line bg-surface text-ink block w-full rounded-md border px-2.5 py-1.5 text-sm"
					/>
					<div class="flex items-center gap-2">
						<button
							type="submit"
							disabled={rejectSubmitting || !rejectNote.trim()}
							class="bg-clay text-paper border-clay inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50"
						>
							{rejectSubmitting ? 'Rejecting…' : 'Confirm reject'}
						</button>
						<button
							type="button"
							onclick={() => { rejectOpen = false; rejectNote = ''; }}
							disabled={rejectSubmitting}
							class="text-ink-muted hover:text-ink-soft inline-flex items-center px-2 py-1 text-xs font-semibold disabled:opacity-50"
						>
							Cancel
						</button>
					</div>
				</form>
			{/if}
		</div>
	{/if}
</div>
