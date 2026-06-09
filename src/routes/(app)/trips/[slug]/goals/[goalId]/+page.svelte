<script lang="ts">
	import { enhance } from '$app/forms';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Avatar from '$lib/ui/Avatar.svelte';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import BottomSheet from '$lib/ui/BottomSheet.svelte';
	import { memberDisplayName, memberInitial } from '$lib/itinerary/member-name';
	import type { GoalStatus, Item } from '$lib/types';

	let { data, form } = $props();

	let linkOpen = $state(false);
	let confirmDelete = $state(false);

	const goal = $derived(data.goal);
	const author = $derived(goal.expand?.created_by ?? null);

	// Status presentation — the derived status drives the tinted block + each
	// linked item's pill. "considered" reads as set-aside (neutral), not a win.
	const STATUS_META: Record<GoalStatus, { label: string; tint: string; pill: string }> = {
		done: { label: 'Done', tint: 'bg-moss-tint', pill: 'bg-moss-tint text-moss' },
		planned: { label: 'Planned', tint: 'bg-sky-tint', pill: 'bg-sky-tint text-sky' },
		unplanned: { label: 'Unplanned', tint: 'bg-gold-tint', pill: 'bg-gold-tint text-gold-deep' },
		considered: { label: 'Considered', tint: 'bg-surface-2', pill: 'bg-surface-2 text-ink-muted' }
	};

	const meta = $derived(STATUS_META[data.derivedStatus]);
	const linkedCount = $derived(data.linkedItems.length);

	function itemContext(item: Pick<Item, 'phase' | 'day' | 'status'>) {
		const parts: string[] = [];
		const phase = data.phases.find((p) => p.id === item.phase);
		if (phase) parts.push(phase.name);
		const day = data.days.find((d) => d.id === item.day);
		if (day) {
			parts.push(
				new Date(day.date.replace(' ', 'T')).toLocaleDateString('en-US', {
					weekday: 'short',
					month: 'short',
					day: 'numeric',
					timeZone: 'UTC'
				})
			);
		}
		return parts.length > 0 ? parts.join(' · ') : 'Unscheduled';
	}
</script>

<NavBar
	title="Goal"
	subtitle={data.trip.title}
	back
	backHref="/trips/{data.trip.slug}/goals"
/>

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8 space-y-4">
	{#if form?.error}
		<div role="alert" class="border-error/30 bg-error/10 text-error-deep rounded-md border p-3 text-sm">
			{form.error}
		</div>
	{/if}

	<!-- Byline → title (firm order, V4 PRD handoff screen D). -->
	<div>
		<div class="text-ink-muted flex items-center gap-2 text-[12px]">
			<Avatar initial={memberInitial(author)} alt={memberDisplayName(author)} size={22} />
			<span>{memberDisplayName(author)}'s wish</span>
		</div>
		<h1 class="font-display text-ink mt-2 text-[24px] font-semibold leading-tight">{goal.title}</h1>
		{#if goal.description}
			<p class="text-ink-soft mt-1.5 text-sm">{goal.description}</p>
		{/if}
	</div>

	<!-- Status block — tinted, badge + "· AUTO" when derived, plus an explainer. -->
	<div class="rounded-[14px] {meta.tint} p-4">
		<div class="flex items-center gap-1.5">
			<span
				class="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold tracking-wide uppercase {meta.pill}"
			>
				{meta.label}
			</span>
			{#if data.isDerived}
				<span class="text-ink-muted text-[10.5px] font-bold tracking-[0.15em] uppercase">· Auto</span>
			{/if}
		</div>
		<p class="text-ink-soft mt-2 text-[12.5px]">
			{#if data.isDerived}
				Set automatically from {linkedCount} linked plan{linkedCount === 1 ? '' : 's'}. Link more
				plans and it keeps itself honest.
			{:else}
				Set manually — link a plan below and this goal will track its progress on its own.
			{/if}
		</p>
	</div>

	<!-- #77 slot: "What the group thinks" goal-vote results panel mounts here,
	     between the status block and the plans list (V4 PRD firm order). -->

	<!-- Plans addressing it — the traceability list. -->
	<section>
		<h2 class="text-moss mb-2 px-0.5 text-[11px] font-bold tracking-[0.2em] uppercase">
			Plans addressing it
		</h2>
		{#if linkedCount > 0}
			<Card>
				{#each data.linkedItems as item, i (item.id)}
					{@const im = STATUS_META[item.status]}
					<div
						class="flex items-center gap-3 px-[15px] py-[13px] {i < linkedCount - 1
							? 'border-line border-b'
							: ''}"
					>
						<TypeIcon type={item.type} size={28} />
						<a href="/trips/{data.trip.slug}/items/{item.id}" class="min-w-0 flex-1">
							<div class="text-ink truncate text-[14.5px] font-semibold">{item.title}</div>
							<div class="text-ink-muted mt-0.5 text-[11px]">{itemContext(item)}</div>
						</a>
						<span
							class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold tracking-wide uppercase {im.pill}"
						>
							{im.label}
						</span>
						{#if data.canEdit}
							<form method="POST" action="?/unlink" use:enhance class="shrink-0">
								<input type="hidden" name="item_id" value={item.id} />
								<button
									type="submit"
									aria-label="Unlink {item.title}"
									class="text-ink-muted hover:text-clay p-1"
								>
									<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
										<path d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							</form>
						{/if}
					</div>
				{/each}
			</Card>
		{:else}
			<div
				class="border-line text-ink-muted rounded-[14px] border-[1.5px] border-dashed px-4 py-6 text-center text-[13px]"
			>
				No plans linked yet. Link an item and this goal starts tracking it.
			</div>
		{/if}
	</section>

	<!-- Actions. -->
	{#if data.canEdit}
		<div class="space-y-3">
			<Button type="button" variant="moss" size="md" class="w-full" onclick={() => (linkOpen = true)}>
				Link an item
			</Button>

			<!-- Manual status only while the goal has zero links (otherwise derived wins). -->
			{#if !data.isDerived}
				<Card>
					<form
						method="POST"
						action="?/setStatus"
						use:enhance
						class="flex items-end gap-2 p-4"
					>
						<div class="flex-1">
							<label for="manual_status" class="text-ink-soft block text-sm font-medium">
								Set status
							</label>
							<select
								id="manual_status"
								name="manual_status"
								class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
							>
								<option value="unplanned" selected={goal.manual_status === 'unplanned'}>Unplanned</option>
								<option value="planned" selected={goal.manual_status === 'planned'}>Planned</option>
								<option value="done" selected={goal.manual_status === 'done'}>Done</option>
								<option value="considered" selected={goal.manual_status === 'considered'}>Considered</option>
							</select>
						</div>
						<Button type="submit" variant="primary" size="md">Save</Button>
					</form>
				</Card>
			{/if}
		</div>
	{/if}

	{#if data.canDelete}
		<div class="border-clay/30 rounded-lg border p-4">
			<h3 class="text-clay text-sm font-semibold">Delete goal</h3>
			{#if !confirmDelete}
				<button
					type="button"
					onclick={() => (confirmDelete = true)}
					class="border-clay/40 text-clay hover:bg-clay/10 mt-2 rounded-md border px-3 py-1.5 text-sm font-semibold"
				>
					Delete
				</button>
			{:else}
				<form method="POST" action="?/delete" use:enhance class="mt-2 flex items-center gap-2">
					<button
						type="submit"
						class="bg-clay text-paper hover:bg-clay/90 rounded-md px-3 py-1.5 text-sm font-semibold"
					>
						Confirm delete
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
	{/if}
</main>

<BottomSheet bind:open={linkOpen} title="Link an item">
	{#if data.linkCandidates.length === 0}
		<p class="text-ink-muted py-4 text-center text-sm">
			No more items to link. Every plan on this trip is already attached.
		</p>
	{:else}
		<div class="space-y-1">
			{#each data.linkCandidates as item (item.id)}
				<form
					method="POST"
					action="?/link"
					use:enhance={() => {
						return async ({ result, update }) => {
							if (result.type === 'success') linkOpen = false;
							await update();
						};
					}}
				>
					<input type="hidden" name="item_id" value={item.id} />
					<button
						type="submit"
						class="hover:bg-surface-2 flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2.5 text-left"
					>
						<TypeIcon type={item.type} size={26} />
						<div class="min-w-0 flex-1">
							<div class="text-ink truncate text-[14px] font-semibold">{item.title}</div>
							<div class="text-ink-muted text-[11px]">{itemContext(item)}</div>
						</div>
					</button>
				</form>
			{/each}
		</div>
	{/if}
</BottomSheet>
