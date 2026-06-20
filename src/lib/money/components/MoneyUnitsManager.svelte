<script lang="ts">
	// #230 / ADR-0015 — manage Money Units: a shared, trip-scoped pool of members who pool
	// money. Create a pool (multi-select members), set an OPTIONAL absolute budget override
	// (blank = even-share default), or leave/delete. Split is never affected — this only
	// groups members for the settle-up collapse + the per-unit glance. Progressive-
	// enhancement form actions (saveMoneyUnit / deleteMoneyUnit), never client fetch.
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import Button from '$lib/ui/Button.svelte';
	import { toast } from '$lib/shell/stores/toast';
	import type { TripMember, MoneyUnitRecord } from '$lib/types';

	interface Props {
		members: TripMember[];
		membershipId: string;
		units: MoneyUnitRecord[];
		form: Record<string, unknown> | null;
	}

	let { members, membershipId, units, form: formProp }: Props = $props();

	function memberName(memberId: string): string {
		const m = members.find((mem) => mem.id === memberId);
		if (!m) return 'Unknown';
		if (m.id === membershipId) return 'You';
		return m.display_name || m.placeholder_name || '(member)';
	}

	/** Label a unit by its members, e.g. "You & Abby". */
	function unitLabel(unit: MoneyUnitRecord): string {
		return unit.members.map(memberName).join(' & ') || 'Empty unit';
	}

	// Which member ids are already in SOME unit — used to keep the create form honest
	// (a member is one node; the pure layer takes the first unit, but the UI nudges away
	// from double-adds).
	let assignedElsewhere = $derived(new Set(units.flatMap((u) => u.members)));

	// New-unit form state. Default the creator into their own new pool (one-time seed from
	// the prop — untrack mirrors ExpenseForm's prop-seeded $state pattern).
	let creating = $state(false);
	let newMembers = $state<Set<string>>(untrack(() => new Set([membershipId])));
	let newBudget = $state('');
	let submitting = $state(false);

	function toggleNew(id: string) {
		const next = new Set(newMembers);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		newMembers = next;
	}

	const saveError = $derived(
		formProp?.saveMoneyUnit && 'error' in (formProp.saveMoneyUnit as Record<string, unknown>)
			? (formProp.saveMoneyUnit as Record<string, string>).error
			: ''
	);
</script>

<div class="space-y-3">
	{#if units.length > 0}
		<div class="space-y-2">
			{#each units as unit (unit.id)}
				<div class="border-line bg-surface flex items-center justify-between rounded-lg border px-4 py-3">
					<div class="min-w-0">
						<p class="text-ink truncate text-sm font-medium">{unitLabel(unit)}</p>
						<p class="text-ink-muted text-xs">
							{#if unit.budget_usd != null}
								Budget ${unit.budget_usd.toFixed(2)} (custom)
							{:else}
								Even-share budget
							{/if}
						</p>
					</div>
					<form
						method="POST"
						action="?/deleteMoneyUnit"
						use:enhance={() => {
							return async ({ result, update }) => {
								if (result.type === 'success') toast.show('Money unit removed');
								await update({ reset: false });
							};
						}}
					>
						<input type="hidden" name="unit_id" value={unit.id} />
						<button type="submit" class="text-ink-muted hover:text-clay text-xs font-medium">
							Remove
						</button>
					</form>
				</div>
			{/each}
		</div>
	{:else}
		<p class="text-ink-muted text-sm">
			No money units yet. Group members who share a card so settle-up nets across the group
			instead of between every pair.
		</p>
	{/if}

	{#if creating}
		<form
			method="POST"
			action="?/saveMoneyUnit"
			class="border-line rounded-lg border p-3 space-y-3"
			use:enhance={() => {
				submitting = true;
				return async ({ result, update }) => {
					submitting = false;
					if (result.type === 'success') {
						toast.show('Money unit saved');
						creating = false;
						newMembers = new Set([membershipId]);
						newBudget = '';
					}
					await update({ reset: false });
				};
			}}
		>
			<p class="text-ink-muted text-xs font-medium">Members in this unit</p>
			<div class="space-y-1.5">
				{#each members as member (member.id)}
					<label class="flex items-center gap-2 cursor-pointer">
						<input
							type="checkbox"
							checked={newMembers.has(member.id)}
							onchange={() => toggleNew(member.id)}
							class="border-line text-moss accent-moss h-4 w-4 rounded"
						/>
						<span class="text-ink text-sm">{memberName(member.id)}</span>
						{#if assignedElsewhere.has(member.id)}
							<span class="text-ink-muted text-[11px]">(in another unit)</span>
						{/if}
					</label>
				{/each}
			</div>

			<div>
				<label for="unit-budget" class="text-ink-muted mb-1 block text-xs font-medium">
					Custom budget (optional)
				</label>
				<input
					id="unit-budget"
					name="budget_usd"
					type="number"
					step="0.01"
					min="0"
					bind:value={newBudget}
					placeholder="Even-share default"
					class="border-line bg-surface text-ink placeholder:text-ink-muted/40 focus:border-moss w-full rounded-md border px-3 py-2 font-mono text-sm focus:outline-none"
				/>
				<p class="text-ink-muted mt-1 text-[11px]">
					Absolute target — it doesn't change the group budget or other units.
				</p>
			</div>

			<input type="hidden" name="members" value={[...newMembers].join(',')} />

			{#if saveError}
				<p role="alert" class="text-error text-sm">{saveError}</p>
			{/if}

			<div class="flex gap-2">
				<Button type="submit" variant="primary" size="sm" disabled={submitting} loading={submitting}>
					{submitting ? 'Saving...' : 'Save unit'}
				</Button>
				<Button type="button" variant="ghost" size="sm" onclick={() => (creating = false)}>
					Cancel
				</Button>
			</div>
		</form>
	{:else}
		<button
			type="button"
			class="text-moss text-sm font-medium"
			onclick={() => (creating = true)}
		>
			+ New money unit
		</button>
	{/if}
</div>
