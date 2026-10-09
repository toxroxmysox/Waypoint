<script lang="ts">
	import { withOrigin } from '$lib/shell/back-nav';
	import { enhance } from '$app/forms';
	import { itemMenuEntries } from '$lib/itinerary/item-actions';
	import { getFieldConfig } from '$lib/itinerary/item-fields';
	import { addLine, detailsRows, itemTimeText, itemTypeLine, newestFirst } from '$lib/itinerary/item-page';
	import { needsBooking } from '$lib/itinerary/booking-projection';
	import { documentLabel } from '$lib/documents/files';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import SectionH from '$lib/ui/SectionH.svelte';
	import { titleCase } from '$lib/shell/format';
	import { page } from '$app/state';
	import Hero from '$lib/itinerary/components/Hero.svelte';

	import VoteButtons from '$lib/collaboration/components/VoteButtons.svelte';
	import ItemActionsMenu from '$lib/itinerary/components/ItemActionsMenu.svelte';
	import ItemActionSheets from '$lib/itinerary/components/ItemActionSheets.svelte';
	import ChecklistBody from '$lib/itinerary/components/ChecklistBody.svelte';
	import AssignMemberSheet from '$lib/itinerary/components/AssignMemberSheet.svelte';
	import Avatar from '$lib/ui/Avatar.svelte';
	import DocumentSection from '$lib/documents/components/DocumentSection.svelte';
	import { logPaymentHref } from '$lib/money/expense-prefill';
	import type { Comment, Task } from '$lib/types';

	let { data, form } = $props();

	// #416 — every control below renders only for roles the server accepts it
	// from (itemPermissions, computed in the loader). #437 reuses the same set.
	const can = $derived(data.permissions);
	// #437 — the ⋯ menu's entries are a projection of the same permissions.
	const menuEntries = $derived(itemMenuEntries(can));
	let moveSheetOpen = $state(false);
	let skipSheetOpen = $state(false);
	let deleteSheetOpen = $state(false);
	const itemUrl = $derived(`/trips/${data.trip.slug}/items/${data.item.id}`);
	const docCount = $derived(data.documents.length);
	const typeLabel = $derived(getFieldConfig(data.item.type).labels.typeLabel.toLowerCase());

	// #229 / ADR-0014 — the paid-moment money-event affordance. "Log payment" opens the
	// #228 prefilled add (amount ← estimate, description ← title, linked_item ← this item;
	// payer = current member + whole-group even split, both editable). The deep-link is
	// pure (logPaymentHref). The expenses-list link-out (the "Paid $X" state) reuses the
	// existing ?item=<id> filter.
	const payHref = $derived(logPaymentHref(data.trip.slug, data.item));
	const expensesHref = $derived(`/trips/${data.trip.slug}/expenses?item=${data.item.id}`);

	// #438 — the Hero's inputs and the Details card, all derived (item-page.ts).
	const typeLine = $derived(itemTypeLine(data.item.type, data.item.subtype));
	const timeText = $derived(itemTimeText(data.item, data.itemDay?.date));
	const heroDocs = $derived(
		data.documents.map((d) => ({ id: d.id, label: documentLabel(d.caption, d.file), href: d.file_href }))
	);
	const rows = $derived(
		detailsRows({
			item: data.item,
			phaseName: data.itemPhase?.name,
			paid: data.paidSummary,
			canLogPayment: can.canLogPayment,
			payHref,
			expensesHref
		})
	);
	// Empty Documents / Checklist shrink to one line; tapping + Document opens the section.
	let docsOpen = $state(false);
	const adds = $derived(
		addLine({
			docCount: docCount,
			hasChecklist: !!data.checklist,
			canUpload: can.canUpload,
			canEditChecklist: can.canEditChecklist,
			docsOpen
		})
	);
	// Comments
	let commentText = $state('');
	let commentSubmitting = $state(false);
	let optimisticComments = $state<Comment[]>([]);
	// Newest first: pending optimistic comments on top of the (-created) server list.
	let allComments = $derived(newestFirst([...optimisticComments, ...data.comments]));

	// #361 — the chevron's origin now rides in `?from=` (see back-nav.ts), so this
	// is only the COLD-LOAD fallback: an invite link or digest email that lands
	// straight here has no origin to go back to. Scott's call was that such a visit
	// returns to the trip's overview rather than guessing at the item's data parent
	// — which is exactly what the old mode-aware chain did, and why it is gone.
	let backHref = $derived(`/trips/${data.trip.slug}`);

	// Inline checklist (ledger, issue #55)
	const doneCount = $derived(data.tasks.filter((t) => t.checked).length);
	let assignOpen = $state(false);
	let activeTask = $state<Task | null>(null);

	function openAssign(task: Task) {
		activeTask = task;
		assignOpen = true;
	}
</script>

<NavBar title={data.trip.title} back {backHref}>
	{#snippet right()}
		<div class="flex items-center gap-1">
			{#if can.canEdit}
				<a
					href={withOrigin(`/trips/${data.trip.slug}/items/${data.item.id}/edit`, page.url.pathname)}
					class="text-ink-soft hover:text-ink active:text-ink active:bg-surface-2 flex h-11 items-center rounded-md px-3 text-sm font-semibold"
				>
					Edit
				</a>
			{/if}
			<ItemActionsMenu
				entries={menuEntries}
				onselect={(id) => {
					if (id === 'move') moveSheetOpen = true;
					else if (id === 'skip') skipSheetOpen = true;
					else deleteSheetOpen = true;
				}}
			/>
		</div>
	{/snippet}
</NavBar>

<main class="mx-auto w-full max-w-lg md-desktop:max-w-3xl flex-1 px-4 pt-4 pb-8">
	<!-- Desktop (D13): two columns. Left = the Hero, votes, description, Details, Goals.
	     Right = Documents, Checklist, Comments. One column on phones, in that order. -->
	<div class="space-y-4 md-desktop:grid md-desktop:grid-cols-2 md-desktop:items-start md-desktop:gap-4 md-desktop:space-y-0">
		<div class="min-w-0 space-y-4" data-testid="item-col-main">
			<!-- #438 — the Hero is the header: icon + title, type in words, the place (opens Maps),
			     the time, codes, documents, status, Going. Planning Mode: not live, no accent.
			     Slots left for the next tickets: Hero `children` (#441 Book / Mark booked),
			     `hero-going` (#440 Are you going?), the votes block below (#442). -->
			<Hero
				item={data.item}
				members={data.members}
				{typeLine}
				{timeText}
				codes={data.item.confirmation_codes ?? []}
				docs={heroDocs}
				done={data.item.status === 'done'}
				needsBooking={needsBooking(data.item)}
			/>

			{#if can.canVote}
				<div class="px-1" data-testid="item-votes">
					<VoteButtons myVote={data.myVote} {itemUrl} />
				</div>
			{/if}

			{#if data.item.description}
				<p class="text-ink-soft px-1 text-sm whitespace-pre-wrap" data-testid="item-description">{data.item.description}</p>
			{/if}

			<!-- One Details card (D12). The payment row is its own row and never depends on the
			     estimate (ADR-0014): 0 linked expenses -> "Log payment"; >=1 -> "Paid $X". -->
			{#if rows.length > 0}
				<Card>
					<div class="p-4 pb-2">
						<SectionH>Details</SectionH>
						<dl class="divide-line mt-1 divide-y" data-testid="item-details">
							{#each rows as row (row.key)}
								{#if row.href}
									<a
										href={row.href}
										target={row.external ? '_blank' : undefined}
										rel={row.external ? 'noopener noreferrer' : undefined}
										class="hover:bg-surface-2 active:bg-surface-2 flex min-h-11 items-center justify-between gap-3 py-2"
										data-detail={row.key}
									>
										<dt class="text-ink-muted shrink-0 text-xs font-semibold tracking-wide uppercase">{row.label}</dt>
										<dd class="text-ink flex min-w-0 items-center gap-2 text-sm font-medium">
											<span class="truncate">{row.value}</span>
											{#if row.hint}<span class="text-ink-muted shrink-0 text-xs font-normal">{row.hint}</span>{/if}
											<span class="text-ink-muted shrink-0" aria-hidden="true">{row.external ? '↗' : '›'}</span>
										</dd>
									</a>
								{:else}
									<div class="flex min-h-11 items-center justify-between gap-3 py-2" data-detail={row.key}>
										<dt class="text-ink-muted shrink-0 text-xs font-semibold tracking-wide uppercase">{row.label}</dt>
										<dd class="text-ink min-w-0 text-sm font-medium">{row.value}</dd>
									</div>
								{/if}
							{/each}
						</dl>
					</div>
				</Card>
			{/if}

			<!-- #129 — Goals this item addresses. The link lives goal-side
			     (trip_goals.items); rendered read-only here, each row navigates to the
			     goal. Section omitted entirely when this item links no goals. -->
			{#if data.linkedGoals.length > 0}
				<Card>
					<div class="p-4">
						<SectionH>Goals</SectionH>
						<div class="mt-2 -mx-1">
							{#each data.linkedGoals as goal (goal.id)}
								<a
									href="/trips/{data.trip.slug}/goals/{goal.id}"
									class="hover:bg-surface-2 active:bg-surface-2 flex min-h-11 items-center gap-2 rounded-md px-1 py-2"
								>
									<span class="text-ink-soft shrink-0" aria-hidden="true">✦</span>
									<span class="text-ink min-w-0 flex-1 truncate text-sm font-medium">{goal.title}</span>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-ink-muted shrink-0">
										<path d="m9 18 6-6-6-6" />
									</svg>
								</a>
							{/each}
						</div>
					</div>
				</Card>
			{/if}
		</div>

		<div class="min-w-0 space-y-4" data-testid="item-col-side">
			<!-- Documents: the full section only once there is one (or after + Document). Codes
			     stay in the Hero. -->
			{#if docCount > 0 || docsOpen}
				<DocumentSection
					docs={data.documents}
					itemId={data.item.id}
					membershipId={data.membership.id}
					role={data.membership.role}
					canUpload={can.canUpload}
				/>
			{/if}

			{#if form?.uploadError}
				<p class="text-clay px-1 text-sm">{form.uploadError}</p>
			{/if}

			<!-- Inline item checklist — ledger (ADR-0003 grocery case · #55) -->
			{#if data.checklist}
				<div>
					<div class="mb-2.5 flex items-center justify-between px-0.5">
						<h2 class="font-display text-ink text-base font-semibold">{data.checklist.title}</h2>
						<span class="text-ink-muted font-mono text-xs tabular-nums">
							<span class="text-ink font-semibold">{doneCount}</span>/{data.tasks.length}
						</span>
					</div>

					<ChecklistBody
						tasks={data.tasks}
						members={data.members}
						checklistId={data.checklist.id}
						toggleAction="?/toggleTask"
						addAction="?/addTask"
						showControls={false}
						addLabel="Add an item"
						onAssign={openAssign}
						readonly={!can.canEditChecklist}
					/>

					<div class="text-ink-muted mt-3 flex items-center gap-1.5 px-1">
						<svg width="13" height="13" viewBox="0 0 20 20" fill="none">
							<path d="M10 2L11.5 7L16 8L11.5 9L10 14L8.5 9L4 8L8.5 7L10 2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
						</svg>
						<span class="font-display text-[11px] italic">This list lives on the item — it travels with it.</span>
					</div>

					{#if can.canEditChecklist}
						<form method="POST" action="?/deleteChecklist" use:enhance class="mt-2 px-1">
							<input type="hidden" name="checklist_id" value={data.checklist.id} />
							<button type="submit" class="text-ink-muted hover:text-clay active:text-clay min-h-11 text-xs"> Remove checklist </button>
						</form>
					{/if}
				</div>
			{/if}

			<!-- Empty Documents / Checklist shrink to one line (D12). -->
			{#if adds.length > 0}
				<div
					class="border-line text-ink-soft flex items-center justify-center gap-1 rounded-lg border border-dashed px-2"
					data-testid="item-add-line"
				>
					{#each adds as kind, i (kind)}
						{#if i > 0}<span class="text-ink-muted" aria-hidden="true">·</span>{/if}
						{#if kind === 'document'}
							<button
								type="button"
								onclick={() => (docsOpen = true)}
								class="hover:text-ink active:text-ink min-h-11 px-3 text-sm font-semibold"
							>
								+ Document
							</button>
						{:else}
							<form method="POST" action="?/attachChecklist" use:enhance class="inline">
								<button type="submit" class="hover:text-ink active:text-ink min-h-11 px-3 text-sm font-semibold">
									+ Checklist
								</button>
							</form>
						{/if}
					{/each}
				</div>
			{/if}

			<!-- Comments: the composer first, then the newest-first list (D12). -->
			<Card>
				<div class="space-y-3 p-4">
					<SectionH>Comments</SectionH>

					{#if form?.commentError}
						<p class="text-clay text-sm">{form.commentError}</p>
					{/if}

					<form
						method="POST"
						action="?/addComment"
						use:enhance={({ cancel }) => {
							if (!commentText.trim()) { cancel(); return; }
							const optimistic: Comment = {
								id: `opt-${Date.now()}`,
								trip: data.trip.id,
								author: '',
								target_type: 'comment',
								target_item: data.item.id,
								comment_text: commentText.trim(),
								status: 'approved',
								created: new Date().toISOString(),
								author_name: data.membership?.display_name || data.membership?.placeholder_name || 'You',
								author_role: data.membership?.role || '',
								// Own avatar resolves on reload (membership isn't avatar-enriched here).
								author_avatar: ''
							};
							optimisticComments = [optimistic, ...optimisticComments];
							commentText = '';
							commentSubmitting = true;
							return async ({ result, update }) => {
								commentSubmitting = false;
								await update({ reset: false });
								// Reloaded data.comments now contains the real record (#122
								// made member reads work) — drop the optimistic copy.
								if (result.type === 'success') optimisticComments = [];
							};
						}}
						class="flex gap-2"
					>
						<textarea
							name="comment_text"
							bind:value={commentText}
							rows="2"
							placeholder="Add a comment…"
							maxlength="5000"
							class="border-line bg-surface text-ink min-h-11 flex-1 resize-none rounded-md border px-3 py-2 text-sm"
						></textarea>
						<button
							type="submit"
							disabled={commentSubmitting || !commentText.trim()}
							class="bg-moss text-paper min-h-11 self-end rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-40"
						>
							Post
						</button>
					</form>

					{#if allComments.length === 0}
						<p class="text-ink-muted text-sm">No comments yet.</p>
					{:else}
						<div class="space-y-3" data-testid="item-comments">
							{#each allComments as c (c.id)}
								<div class="flex gap-2">
									<Avatar img={c.author_avatar} initial={c.author_name || 'Unknown'} alt={c.author_name || 'Unknown'} size={28} />
									<div class="min-w-0 flex-1">
										<div class="flex flex-wrap items-baseline gap-1.5">
											<span class="text-ink text-sm font-semibold">{c.author_name || 'Unknown'}</span>
											{#if c.author_role}
												<span class="text-ink-muted text-[11px]">{titleCase(c.author_role)}</span>
											{/if}
											<span class="text-ink-muted text-[11px]">
												{new Date(c.created.replace(' ', 'T')).toLocaleDateString('en-US', {
													month: 'short', day: 'numeric', timeZone: 'UTC'
												})}
											</span>
										</div>
										<p class="text-ink-soft mt-0.5 text-sm whitespace-pre-wrap">{c.comment_text}</p>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</Card>
		</div>
	</div>
</main>

<ItemActionSheets
	bind:moveOpen={moveSheetOpen}
	bind:skipOpen={skipSheetOpen}
	bind:deleteOpen={deleteSheetOpen}
	canMove={can.canMove}
	canSkip={can.canSkip}
	canDelete={can.canDelete}
	slug={data.trip.slug}
	itemId={data.item.id}
	{typeLabel}
	{docCount}
	days={data.days}
	phases={data.phases}
	currentDay={data.item.day}
	currentPhase={data.item.phase}
	{form}
/>

{#if activeTask}
	<AssignMemberSheet
		bind:open={assignOpen}
		members={data.members}
		taskId={activeTask.id}
		taskTitle={activeTask.title}
		currentAssignee={activeTask.assignee ?? ''}
		assignAction="?/assignTask"
		deleteAction="?/deleteTask"
	/>
{/if}
