<script lang="ts">
	import { enhance } from '$app/forms';
	import { validateForm } from '$lib/shell/actions/validate-form';
	import Button from '$lib/ui/Button.svelte';
	import { toast } from '$lib/shell/stores/toast';
	import type { DebtEdge } from '$lib/money/debt-simplify';
	import type { TripMember } from '$lib/types';

	interface Props {
		debts: DebtEdge[];
		members: TripMember[];
		membershipId: string;
		form: Record<string, unknown> | null;
	}

	let { debts, members, membershipId, form: formProp }: Props = $props();

	type SettleStep = 'list' | 'record' | 'confirmed';
	let step = $state<SettleStep>('list');
	let selectedDebt = $state<DebtEdge | null>(null);
	let settleAmount = $state('');
	let settleNote = $state('');
	let submitting = $state(false);

	export function reset() {
		step = 'list';
		selectedDebt = null;
		settleAmount = '';
		settleNote = '';
	}

	function startRecordPayment(debt: DebtEdge) {
		selectedDebt = debt;
		settleAmount = debt.amount.toFixed(2);
		settleNote = '';
		step = 'record';
	}

	function memberName(memberId: string): string {
		const m = members.find((mem) => mem.id === memberId);
		if (!m) return 'Unknown';
		if (m.id === membershipId) return 'You';
		return m.display_name || m.placeholder_name || '(member)';
	}

	function fmt(n: number): string {
		return n.toFixed(2);
	}
</script>

{#if step === 'list'}
	{#if debts.length === 0}
		<div class="flex flex-col items-center py-8 text-center">
			<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-moss mb-2">
				<path d="M20 6 9 17l-5-5" />
			</svg>
			<p class="font-display text-base font-semibold text-moss">All squared up!</p>
			<p class="text-sm text-ink-muted mt-1">No payments needed.</p>
		</div>
	{:else}
		<p class="text-sm text-ink-muted mb-4">{debts.length} {debts.length === 1 ? 'payment' : 'payments'} needed to settle all debts</p>
		<div class="space-y-2">
			{#each debts as debt}
				{@const iOwe = debt.from === membershipId}
				{@const owedToMe = debt.to === membershipId}
				<div class="flex items-center justify-between rounded-lg border border-line p-3">
					<div>
						<p class="text-sm font-medium text-ink">
							{#if iOwe}
								You owe {memberName(debt.to)}
							{:else if owedToMe}
								{memberName(debt.from)} owes you
							{:else}
								{memberName(debt.from)} owes {memberName(debt.to)}
							{/if}
						</p>
						<p class="font-mono text-lg font-semibold {iOwe ? 'text-clay' : owedToMe ? 'text-moss' : 'text-ink'}">
							${fmt(debt.amount)}
						</p>
					</div>
					<Button
						variant={iOwe ? 'primary' : 'ghost'}
						size="sm"
						onclick={() => startRecordPayment(debt)}
					>Record Payment</Button>
				</div>
			{/each}
		</div>
	{/if}

{:else if step === 'record' && selectedDebt}
	<form
		method="POST"
		action="?/recordSettlement"
		use:enhance={() => {
			submitting = true;
			return async ({ update, result }) => {
				submitting = false;
				if (result.type === 'success') {
					step = 'confirmed';
					toast.show('Settlement recorded');
				}
				await update();
			};
		}}
	>
		<div class="mb-4 flex items-center justify-center gap-3">
			<div class="text-center">
				<div class="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 mx-auto text-sm font-semibold text-ink">
					{memberName(selectedDebt.from).charAt(0)}
				</div>
				<p class="mt-1 text-xs text-ink-muted">{memberName(selectedDebt.from)}</p>
			</div>
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-ink-muted">
				<path d="M5 12h14M12 5l7 7-7 7" />
			</svg>
			<div class="text-center">
				<div class="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 mx-auto text-sm font-semibold text-ink">
					{memberName(selectedDebt.to).charAt(0)}
				</div>
				<p class="mt-1 text-xs text-ink-muted">{memberName(selectedDebt.to)}</p>
			</div>
		</div>

		<div class="mb-4">
			<label for="settle-amount" class="mb-1 block text-xs font-medium text-ink-muted">Amount</label>
			<input
				id="settle-amount"
				name="amount_usd"
				type="number"
				step="0.01"
				min="0.01"
				bind:value={settleAmount}
				class="w-full rounded-md border border-line bg-surface px-3 py-2.5 font-mono text-xl font-semibold text-ink focus:border-moss focus:outline-none"
			/>
		</div>

		<div class="mb-4">
			<label for="settle-note" class="mb-1 block text-xs font-medium text-ink-muted">Note (optional)</label>
			<input
				id="settle-note"
				name="note"
				type="text"
				bind:value={settleNote}
				placeholder="Venmo, cash, etc."
				class="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted/40 focus:border-moss focus:outline-none"
			/>
		</div>

		<input type="hidden" name="from_member" value={selectedDebt.from} />
		<input type="hidden" name="to_member" value={selectedDebt.to} />

		{#if formProp?.recordSettlement && 'error' in (formProp.recordSettlement as Record<string, unknown>)}
			<p role="alert" class="mb-3 text-sm text-error">{(formProp.recordSettlement as Record<string, string>).error}</p>
		{/if}

		<div class="flex gap-2">
			<Button variant="ghost" size="md" class="flex-1" onclick={() => (step = 'list')}>
				Back
			</Button>
			<Button type="submit" variant="primary" size="md" class="flex-1" disabled={submitting} loading={submitting}>
				{submitting ? 'Recording...' : 'Confirm Payment'}
			</Button>
		</div>
	</form>

{:else if step === 'confirmed' && selectedDebt}
	<div class="flex flex-col items-center py-6 text-center">
		<div class="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-moss-tint">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-moss">
				<path d="M20 6 9 17l-5-5" />
			</svg>
		</div>
		<p class="font-display text-base font-semibold text-ink">Payment Recorded</p>
		<p class="mt-1 text-sm text-ink-muted">
			{memberName(selectedDebt.from)} paid {memberName(selectedDebt.to)} ${settleAmount}
		</p>
	</div>
{/if}
