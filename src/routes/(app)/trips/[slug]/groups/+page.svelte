<script lang="ts">
	// #332 / ADR-0015 — Money Units ("Groups") home. Discover + manage units: create,
	// edit, leave (self only), delete (whole unit). Settle-up collapse itself renders on
	// the Expenses page; this is the lifecycle surface.
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import NavBar from '$lib/ui/NavBar.svelte';
	import SubTabs from '$lib/ui/SubTabs.svelte';
	import NotificationBell from '$lib/collaboration/components/NotificationBell.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import BottomSheet from '$lib/ui/BottomSheet.svelte';
	import MoneyUnitForm from '$lib/money/components/MoneyUnitForm.svelte';
	import { moneyTabs } from '$lib/money/money-tabs';
	import { toast } from '$lib/shell/stores/toast';
	import type { Notification, MoneyUnitRecord } from '$lib/types';

	let { data, form } = $props();

	let notifications = $state<Notification[]>(untrack(() => data.notifications ?? []));
	let unreadCount = $state(untrack(() => data.unreadCount ?? 0));
	$effect(() => {
		notifications = data.notifications ?? [];
		unreadCount = data.unreadCount ?? 0;
	});

	let me = $derived(data.membership.id);

	function memberName(memberId: string): string {
		const m = data.members.find((mem) => mem.id === memberId);
		if (!m) return 'Unknown';
		if (m.id === me) return 'You';
		return m.display_name || m.placeholder_name || '(member)';
	}
	function unitLabel(unit: MoneyUnitRecord): string {
		return unit.members.map(memberName).join(' & ') || 'Empty group';
	}
	const iAmIn = (unit: MoneyUnitRecord) => unit.members.includes(me);

	let showForm = $state(false);
	let editingUnit = $state<MoneyUnitRecord | null>(null);
	function openCreate() {
		editingUnit = null;
		showForm = true;
	}
	function openEdit(unit: MoneyUnitRecord) {
		editingUnit = unit;
		showForm = true;
	}

	// Inline leave/delete confirmation, one card at a time.
	let confirming = $state<{ id: string; action: 'leave' | 'delete' } | null>(null);
</script>

<NavBar
	title={data.trip.title}
	subtitle={data.trip.location_summary || undefined}
	subtitleStyle="tagline"
	back
	backHref="/trips"
>
	{#snippet right()}
		<NotificationBell bind:notifications bind:unreadCount />
	{/snippet}
</NavBar>
<SubTabs tabs={moneyTabs(data.trip.slug)} />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-24">
	<div class="mb-5">
		<div class="flex items-center justify-between gap-3">
			<h1 class="text-ink text-lg font-semibold">Groups</h1>
			{#if data.moneyUnits.length > 0}
				<Button variant="outline" size="sm" onclick={openCreate}>New group</Button>
			{/if}
		</div>
		<p class="text-ink-muted mt-1 text-sm">
			Group people who share a card. Settle-up nets across the group — splits never change.
		</p>
	</div>

	{#if data.moneyUnits.length === 0}
		<div class="flex flex-col items-center justify-center py-14 text-center">
			<div class="text-ink-muted mb-2 text-3xl">&amp;</div>
			<p class="font-display text-ink-soft text-base italic">No groups yet.</p>
			<p class="text-ink-muted mx-auto mt-2 max-w-xs text-sm">
				If two of you share a card, group them — one payment settles you both, instead of
				settling every pair.
			</p>
			<div class="mt-5">
				<Button variant="primary" size="md" onclick={openCreate}>New group</Button>
			</div>
		</div>
	{:else}
		<div class="space-y-2">
			{#each data.moneyUnits as unit (unit.id)}
				<Card>
					<div class="p-4">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<p class="text-ink truncate text-sm font-medium">{unitLabel(unit)}</p>
								<p class="text-ink-muted mt-0.5 text-xs">
									{#if unit.budget_usd}
										<span class="font-mono">${unit.budget_usd.toFixed(2)}</span> budget (custom)
									{:else}
										Even-share budget
									{/if}
								</p>
							</div>
							{#if confirming?.id !== unit.id}
								<div class="flex flex-shrink-0 items-center gap-3 text-xs font-medium">
									<button type="button" class="text-moss" onclick={() => openEdit(unit)}>Edit</button>
									{#if iAmIn(unit)}
										<button
											type="button"
											class="text-ink-muted hover:text-ink-soft"
											onclick={() => (confirming = { id: unit.id, action: 'leave' })}
										>
											Leave
										</button>
									{/if}
									<button
										type="button"
										class="text-ink-muted hover:text-clay"
										onclick={() => (confirming = { id: unit.id, action: 'delete' })}
									>
										Delete
									</button>
								</div>
							{/if}
						</div>

						{#if confirming?.id === unit.id}
							{@const isDelete = confirming.action === 'delete'}
							<div class="border-line mt-3 border-t pt-3">
								<p class="text-ink-soft text-sm">
									{#if isDelete}
										Delete this group for everyone? This can't be undone.
									{:else}
										Leave this group? The others stay grouped.
									{/if}
								</p>
								<div class="mt-2 flex gap-2">
									<form
										method="POST"
										action={isDelete ? '?/deleteMoneyUnit' : '?/leaveMoneyUnit'}
										use:enhance={() => {
											return async ({ result, update }) => {
												if (result.type === 'success') {
													toast.show(isDelete ? 'Group deleted' : 'You left the group');
												}
												confirming = null;
												await update({ reset: false });
											};
										}}
									>
										<input type="hidden" name="unit_id" value={unit.id} />
										<button
											type="submit"
											class="{isDelete
												? 'bg-clay text-paper'
												: 'bg-surface-2 text-ink border-line border'} rounded-md px-3 py-1.5 text-sm font-medium"
										>
											{isDelete ? 'Delete' : 'Leave'}
										</button>
									</form>
									<button
										type="button"
										class="text-ink-muted px-3 py-1.5 text-sm font-medium"
										onclick={() => (confirming = null)}
									>
										Cancel
									</button>
								</div>
							</div>
						{/if}
					</div>
				</Card>
			{/each}
		</div>
	{/if}
</main>

<BottomSheet bind:open={showForm} title={editingUnit ? 'Edit group' : 'New group'}>
	{#key editingUnit?.id ?? 'new'}
		{#if showForm}
			<MoneyUnitForm
				members={data.members}
				membershipId={me}
				units={data.moneyUnits}
				unit={editingUnit}
				{form}
				onclose={() => (showForm = false)}
			/>
		{/if}
	{/key}
</BottomSheet>
