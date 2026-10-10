<script lang="ts">
	// The pending idea card (#444; spec §Suggestions, D2/D11): a pending
	// [[Suggestion]] rendered like an idea card (title, `place · cost`, the four
	// tap-to-vote pills) but dashed, with a gold `Pending` chip and a tray of
	// review actions. NO role badge: "Suggested by Jess" already says who.
	//
	// One component, two hosts:
	//   - Phase Detail's parking list (`review="ghost"`): tray = Approve / Reject.
	//   - The Inbox Pending tab (`review="inbox"`): tray = Approve / Edit / Reject.
	// The host says where the forms post (`actions`), because the two pages own
	// their own form actions. Not a link: a pending idea has no item page yet.
	//
	// Visible to ALL members. Pills are tappable for a non-viewer who is NOT the
	// author (authorship is the implicit endorsement); everyone else sees counts.
	// The tray is owner / co_owner only (`canReview`).
	import { enhance } from '$app/forms';
	import { withOrigin } from '$lib/shell/back-nav';
	import { page } from '$app/state';
	import { toast } from '$lib/shell/stores/toast';
	import type { Suggestion } from '$lib/collaboration/types';
	import type { TripMember } from '$lib/types';
	import type { DisplayVote } from '$lib/collaboration/voting';
	import Card from '$lib/ui/Card.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import VotePills from '$lib/collaboration/components/VotePills.svelte';
	import { ideaSub } from '$lib/itinerary/idea-groups';

	let {
		suggestion,
		votes = [],
		members = [],
		myMemberId = '',
		canVote = false,
		canReview = false,
		review = 'ghost',
		tripSlug = '',
		actions = {
			approve: '?/approveGhost',
			reject: '?/rejectGhost',
			vote: '?/voteGhost',
			unvote: '?/unvoteGhost'
		}
	}: {
		suggestion: Suggestion;
		/** Votes on the suggestion (`suggestion_votes`). */
		votes?: DisplayVote[];
		members?: TripMember[];
		/** The viewer's trip_members.id: author check + their own pill. */
		myMemberId?: string;
		/** False for viewers (read-only). The author can never vote regardless. */
		canVote?: boolean;
		/** Owner / co_owner only: shows the tray. */
		canReview?: boolean;
		/** Which tray: `ghost` = Approve / Reject; `inbox` = Approve / Edit / Reject. */
		review?: 'ghost' | 'inbox';
		/** Needed for the Edit link (`review="inbox"`). */
		tripSlug?: string;
		/** Where each form posts on the host page. */
		actions?: { approve: string; reject: string; vote: string; unvote: string };
	} = $props();
	// Per-instance id: AppShell renders the page twice (mobile + desktop trees).
	const uid = $props.id();

	const payload = $derived(suggestion.payload ?? {});
	const title = $derived((payload.title as string) || 'Untitled idea');
	const authorName = $derived(suggestion.author_name || 'A member');
	const sub = $derived(
		ideaSub({
			type: (payload.type as string) || 'activity',
			location_name: (payload.location_name as string) || '',
			description: (payload.description as string) || '',
			cost_estimate_usd: Number(payload.cost_estimate_usd) || 0
		})
	);

	const isAuthor = $derived(!!myMemberId && suggestion.author_id === myMemberId);
	const showVoteButtons = $derived(canVote && !isAuthor);

	let reviewing = $state(false); // approve in flight
	let rejectOpen = $state(false); // note field expanded
	let rejectNote = $state('');
	let rejectSubmitting = $state(false);

	const TRAY_BTN =
		'inline-flex min-h-[44px] items-center justify-center rounded-full border px-4 text-sm font-semibold transition-colors disabled:opacity-50';
</script>

<!-- Dashed border = "pending", distinct from a solid idea card. -->
<div aria-label="Pending idea: {title}" role="group">
<Card class="border-dashed">
	<div class="px-3 py-2">
		<div class="flex items-start justify-between gap-2">
			<p class="text-ink min-w-0 truncate text-sm font-semibold" title={title}>{title}</p>
			<Pill variant="pending" size="sm">Pending</Pill>
		</div>
		{#if sub}
			<p class="text-ink-muted mt-0.5 truncate text-xs" data-idea-sub>{sub}</p>
		{/if}
		<p class="text-ink-muted mt-0.5 text-xs">Suggested by {authorName}</p>
		<div class="mt-1.5 w-fit">
			<VotePills
				{votes}
				{members}
				{myMemberId}
				canVote={showVoteButtons}
				voteAction={actions.vote}
				unvoteAction={actions.unvote}
				extraFields={{ suggestion_id: suggestion.id }}
			/>
		</div>
	</div>

	{#if canReview}
		<!-- The tray (#444). Approve promotes the suggestion to a real item (author-
		     attributed, votes carried). Reject demands a one-line note. Edit opens the
		     edit view (Reject / Save / Approve). -->
		<div class="border-line/70 space-y-2 border-t border-dashed px-3 py-2">
			{#if !rejectOpen}
				<div class="flex flex-wrap items-center gap-2" role="group" aria-label="Review this pending idea">
					<form
						method="POST"
						action={actions.approve}
						use:enhance={() => {
							reviewing = true;
							return async ({ update, result }) => {
								reviewing = false;
								if (result.type === 'success') toast.show('Suggestion approved');
								await update();
							};
						}}
					>
						<input type="hidden" name="suggestion_id" value={suggestion.id} />
						<button
							type="submit"
							disabled={reviewing}
							class="{TRAY_BTN} bg-moss text-paper border-moss"
						>
							{reviewing ? 'Approving…' : 'Approve'}
						</button>
					</form>
					{#if review === 'inbox'}
						<a
							href={withOrigin(`/trips/${tripSlug}/items/new?suggestion=${suggestion.id}`, page.url.pathname)}
							class="{TRAY_BTN} border-line text-ink-soft hover:bg-surface-2 active:bg-surface-2"
						>
							Edit
						</a>
					{/if}
					<button
						type="button"
						onclick={() => (rejectOpen = true)}
						disabled={reviewing}
						class="{TRAY_BTN} border-line text-ink-muted hover:border-clay/40 active:border-clay/40 hover:text-clay active:text-clay"
					>
						Reject
					</button>
				</div>
			{:else}
				<form
					method="POST"
					action={actions.reject}
					use:enhance={() => {
						rejectSubmitting = true;
						return async ({ result, update }) => {
							rejectSubmitting = false;
							if (result.type === 'success') {
								rejectOpen = false;
								rejectNote = '';
								toast.show('Suggestion rejected');
							}
							await update();
						};
					}}
					class="space-y-2"
				>
					<input type="hidden" name="suggestion_id" value={suggestion.id} />
					<label class="text-ink-soft block text-xs font-medium" for="{uid}-reject-note">
						Reason for rejecting (required)
					</label>
					<input
						id="{uid}-reject-note"
						name="review_note"
						type="text"
						required
						bind:value={rejectNote}
						placeholder="Why isn’t this a fit?"
						class="border-line bg-surface text-ink block min-h-[44px] w-full rounded-md border px-3 text-sm"
					/>
					<div class="flex items-center gap-2">
						<button
							type="submit"
							disabled={rejectSubmitting || !rejectNote.trim()}
							class="{TRAY_BTN} bg-clay text-paper border-clay"
						>
							{rejectSubmitting ? 'Rejecting…' : 'Confirm reject'}
						</button>
						<button
							type="button"
							onclick={() => { rejectOpen = false; rejectNote = ''; }}
							disabled={rejectSubmitting}
							class="text-ink-muted hover:text-ink-soft active:text-ink-soft inline-flex min-h-[44px] items-center px-3 text-sm font-semibold disabled:opacity-50"
						>
							Cancel
						</button>
					</div>
				</form>
			{/if}
		</div>
	{/if}
</Card>
</div>
