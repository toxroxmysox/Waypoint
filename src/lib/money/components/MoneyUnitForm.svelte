<script lang="ts">
	// #332 / ADR-0015 — create OR edit a money unit. Multi-select members + optional
	// absolute budget. Progressive-enhancement (?/saveMoneyUnit), never client fetch.
	// `unit` present = edit (prefill + hidden unit_id); absent = create (seed with self).
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import Button from '$lib/ui/Button.svelte';
	import { toast } from '$lib/shell/stores/toast';
	import type { TripMember, MoneyUnitRecord } from '$lib/types';

	interface Props {
		members: TripMember[];
		membershipId: string;
		units: MoneyUnitRecord[];
		unit?: MoneyUnitRecord | null;
		form: Record<string, unknown> | null;
		onclose: () => void;
	}

	let { members, membershipId, units, unit = null, form: formProp, onclose }: Props = $props();

	function memberName(memberId: string): string {
		const m = members.find((mem) => mem.id === memberId);
		if (!m) return 'Unknown';
		if (m.id === membershipId) return 'You';
		return m.display_name || m.placeholder_name || '(member)';
	}

	// Members already in ANOTHER unit — a member is one node, so the UI nudges away from
	// double-adds (exclude the unit currently being edited from that set).
	let assignedElsewhere = $derived(
		new Set(units.filter((u) => u.id !== unit?.id).flatMap((u) => u.members))
	);

	// Seed: edit → the unit's members; create → just me. untrack mirrors the prop-seeded
	// $state pattern used across the money forms.
	let selected = $state<Set<string>>(
		untrack(() => new Set(unit ? unit.members : [membershipId]))
	);
	// PB stores unset number fields as 0 (can't hold null), so treat 0 as "no custom
	// budget" — prefill blank, not "0", when there's no real override.
	let budget = $state(untrack(() => (unit?.budget_usd ? String(unit.budget_usd) : '')));
	let submitting = $state(false);

	function toggle(id: string) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}

	const saveError = $derived(
		formProp?.saveMoneyUnit && 'error' in (formProp.saveMoneyUnit as Record<string, unknown>)
			? (formProp.saveMoneyUnit as Record<string, string>).error
			: ''
	);
</script>

<form
	method="POST"
	action="?/saveMoneyUnit"
	class="space-y-4"
	use:enhance={() => {
		submitting = true;
		return async ({ result, update }) => {
			submitting = false;
			if (result.type === 'success') {
				toast.show(unit ? 'Group updated' : 'Group saved');
				onclose();
			}
			await update({ reset: false });
		};
	}}
>
	{#if unit}
		<input type="hidden" name="unit_id" value={unit.id} />
	{/if}

	<div>
		<p class="text-ink-soft mb-2 text-sm font-medium">Who shares a card?</p>
		<div class="space-y-1">
			{#each members as member (member.id)}
				<label class="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-2">
					<input
						type="checkbox"
						checked={selected.has(member.id)}
						onchange={() => toggle(member.id)}
						class="border-line text-moss accent-moss h-4 w-4 rounded"
					/>
					<span class="text-ink text-sm">{memberName(member.id)}</span>
					{#if assignedElsewhere.has(member.id)}
						<span class="text-ink-muted text-[11px]">(in another group)</span>
					{/if}
				</label>
			{/each}
		</div>
	</div>

	<div>
		<label for="unit-budget" class="text-ink-soft mb-1 block text-sm font-medium">
			Custom budget <span class="text-ink-muted font-normal">(optional)</span>
		</label>
		<input
			id="unit-budget"
			name="budget_usd"
			type="number"
			inputmode="decimal"
			step="0.01"
			min="0"
			bind:value={budget}
			placeholder="Even-share default"
			class="border-line bg-surface text-ink placeholder:text-ink-muted/40 focus:border-moss w-full rounded-md border px-3 py-2 font-mono text-sm focus:outline-none"
		/>
		<p class="text-ink-muted mt-1 text-[11px]">
			An absolute target — it doesn't change the trip budget or other groups.
		</p>
	</div>

	<input type="hidden" name="members" value={[...selected].join(',')} />

	{#if saveError}
		<p role="alert" class="text-error text-sm">{saveError}</p>
	{/if}

	<div class="flex gap-2 pt-1">
		<Button type="submit" variant="primary" size="md" disabled={submitting} loading={submitting}>
			{submitting ? 'Saving…' : unit ? 'Save changes' : 'Create group'}
		</Button>
		<Button type="button" variant="ghost" size="md" onclick={onclose}>Cancel</Button>
	</div>
</form>
