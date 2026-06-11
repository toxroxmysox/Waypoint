<script lang="ts">
	import { enhance } from '$app/forms';
	import { getFieldConfig } from '$lib/itinerary/item-fields';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import Button from '$lib/ui/Button.svelte';
	import SectionH from '$lib/ui/SectionH.svelte';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import { titleCase } from '$lib/shell/format';
	import ItemForm from '$lib/itinerary/components/ItemForm.svelte';

	import VoteButtons from '$lib/collaboration/components/VoteButtons.svelte';
	import MoveItemSheet from '$lib/itinerary/components/MoveItemSheet.svelte';
	import ChecklistBody from '$lib/itinerary/components/ChecklistBody.svelte';
	import AssignMemberSheet from '$lib/itinerary/components/AssignMemberSheet.svelte';
	import Avatar from '$lib/ui/Avatar.svelte';
	import DocumentSection from '$lib/documents/components/DocumentSection.svelte';
	import type { Comment, Task } from '$lib/types';

	let { data, form } = $props();

	let confirmDelete = $state(false);
	let deleting = $state(false);
	let moveSheetOpen = $state(false);
	const itemUrl = $derived(`/trips/${data.trip.slug}/items/${data.item.id}`);
	const docCount = $derived(data.documents.length);
	const typeLabel = $derived(getFieldConfig(data.item.type).labels.typeLabel.toLowerCase());

	// Comments
	let commentText = $state('');
	let commentSubmitting = $state(false);
	let optimisticComments = $state<Comment[]>([]);
	// Newest first: pending optimistic comments on top of the (-created) server list.
	let allComments = $derived([...optimisticComments, ...data.comments]);

	let backHref = $derived(
		data.itemDay
			? `/trips/${data.trip.slug}/days/${data.itemDay.id}`
			: `/trips/${data.trip.slug}`
	);

	// Inline checklist (ledger, issue #55)
	const doneCount = $derived(data.tasks.filter((t) => t.checked).length);
	let assignOpen = $state(false);
	let activeTask = $state<Task | null>(null);

	function openAssign(task: Task) {
		activeTask = task;
		assignOpen = true;
	}
</script>

<NavBar title={data.item.title} subtitle={data.trip.title} back {backHref}>
	{#snippet right()}
		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={() => (moveSheetOpen = true)}
				class="border-line text-ink-muted hover:text-ink-soft rounded-md border px-3 py-1.5 text-xs font-semibold"
			>
				Move
			</button>
			<a
				href="/trips/{data.trip.slug}/items/{data.item.id}/edit"
				class="text-ink-soft hover:text-ink text-[12px] font-semibold"
			>
				Edit
			</a>
		</div>
	{/snippet}
</NavBar>

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8 space-y-4">
	<!-- Header card -->
	<Card>
		<div class="p-4">
			<div class="flex items-start gap-3">
				<TypeIcon type={data.item.type} sub={data.item.subtype} size={44} />
				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-center gap-1.5">
						<Pill variant="default" size="sm">{getFieldConfig(data.item.type).labels.typeLabel}</Pill>
						{#if data.item.subtype}
							<Pill variant="default" size="sm">{titleCase(data.item.subtype)}</Pill>
						{/if}
						{#if data.item.booked}
							<Pill variant="booked" size="sm">Booked</Pill>
						{/if}
						{#if data.item.status === 'done'}
							<Pill variant="info" size="sm">Done</Pill>
						{/if}
					</div>
					<h2 class="font-display text-ink mt-2 text-xl leading-tight font-semibold">
						{data.item.title}
					</h2>
					<div class="mt-3 flex items-center gap-3">
						<VoteButtons myVote={data.myVote} {itemUrl} />
					</div>
				</div>
			</div>

			{#if data.item.description}
				<p class="text-ink-soft mt-3 text-sm whitespace-pre-wrap">{data.item.description}</p>
			{/if}
		</div>
	</Card>

	<ItemForm
		mode="view"
		initialData={{
			type: data.item.type,
			subtype: data.item.subtype ?? '',
			title: data.item.title,
			description: '',
			day: data.item.day ?? '',
			phase: data.item.phase ?? '',
			start_time: data.item.start_time ?? '',
			end_time: data.item.end_time ?? '',
			end_date: data.item.end_date ?? '',
			location_name: data.item.location_name ?? '',
			location_address: data.item.location_address ?? '',
			location_coords: data.item.location_coords ?? null,
			google_place_id: data.item.google_place_id ?? '',
			booked: data.item.booked ?? false,
			requires_booking: data.item.requires_booking ?? false,
			reservation_url: data.item.reservation_url ?? '',
			free_cancellation: data.item.free_cancellation ?? false,
			cost_estimate_usd: data.item.cost_estimate_usd ?? 0,
			cost_actual_usd: data.item.cost_actual_usd ?? 0,
			confirmation_codes: data.item.confirmation_codes ?? [],
			assigned_to: data.item.assigned_to ?? [],
			status: data.item.status ?? 'planned',
			linked_goal_ids: []
		}}
		context={{
			days: data.days ?? [],
			phases: data.phases ?? [],
			members: data.members,
			tripStartDate: '',
			tripEndDate: ''
		}}
	/>

	<!-- Documents — artifacts attached to this item (codes stay on the item above). -->
	<DocumentSection
		docs={data.documents}
		itemId={data.item.id}
		membershipId={data.membership.id}
		role={data.membership.role}
	/>

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
			/>

			<div class="text-ink-muted mt-3 flex items-center gap-1.5 px-1">
				<svg width="13" height="13" viewBox="0 0 20 20" fill="none">
					<path d="M10 2L11.5 7L16 8L11.5 9L10 14L8.5 9L4 8L8.5 7L10 2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
				</svg>
				<span class="font-display text-[11px] italic">This list lives on the item — it travels with it.</span>
			</div>

			<form method="POST" action="?/deleteChecklist" use:enhance class="mt-2 px-1">
				<input type="hidden" name="checklist_id" value={data.checklist.id} />
				<button type="submit" class="text-ink-muted hover:text-clay text-xs"> Remove checklist </button>
			</form>
		</div>
	{:else}
		<Card>
			<div class="p-4">
				<SectionH>Checklist</SectionH>
				<p class="text-ink-muted mt-2 text-xs">Track packing, groceries, or to-dos for this item.</p>
				<form method="POST" action="?/attachChecklist" use:enhance class="mt-3">
					<Button type="submit" variant="moss" size="sm">Add checklist</Button>
				</form>
			</div>
		</Card>
	{/if}

	<!-- Comment thread -->
	<Card>
		<div class="p-4 space-y-3">
			<SectionH>Comments</SectionH>

			{#if allComments.length === 0}
				<p class="text-ink-muted text-sm">No comments yet.</p>
			{:else}
				<div class="space-y-3">
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
				class="flex gap-2 pt-1"
			>
				<textarea
					name="comment_text"
					bind:value={commentText}
					rows="2"
					placeholder="Add a comment…"
					maxlength="5000"
					class="border-line bg-surface text-ink flex-1 rounded-md border px-3 py-2 text-sm resize-none"
				></textarea>
				<button
					type="submit"
					disabled={commentSubmitting || !commentText.trim()}
					class="bg-moss text-paper self-end rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-40"
				>
					Post
				</button>
			</form>
		</div>
	</Card>

	<!-- Delete -->
	<div class="border-clay/30 rounded-lg border p-4">
		<h3 class="text-clay text-sm font-semibold">Delete item</h3>
		{#if !confirmDelete}
			<button
				type="button"
				onclick={() => (confirmDelete = true)}
				class="border-clay/40 text-clay hover:bg-clay/10 mt-2 rounded-md border px-3 py-1.5 text-sm font-semibold"
			>
				Delete
			</button>
		{:else}
			<p class="text-ink-soft mt-2 text-sm">
				{#if docCount > 0}
					Delete this {typeLabel} and its {docCount} document{docCount === 1 ? '' : 's'}? This can't be undone.
				{:else}
					Delete this {typeLabel}? This can't be undone.
				{/if}
			</p>
			<form
				method="POST"
				action="?/delete"
				use:enhance={() => {
					deleting = true;
					return async ({ update }) => {
						await update();
						deleting = false;
					};
				}}
				class="mt-2 flex items-center gap-2"
			>
				<button
					type="submit"
					disabled={deleting}
					class="bg-clay text-paper hover:bg-clay/90 rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
				>
					{deleting ? 'Deleting…' : 'Confirm'}
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
</main>

<MoveItemSheet
	bind:open={moveSheetOpen}
	days={data.days}
	phases={data.phases}
	currentDay={data.item.day}
	currentPhase={data.item.phase}
	actionUrl={itemUrl}
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
