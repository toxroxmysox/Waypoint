<script lang="ts">
	import { enhance } from '$app/forms';
	import { itemFieldConfig, itemTypeLabels } from '$lib/config/item-fields';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Pill from '$lib/components/ui/Pill.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import SectionH from '$lib/components/ui/SectionH.svelte';
	import TypeIcon from '$lib/components/ui/TypeIcon.svelte';
	import PhaseChip from '$lib/components/ui/PhaseChip.svelte';
	import { titleCase, formatTime } from '$lib/utils/format';
	import { toast } from '$lib/stores/toast';

	import VoteButtons from '$lib/components/VoteButtons.svelte';
	import MoveItemSheet from '$lib/components/MoveItemSheet.svelte';
	import type { Comment } from '$lib/types';

	let { data, form } = $props();

	let fields = $derived(itemFieldConfig[data.item.type]);
	let confirmDelete = $state(false);
	let deleting = $state(false);
	let moveSheetOpen = $state(false);
	let promoteLoading = $state(false);
	let demoteLoading = $state(false);
	const isAlternate = $derived(data.item.rank > 0);
	const isPrimary = $derived(data.item.rank === 0 && data.alternates.length > 0);
	const itemUrl = $derived(`/trips/${data.trip.slug}/items/${data.item.id}`);

	// Comments
	let commentText = $state('');
	let commentSubmitting = $state(false);
	let optimisticComments = $state<Comment[]>([]);
	let allComments = $derived([...data.comments, ...optimisticComments]);

	function memberName(memberId: string): string {
		const member = data.members.find((m) => m.id === memberId);
		if (!member) return 'Unknown';
		return (
			member.display_name ||
			member.expand?.user?.name ||
			member.expand?.user?.email ||
			member.placeholder_name ||
			'Unknown'
		);
	}

	let backHref = $derived(
		data.itemDay
			? `/trips/${data.trip.slug}/days/${data.itemDay.id}`
			: `/trips/${data.trip.slug}`
	);
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

<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-8 space-y-4">
	<!-- Header card -->
	<Card>
		<div class="p-4">
			<div class="flex items-start gap-3">
				<TypeIcon type={data.item.type} sub={data.item.subtype} size={44} />
				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-center gap-1.5">
						<Pill variant="default" size="sm">{itemTypeLabels[data.item.type]}</Pill>
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
						<VoteButtons
							voteCount={data.votes.length}
							myVoteId={data.myVote?.id ?? null}
							{itemUrl}
						/>
						{#if isAlternate}
							<form
								method="POST"
								action="?/promote"
								use:enhance={() => {
									promoteLoading = true;
									return async ({ update, result }) => {
										promoteLoading = false;
										if (result.type === 'success') toast.show('Item promoted');
										await update();
									};
								}}
							>
								<button
									type="submit"
									disabled={promoteLoading}
									class="border-moss/40 text-moss hover:bg-moss/10 rounded-full border px-3 py-1 text-xs font-semibold"
								>
									{promoteLoading ? '...' : 'Promote to primary'}
								</button>
							</form>
						{/if}
						{#if isPrimary}
							<form
								method="POST"
								action="?/demote"
								use:enhance={() => {
									demoteLoading = true;
									return async ({ update, result }) => {
										demoteLoading = false;
										if (result.type === 'success') toast.show('Item demoted');
										await update();
									};
								}}
							>
								<button
									type="submit"
									disabled={demoteLoading}
									class="border-clay/40 text-clay hover:bg-clay/10 rounded-full border px-3 py-1 text-xs font-semibold"
								>
									{demoteLoading ? '...' : 'Demote'}
								</button>
							</form>
						{/if}
					</div>
				</div>
			</div>

			{#if data.item.description}
				<p class="text-ink-soft mt-3 text-sm whitespace-pre-wrap">{data.item.description}</p>
			{/if}
		</div>
	</Card>

	<!-- Schedule -->
	{#if data.itemDay || data.itemPhase || (fields.times && data.item.start_time)}
		<Card>
			<div class="p-4 space-y-2">
				<SectionH>Schedule</SectionH>
				{#if data.itemDay}
					<p class="text-ink text-sm">
						{new Date(data.itemDay.date.replace(' ', 'T')).toLocaleDateString('en-US', {
							weekday: 'long',
							month: 'long',
							day: 'numeric',
							timeZone: 'UTC'
						})}
						<span class="text-ink-muted">· {titleCase(data.item.slot)}</span>
					</p>
				{/if}
				{#if data.itemPhase}
					<p class="text-ink-muted flex items-center gap-1.5 text-sm">
						<PhaseChip name={data.itemPhase.name} color={data.itemPhase.color} size={16} />
						{data.itemPhase.name}
					</p>
				{/if}
				{#if fields.times && data.item.start_time}
					<p class="font-mono text-ink text-sm">
						{formatTime(data.item.start_time)}{data.item.end_time
							? ` – ${formatTime(data.item.end_time)}`
							: ''}
					</p>
				{/if}
			</div>
		</Card>
	{/if}

	{#if data.alternates.length > 0}
		<Card>
			<div class="p-4 space-y-2">
				<SectionH>
					{#snippet right()}
						<span class="text-ink-muted text-xs">{data.alternates.length} alternate{data.alternates.length === 1 ? '' : 's'}</span>
					{/snippet}
					Alternates
				</SectionH>
				{#each data.alternates as alt}
					<a
						href="/trips/{data.trip.slug}/items/{alt.id}"
						class="border-line hover:border-ink-muted flex items-center gap-3 rounded-lg border p-3"
					>
						<TypeIcon type={alt.type} sub={alt.subtype} size={28} />
						<div class="min-w-0 flex-1">
							<p class="text-ink text-sm font-semibold truncate">{alt.title}</p>
							{#if alt.location_name}
								<p class="text-ink-muted text-[12px] truncate">{alt.location_name}</p>
							{/if}
						</div>
						<span class="text-ink-muted text-[11px]">Rank {alt.rank}</span>
					</a>
				{/each}
			</div>
		</Card>
	{/if}

	<!-- Location -->
	{#if fields.location && (data.item.location_name || data.item.location_address)}
		<Card>
			<div class="p-4 space-y-1">
				<SectionH>Location</SectionH>
				{#if data.item.location_name}
					<p class="text-ink text-sm font-semibold">{data.item.location_name}</p>
				{/if}
				{#if data.item.location_address}
					<p class="text-ink-soft text-sm">{data.item.location_address}</p>
				{/if}
			</div>
		</Card>
	{/if}

	<!-- Booking -->
	{#if fields.booking && (data.item.booked || data.item.reservation_url || data.item.confirmation_codes.length > 0)}
		<Card>
			<div class="p-4 space-y-2">
				<SectionH>Booking</SectionH>
				{#if data.item.reservation_url}
					<a
						href={data.item.reservation_url}
						target="_blank"
						rel="noopener"
						class="text-sky block truncate text-sm hover:underline"
					>
						{data.item.reservation_url}
					</a>
				{/if}
				{#if data.item.free_cancellation}
					<p class="text-moss text-xs font-semibold">Free cancellation</p>
				{/if}
				{#if data.item.confirmation_codes.length > 0}
					<div class="space-y-1">
						{#each data.item.confirmation_codes as code}
							<div class="bg-surface-2 flex items-center justify-between rounded px-2 py-1.5">
								<span class="text-ink-muted text-xs uppercase tracking-wide">{code.label}</span>
								<span class="font-mono text-ink text-sm">{code.value}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</Card>
	{/if}

	<!-- Costs -->
	{#if fields.costs && (data.item.cost_estimate_usd || data.item.cost_actual_usd)}
		<Card>
			<div class="p-4">
				<SectionH>Costs</SectionH>
				<div class="mt-2 grid grid-cols-2 gap-4">
					{#if data.item.cost_estimate_usd}
						<div>
							<p class="text-ink-muted text-[11px] uppercase tracking-wide">Estimate</p>
							<p class="font-mono text-ink text-sm font-semibold">
								${data.item.cost_estimate_usd.toFixed(2)}
							</p>
						</div>
					{/if}
					{#if data.item.cost_actual_usd}
						<div>
							<p class="text-ink-muted text-[11px] uppercase tracking-wide">Actual</p>
							<p class="font-mono text-ink text-sm font-semibold">
								${data.item.cost_actual_usd.toFixed(2)}
							</p>
						</div>
					{/if}
				</div>
			</div>
		</Card>
	{/if}

	<!-- Checklist -->
	{#if data.item.type === 'checklist'}
		<Card>
			<div class="p-4">
				<SectionH>
					{#snippet right()}
						{#if data.checklistItems.length > 0}
							<span class="font-mono"
								>{data.checklistItems.filter((ci) => ci.checked_by).length}/{data.checklistItems
									.length}</span
							>
						{/if}
					{/snippet}
					Checklist
				</SectionH>

				{#if data.checklistItems.length > 0}
					<div class="mt-2 space-y-1">
						{#each data.checklistItems as ci, i}
							<div class="flex items-center gap-1">
								<form method="POST" action="?/toggleChecklistItem" use:enhance>
									<input type="hidden" name="ci_id" value={ci.id} />
									<button
										type="submit"
										class="flex items-center"
										aria-label={ci.checked_by ? 'Uncheck' : 'Check'}
									>
										<span
											class="flex h-5 w-5 items-center justify-center rounded border
												{ci.checked_by
												? 'border-ink bg-ink text-paper'
												: 'border-line bg-surface hover:border-ink-muted'}"
										>
											{#if ci.checked_by}
												<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
													<path d="M5 13l4 4L19 7" />
												</svg>
											{/if}
										</span>
									</button>
								</form>
								<span
									class="flex-1 px-2 text-sm {ci.checked_by
										? 'text-ink-muted line-through'
										: 'text-ink-soft'}"
								>
									{ci.text}
								</span>
								{#if i > 0}
									<form method="POST" action="?/reorderChecklistItem" use:enhance>
										<input type="hidden" name="ci_id" value={ci.id} />
										<input type="hidden" name="direction" value="up" />
										<button
											type="submit"
											class="text-ink-muted hover:bg-surface-2 hover:text-ink-soft rounded p-1"
											title="Move up"
											aria-label="Move up"
										>
											<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
												<path d="M5 15l7-7 7 7" />
											</svg>
										</button>
									</form>
								{/if}
								{#if i < data.checklistItems.length - 1}
									<form method="POST" action="?/reorderChecklistItem" use:enhance>
										<input type="hidden" name="ci_id" value={ci.id} />
										<input type="hidden" name="direction" value="down" />
										<button
											type="submit"
											class="text-ink-muted hover:bg-surface-2 hover:text-ink-soft rounded p-1"
											title="Move down"
											aria-label="Move down"
										>
											<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
												<path d="M19 9l-7 7-7-7" />
											</svg>
										</button>
									</form>
								{/if}
								<form method="POST" action="?/deleteChecklistItem" use:enhance>
									<input type="hidden" name="ci_id" value={ci.id} />
									<button
										type="submit"
										class="text-ink-muted hover:bg-clay/10 hover:text-clay rounded p-1"
										title="Delete"
										aria-label="Delete"
									>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<path d="M6 18L18 6M6 6l12 12" />
										</svg>
									</button>
								</form>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-ink-muted mt-2 text-xs italic">No items yet.</p>
				{/if}

				<form
					method="POST"
					action="?/addChecklistItem"
					use:enhance={() =>
						async ({ result, update, formElement }) => {
							await update({ reset: false });
							if (result.type === 'success') {
								formElement.reset();
							}
						}}
					class="mt-3 flex gap-2"
				>
					<input
						type="text"
						name="text"
						required
						placeholder="Add item…"
						class="border-line bg-surface text-ink flex-1 rounded-md border px-2 py-1.5 text-sm"
					/>
					<Button type="submit" variant="primary" size="sm">Add</Button>
				</form>
			</div>
		</Card>
	{/if}

	<!-- Assigned to -->
	{#if data.item.assigned_to.length > 0}
		<Card>
			<div class="p-4">
				<SectionH>Assigned to</SectionH>
				<div class="mt-2 flex flex-wrap gap-2">
					{#each data.item.assigned_to as memberId}
						<Pill variant="default" size="md">{memberName(memberId)}</Pill>
					{/each}
				</div>
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
						author_role: data.membership?.role || ''
					};
					optimisticComments = [...optimisticComments, optimistic];
					commentText = '';
					commentSubmitting = true;
					return async ({ update }) => {
						commentSubmitting = false;
						await update({ reset: false });
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
	currentSlot={data.item.slot}
	currentPhase={data.item.phase}
	actionUrl={itemUrl}
/>
