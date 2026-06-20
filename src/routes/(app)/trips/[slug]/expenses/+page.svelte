<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import NavBar from '$lib/ui/NavBar.svelte';
	import SubTabs from '$lib/ui/SubTabs.svelte';
	import NotificationBell from '$lib/collaboration/components/NotificationBell.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import FAB from '$lib/shell/components/FAB.svelte';
	import BottomSheet from '$lib/ui/BottomSheet.svelte';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import { simplifyDebts } from '$lib/money/debt-simplify';
	import { expensesForItem } from '$lib/money/linked-expenses';
	import type { Notification, Expense, ExpenseCategory, ItemType } from '$lib/types';

	import BudgetSummary from '$lib/money/components/BudgetSummary.svelte';
	import SettleUpFlow from '$lib/money/components/SettleUpFlow.svelte';
	import ExpenseForm from '$lib/money/components/ExpenseForm.svelte';

	let { data, form } = $props();

	let notifications = $state<Notification[]>(untrack(() => data.notifications ?? []));
	let unreadCount = $state(untrack(() => data.unreadCount ?? 0));

	let debts = $derived(simplifyDebts(data.expenses, data.settlements));
	let myDebts = $derived(
		debts.filter((d) => d.from === data.membership.id || d.to === data.membership.id)
	);
	let hasBudget = $derived(data.budget !== null && (data.budget?.categories.reduce((s, c) => s + c.total, 0) ?? 0) > 0);

	let showSettleUp = $state(false);
	let showAddExpense = $state(false);
	let showExpenseDetail = $state(false);
	let selectedExpense = $state<Expense | null>(null);

	// #228 — prefill values captured from the ?action=add value params (amount /
	// description / date / linked_item). Read once in the effect below and fed to the ADD
	// ExpenseForm so a caller (e.g. #229's paid-moment capture) can open it pre-filled.
	let prefill = $state<{
		amount: string;
		description: string;
		date: string;
		linkedItem: string;
	}>({ amount: '', description: '', date: '', linkedItem: '' });

	// #128 — when deep-linked from an item (?item=<id>), show only that item's
	// expenses. Multiplicity-safe: a filtered list, never an assumed single record.
	let filterItemId = $derived(data.filterItemId ?? '');
	let visibleExpenses = $derived(
		filterItemId ? expensesForItem(data.expenses, filterItemId) : data.expenses
	);
	// The item behind the currently-open expense, for the detail "View item" link.
	let selectedLinkedItem = $derived(
		selectedExpense?.linked_item
			? data.items.find((i) => i.id === selectedExpense!.linked_item) ?? null
			: null
	);

	const expenseCategoryIcon: Record<ExpenseCategory, ItemType> = {
		lodging: 'lodging',
		transportation: 'transportation',
		food: 'meal',
		activity: 'activity',
		other: 'note'
	};

	function memberName(memberId: string): string {
		const m = data.members.find((mem) => mem.id === memberId);
		if (!m) return 'Unknown';
		if (m.id === data.membership.id) return 'You';
		return m.display_name || m.placeholder_name || '(member)';
	}

	function formatAmount(n: number): string {
		return n.toFixed(2);
	}

	function formatDate(dateStr: string): string {
		if (!dateStr) return '';
		const day = dateStr.split(/[T ]/)[0];
		const d = new Date(day + 'T00:00:00');
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function openExpenseDetail(expense: Expense) {
		selectedExpense = expense;
		showExpenseDetail = true;
	}

	// The Trip Mode central Add navigates here with ?action=add — open the sheet
	// and strip the params so a refresh doesn't reopen it. #228 — also read the optional
	// value params (amount/description/date/linked_item) into `prefill` so the ADD form
	// can open pre-filled (the booked/paid-moment capture passes them, ADR-0014).
	$effect(() => {
		if (page.url.searchParams.get('action') === 'add') {
			const sp = page.url.searchParams;
			prefill = {
				amount: sp.get('amount') ?? '',
				description: sp.get('description') ?? '',
				date: sp.get('date') ?? '',
				linkedItem: sp.get('linked_item') ?? ''
			};
			showAddExpense = true;
			const url = new URL(page.url);
			for (const key of ['action', 'amount', 'description', 'date', 'linked_item']) {
				url.searchParams.delete(key);
			}
			replaceState(url, page.state);
		}
	});
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
<SubTabs tabs={[
	{ id: 'expenses', label: 'Expenses', href: `/trips/${data.trip.slug}/expenses` },
	{ id: 'budget', label: 'Budget', href: `/trips/${data.trip.slug}/budget` }
]} />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-24">
	{#if data.expenses.length === 0}
		<div class="flex flex-col items-center justify-center py-16 text-center">
			<div class="text-ink-muted mb-2 text-3xl">$</div>
			<p class="font-display text-ink-soft text-base italic">No expenses yet.</p>
			<p class="text-ink-muted mt-1 text-sm">Tap + to log your first expense.</p>
		</div>
	{:else if filterItemId}
		<!-- #128 — filtered to one item's expenses. Banner + escape back to all. -->
		<div class="mb-4 flex items-center justify-between gap-3 rounded-lg bg-moss-tint px-4 py-3">
			<div class="min-w-0">
				<p class="text-xs text-moss">Expenses for</p>
				<p class="truncate text-sm font-semibold text-ink">{data.filterItemTitle || 'this item'}</p>
			</div>
			<a href="/trips/{data.trip.slug}/expenses" class="flex-shrink-0 text-xs font-medium text-moss">
				Show all
			</a>
		</div>

		{#if visibleExpenses.length === 0}
			<div class="flex flex-col items-center justify-center py-16 text-center">
				<p class="font-display text-ink-soft text-base italic">No expenses linked to this item.</p>
			</div>
		{:else}
			<div class="space-y-2">
				{#each visibleExpenses as expense}
					{@const payerName = memberName(expense.paid_by)}
					<Card>
						<button type="button" class="flex w-full items-center gap-3 p-3 text-left" onclick={() => openExpenseDetail(expense)}>
							<TypeIcon type={expenseCategoryIcon[expense.category as ExpenseCategory] ?? 'note'} size={36} variant="square" />
							<div class="min-w-0 flex-1">
								<p class="text-sm font-medium text-ink truncate">{expense.description}</p>
								<p class="text-xs text-ink-muted">
									{payerName} paid &middot; {formatDate(expense.date)}
								</p>
							</div>
							<p class="font-mono text-sm font-semibold text-ink">
								${formatAmount(expense.amount_usd)}
							</p>
						</button>
					</Card>
				{/each}
			</div>
		{/if}
	{:else}
		{#if hasBudget && data.budget}
			<BudgetSummary budget={data.budget} spentByCategory={data.spentByCategory} />
		{/if}

		{#if myDebts.length > 0}
			<div class="mb-4 flex gap-3 overflow-x-auto pb-1 -mx-4 px-4">
				{#each myDebts as debt}
					{@const iOwe = debt.from === data.membership.id}
					<div class="flex-shrink-0 rounded-lg border px-4 py-3 min-w-[200px] {iOwe ? 'border-accent/30 bg-accent/5' : 'border-moss/30 bg-moss-tint'}">
						<p class="text-xs font-medium {iOwe ? 'text-accent' : 'text-moss'}">
							{iOwe ? `You owe ${memberName(debt.to)}` : `${memberName(debt.from)} owes you`}
						</p>
						<p class="font-mono text-lg font-semibold {iOwe ? 'text-accent' : 'text-moss'}">
							${formatAmount(debt.amount)}
						</p>
					</div>
				{/each}
			</div>
		{/if}

		{#if debts.length > 0}
			<div class="mb-4">
				<Button variant="ghost" size="md" class="w-full" onclick={() => (showSettleUp = true)}>
					Settle Up ({debts.length} {debts.length === 1 ? 'payment' : 'payments'} needed)
				</Button>
			</div>
		{:else if data.expenses.length > 0}
			<div class="mb-4 flex items-center gap-2 rounded-lg bg-moss-tint px-4 py-3">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-moss">
					<path d="M20 6 9 17l-5-5" />
				</svg>
				<span class="text-sm font-medium text-moss">All squared up!</span>
			</div>
		{/if}

		<div class="space-y-2">
			{#each data.expenses as expense}
				{@const payerName = memberName(expense.paid_by)}
				<Card>
					<button type="button" class="flex w-full items-center gap-3 p-3 text-left" onclick={() => openExpenseDetail(expense)}>
						<TypeIcon type={expenseCategoryIcon[expense.category as ExpenseCategory] ?? 'note'} size={36} variant="square" />
						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium text-ink truncate">{expense.description}</p>
							<p class="text-xs text-ink-muted">
								{payerName} paid &middot; {formatDate(expense.date)}
							</p>
						</div>
						<p class="font-mono text-sm font-semibold text-ink">
							${formatAmount(expense.amount_usd)}
						</p>
					</button>
				</Card>
			{/each}
		</div>
	{/if}
</main>

<FAB onclick={() => (showAddExpense = true)} label="Add expense" />

<BottomSheet bind:open={showAddExpense} title="Add Expense">
	<ExpenseForm
		members={data.members}
		membershipId={data.membership.id}
		{form}
		initialAmount={prefill.amount}
		initialDescription={prefill.description}
		initialDate={prefill.date}
		initialLinkedItem={prefill.linkedItem}
		onclose={() => (showAddExpense = false)}
	/>
</BottomSheet>

<BottomSheet bind:open={showExpenseDetail} title="Edit Expense">
	{#if selectedExpense}
		<ExpenseForm
			members={data.members}
			membershipId={data.membership.id}
			expense={selectedExpense}
			linkedItemHref={selectedLinkedItem ? `/trips/${data.trip.slug}/items/${selectedLinkedItem.id}` : ''}
			linkedItemTitle={selectedLinkedItem?.title ?? ''}
			{form}
			onclose={() => { showExpenseDetail = false; selectedExpense = null; }}
		/>
	{/if}
</BottomSheet>

<BottomSheet bind:open={showSettleUp} title="Settle Up">
	<SettleUpFlow
		{debts}
		members={data.members}
		membershipId={data.membership.id}
		{form}
	/>
</BottomSheet>
