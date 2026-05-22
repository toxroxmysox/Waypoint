<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import SubTabs from '$lib/components/SubTabs.svelte';
	import NotificationBell from '$lib/components/ui/NotificationBell.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import FAB from '$lib/components/ui/FAB.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import { simplifyDebts } from '$lib/utils/debt-simplify';
	import { titleCase } from '$lib/utils/format';
	import TypeIcon from '$lib/components/ui/TypeIcon.svelte';
	import type { Notification, TripMember, Expense, ExpenseCategory, BudgetCategory, ItemType } from '$lib/types';
	import type { DebtEdge } from '$lib/utils/debt-simplify';

	let { data, form } = $props();

	let notifications = $state<Notification[]>(untrack(() => data.notifications ?? []));
	let unreadCount = $state(untrack(() => data.unreadCount ?? 0));

	// Debt simplification
	let debts = $derived(simplifyDebts(data.expenses, data.settlements));
	let myDebts = $derived(
		debts.filter((d) => d.from === data.membership.id || d.to === data.membership.id)
	);

	// Settle Up sheet state
	let showSettleUp = $state(false);
	type SettleStep = 'list' | 'record' | 'confirmed';
	let settleStep = $state<SettleStep>('list');
	let settleDebt = $state<DebtEdge | null>(null);
	let settleAmount = $state('');
	let settleNote = $state('');
	let settleSubmitting = $state(false);

	function openSettleUp() {
		settleStep = 'list';
		settleDebt = null;
		settleAmount = '';
		settleNote = '';
		showSettleUp = true;
	}

	function startRecordPayment(debt: DebtEdge) {
		settleDebt = debt;
		settleAmount = debt.amount.toFixed(2);
		settleNote = '';
		settleStep = 'record';
	}

	// Add Expense sheet state
	let showAddExpense = $state(false);
	let submitting = $state(false);

	// Form fields
	let amount = $state('');
	let description = $state('');
	let expenseDate = $state(new Date().toISOString().split('T')[0]);
	let category = $state<ExpenseCategory>('other');
	let paidBy = $state(untrack(() => data.membership.id));
	let splitMode = $state<'equal' | 'by_amount'>('equal');
	let splitMembers = $state<Set<string>>(untrack(() => new Set(data.members.map((m) => m.id))));
	let splitAmounts = $state<Record<string, string>>({});
	let linkedItem = $state('');
	let showMoreOptions = $state(false);
	let showSplitConfig = $state(false);

	// Category chips config
	const expenseCategoryIcon: Record<ExpenseCategory, ItemType> = {
		lodging: 'lodging',
		transportation: 'transportation',
		food: 'meal',
		activity: 'activity',
		other: 'note'
	};

	const categories: { value: ExpenseCategory; label: string }[] = [
		{ value: 'food', label: 'Food' },
		{ value: 'transportation', label: 'Transport' },
		{ value: 'lodging', label: 'Lodging' },
		{ value: 'activity', label: 'Activity' },
		{ value: 'other', label: 'Other' }
	];

	function memberName(memberId: string): string {
		const m = data.members.find((mem) => mem.id === memberId);
		if (!m) return 'Unknown';
		if (m.id === data.membership.id) return 'You';
		return m.display_name || m.placeholder_name || '(member)';
	}

	function buildSplitData(): string {
		if (splitMode === 'equal') {
			return JSON.stringify({ members: [...splitMembers] });
		}
		const amounts: Record<string, number> = {};
		for (const [id, val] of Object.entries(splitAmounts)) {
			const n = parseFloat(val);
			if (n > 0) amounts[id] = n;
		}
		return JSON.stringify({ amounts });
	}

	function resetForm() {
		amount = '';
		description = '';
		expenseDate = new Date().toISOString().split('T')[0];
		category = 'other';
		paidBy = data.membership.id;
		splitMode = 'equal';
		splitMembers = new Set(data.members.map((m) => m.id));
		splitAmounts = {};
		linkedItem = '';
		showMoreOptions = false;
		showSplitConfig = false;
	}

	function openAddExpense() {
		resetForm();
		showAddExpense = true;
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

	function categoryIconType(cat: string): ItemType {
		return expenseCategoryIcon[cat as ExpenseCategory] ?? 'note';
	}

	// Expense detail sheet
	let showExpenseDetail = $state(false);
	let selectedExpense = $state<Expense | null>(null);
	let deleting = $state(false);
	let updating = $state(false);

	// Edit form fields
	let editAmount = $state('');
	let editDescription = $state('');
	let editDate = $state('');
	let editCategory = $state<ExpenseCategory>('other');
	let editPaidBy = $state('');
	let editSplitMode = $state<'equal' | 'by_amount'>('equal');
	let editSplitMembers = $state<Set<string>>(new Set());
	let editSplitAmounts = $state<Record<string, string>>({});

	function openExpenseDetail(expense: Expense) {
		selectedExpense = expense;
		editAmount = expense.amount_usd.toString();
		editDescription = expense.description;
		editDate = expense.date?.split(/[T ]/)[0] || '';
		editCategory = (expense.category as ExpenseCategory) || 'other';
		editPaidBy = expense.paid_by;
		editSplitMode = (expense.split_mode as 'equal' | 'by_amount') || 'equal';
		const sd = expense.split_data as { members?: string[]; amounts?: Record<string, number> } | null;
		editSplitMembers = new Set(sd?.members ?? data.members.map((m) => m.id));
		const rawAmounts = sd?.amounts ?? {};
		editSplitAmounts = Object.fromEntries(Object.entries(rawAmounts).map(([k, v]) => [k, String(v)]));
		showExpenseDetail = true;
		deleting = false;
		updating = false;
	}

	function buildEditSplitData(): string {
		if (editSplitMode === 'equal') {
			return JSON.stringify({ members: [...editSplitMembers] });
		}
		const amounts: Record<string, number> = {};
		for (const [id, val] of Object.entries(editSplitAmounts)) {
			const n = parseFloat(val);
			if (n > 0) amounts[id] = n;
		}
		return JSON.stringify({ amounts });
	}

	// Budget summary
	let budgetExpanded = $state(false);
	let budgetTotal = $derived(
		data.budget?.categories.reduce((s: number, c: BudgetCategory) => s + c.total, 0) ?? 0
	);
	let totalSpent = $derived(
		Object.values(data.spentByCategory).reduce((s: number, v: number) => s + v, 0)
	);
	let hasBudget = $derived(data.budget !== null && budgetTotal > 0);
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

<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-24">
	{#if data.expenses.length === 0}
		<!-- Empty state -->
		<div class="flex flex-col items-center justify-center py-16 text-center">
			<div class="text-ink-muted mb-2 text-3xl">$</div>
			<p class="font-display text-ink-soft text-base italic">No expenses yet.</p>
			<p class="text-ink-muted mt-1 text-sm">Tap + to log your first expense.</p>
		</div>
	{:else}
		<!-- Budget vs actual summary (collapsible) -->
		{#if hasBudget}
			<button
				type="button"
				class="mb-3 w-full rounded-lg border border-line bg-surface p-3 text-left"
				onclick={() => (budgetExpanded = !budgetExpanded)}
			>
				<div class="flex items-center justify-between">
					<span class="text-xs font-medium text-ink-muted uppercase tracking-wider">Budget</span>
					<div class="flex items-center gap-2">
						<span class="font-mono text-sm text-ink">
							${formatAmount(totalSpent)} / ${formatAmount(budgetTotal)}
						</span>
						<svg
							width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
							stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
							class="text-ink-muted transition-transform {budgetExpanded ? 'rotate-180' : ''}"
						>
							<path d="m6 9 6 6 6-6" />
						</svg>
					</div>
				</div>
				<div class="mt-2 h-1.5 rounded-full bg-surface-2 overflow-hidden">
					<div
						class="h-full rounded-full transition-all {totalSpent > budgetTotal ? 'bg-clay' : 'bg-moss'}"
						style="width: {Math.min(100, (totalSpent / budgetTotal) * 100)}%"
					></div>
				</div>
				{#if totalSpent > budgetTotal}
					<p class="mt-1 text-[11px] text-clay">${formatAmount(totalSpent - budgetTotal)} over budget</p>
				{/if}
			</button>

			{#if budgetExpanded && data.budget}
				<div class="mb-4 space-y-1.5">
					{#each data.budget.categories as cat}
						{@const spent = data.spentByCategory[cat.category] ?? 0}
						{@const meta = categories.find((c) => c.value === cat.category)}
						{#if cat.total > 0}
							<div class="flex items-center gap-2 rounded-md bg-surface-2/50 px-3 py-2">
								<TypeIcon type={expenseCategoryIcon[cat.category] ?? 'note'} size={20} />
								<div class="min-w-0 flex-1">
									<div class="flex items-center justify-between mb-0.5">
										<span class="text-xs font-medium text-ink">{meta?.label ?? titleCase(cat.category)}</span>
										<span class="font-mono text-[11px] text-ink-muted">${formatAmount(spent)} / ${formatAmount(cat.total)}</span>
									</div>
									<div class="h-1 rounded-full bg-surface-2 overflow-hidden">
										<div
											class="h-full rounded-full {spent > cat.total ? 'bg-clay' : 'bg-moss'}"
											style="width: {Math.min(100, (spent / cat.total) * 100)}%"
										></div>
									</div>
								</div>
							</div>
						{/if}
					{/each}
				</div>
			{/if}
		{/if}

		<!-- Balance cards -->
		{#if myDebts.length > 0}
			<div class="mb-4 flex gap-3 overflow-x-auto pb-1 -mx-4 px-4">
				{#each myDebts as debt}
					{@const iOwe = debt.from === data.membership.id}
					<div class="flex-shrink-0 rounded-lg border px-4 py-3 min-w-[200px] {iOwe ? 'border-clay/30 bg-clay/5' : 'border-moss/30 bg-moss-tint'}">
						<p class="text-xs font-medium {iOwe ? 'text-clay' : 'text-moss'}">
							{iOwe ? `You owe ${memberName(debt.to)}` : `${memberName(debt.from)} owes you`}
						</p>
						<p class="font-mono text-lg font-semibold {iOwe ? 'text-clay' : 'text-moss'}">
							${formatAmount(debt.amount)}
						</p>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Settle Up button -->
		{#if debts.length > 0}
			<div class="mb-4">
				<Button variant="ghost" size="md" class="w-full" onclick={openSettleUp}>
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

		<!-- Expense list -->
		<div class="space-y-2">
			{#each data.expenses as expense}
				{@const payerName = memberName(expense.paid_by)}
				<Card>
					<button type="button" class="flex w-full items-center gap-3 p-3 text-left" onclick={() => openExpenseDetail(expense)}>
						<TypeIcon type={categoryIconType(expense.category)} size={36} variant="square" />
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

<!-- FAB -->
<FAB onclick={openAddExpense} label="Add expense" />

<!-- Add Expense Bottom Sheet -->
<BottomSheet bind:open={showAddExpense} title="Add Expense">
	<form
		method="POST"
		action="?/addExpense"
		use:enhance={() => {
			submitting = true;
			return async ({ update, result }) => {
				submitting = false;
				if (result.type === 'success') {
					showAddExpense = false;
					resetForm();
				}
				await update();
			};
		}}
	>
		<!-- Amount -->
		<div class="mb-4">
			<label for="expense-amount" class="mb-1 block text-xs font-medium text-ink-muted">Amount (USD)</label>
			<input
				id="expense-amount"
				name="amount_usd"
				type="number"
				step="0.01"
				min="0.01"
				bind:value={amount}
				placeholder="0.00"
				required
				class="w-full rounded-md border border-line bg-surface px-3 py-2.5 font-mono text-2xl font-semibold text-ink placeholder:text-ink-muted/40 focus:border-moss focus:outline-none"
			/>
		</div>

		<!-- Description -->
		<div class="mb-4">
			<label for="expense-desc" class="mb-1 block text-xs font-medium text-ink-muted">Description</label>
			<input
				id="expense-desc"
				name="description"
				type="text"
				bind:value={description}
				placeholder="What was this for?"
				required
				class="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted/40 focus:border-moss focus:outline-none"
			/>
		</div>

		<!-- Paid by summary -->
		<div class="mb-3 flex items-center justify-between rounded-md bg-surface-2 px-3 py-2">
			<span class="text-sm text-ink-soft">
				Paid by <strong class="text-ink">{memberName(paidBy)}</strong>
			</span>
			<button
				type="button"
				class="text-xs font-medium text-moss"
				onclick={() => (showMoreOptions = true)}
			>Change</button>
		</div>

		<!-- Split summary -->
		<div class="mb-4 flex items-center justify-between rounded-md bg-surface-2 px-3 py-2">
			<span class="text-sm text-ink-soft">
				Split <strong class="text-ink">{splitMode === 'equal' ? 'equally' : 'by amount'}</strong>
				among <strong class="text-ink">{splitMode === 'equal' ? splitMembers.size : Object.keys(splitAmounts).filter(k => parseFloat(splitAmounts[k]) > 0).length}</strong>
			</span>
			<button
				type="button"
				class="text-xs font-medium text-moss"
				onclick={() => (showSplitConfig = !showSplitConfig)}
			>Change</button>
		</div>

		<!-- Split config (expandable) -->
		{#if showSplitConfig}
			<div class="mb-4 rounded-md border border-line p-3 space-y-3">
				<!-- Mode toggle -->
				<div class="flex gap-2">
					<button
						type="button"
						class="flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors {splitMode === 'equal' ? 'bg-ink text-paper' : 'bg-surface-2 text-ink-soft'}"
						onclick={() => (splitMode = 'equal')}
					>Equal</button>
					<button
						type="button"
						class="flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors {splitMode === 'by_amount' ? 'bg-ink text-paper' : 'bg-surface-2 text-ink-soft'}"
						onclick={() => (splitMode = 'by_amount')}
					>By Amount</button>
				</div>

				{#if splitMode === 'equal'}
					<!-- Member toggles -->
					<div class="space-y-1.5">
						{#each data.members as member}
							<label class="flex items-center gap-2 cursor-pointer">
								<input
									type="checkbox"
									checked={splitMembers.has(member.id)}
									onchange={() => {
										const next = new Set(splitMembers);
										if (next.has(member.id)) next.delete(member.id);
										else next.add(member.id);
										splitMembers = next;
									}}
									class="h-4 w-4 rounded border-line text-moss accent-moss"
								/>
								<span class="text-sm text-ink">{memberName(member.id)}</span>
							</label>
						{/each}
					</div>
				{:else}
					<!-- Per-member amount inputs -->
					<div class="space-y-2">
						{#each data.members as member}
							<div class="flex items-center gap-2">
								<span class="min-w-[80px] text-sm text-ink truncate">{memberName(member.id)}</span>
								<input
									type="number"
									step="0.01"
									min="0"
									placeholder="0.00"
									value={splitAmounts[member.id] ?? ''}
									oninput={(e) => {
										splitAmounts = { ...splitAmounts, [member.id]: (e.target as HTMLInputElement).value };
									}}
									class="flex-1 rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-sm text-ink placeholder:text-ink-muted/40 focus:border-moss focus:outline-none"
								/>
							</div>
						{/each}
						{#if true}
							{@const allocated = Object.values(splitAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0)}
							{@const remaining = (parseFloat(amount) || 0) - allocated}
							<p class="text-xs text-ink-muted">
								Remaining: <span class="font-mono {remaining < -0.01 ? 'text-clay' : remaining > 0.01 ? 'text-gold' : 'text-moss'}">${remaining.toFixed(2)}</span>
							</p>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		<!-- More options (expandable) -->
		{#if showMoreOptions}
			<div class="mb-4 rounded-md border border-line p-3 space-y-3">
				<!-- Category chips -->
				<fieldset>
					<legend class="mb-1.5 text-xs font-medium text-ink-muted">Category</legend>
					<div class="flex flex-wrap gap-1.5">
						{#each categories as cat}
							<button
								type="button"
								class="rounded-full px-3 py-1 text-xs font-medium transition-colors {category === cat.value ? 'bg-ink text-paper' : 'bg-surface-2 text-ink-soft hover:bg-line'}"
								onclick={() => (category = cat.value)}
							>{cat.label}</button>
						{/each}
					</div>
				</fieldset>

				<!-- Date -->
				<div>
					<label for="expense-date" class="mb-1 block text-xs font-medium text-ink-muted">Date</label>
					<input
						id="expense-date"
						type="date"
						bind:value={expenseDate}
						class="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-moss focus:outline-none"
					/>
				</div>

				<!-- Paid by selector -->
				<div>
					<label for="expense-paid-by" class="mb-1 block text-xs font-medium text-ink-muted">Paid by</label>
					<select
						id="expense-paid-by"
						bind:value={paidBy}
						class="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-moss focus:outline-none"
					>
						{#each data.members as member}
							<option value={member.id}>{memberName(member.id)}</option>
						{/each}
					</select>
				</div>
			</div>
		{:else}
			<button
				type="button"
				class="mb-4 text-xs font-medium text-moss"
				onclick={() => (showMoreOptions = true)}
			>More options (category, date, paid by)</button>
		{/if}

		<!-- Hidden fields for form data -->
		<input type="hidden" name="date" value={expenseDate} />
		<input type="hidden" name="category" value={category} />
		<input type="hidden" name="paid_by" value={paidBy} />
		<input type="hidden" name="split_mode" value={splitMode} />
		<input type="hidden" name="split_data" value={buildSplitData()} />
		{#if linkedItem}
			<input type="hidden" name="linked_item" value={linkedItem} />
		{/if}

		{#if form?.addExpense && 'error' in form.addExpense}
			<p class="mb-3 text-sm text-clay">{form.addExpense.error}</p>
		{/if}

		<Button type="submit" variant="primary" size="lg" class="w-full" disabled={submitting}>
			{submitting ? 'Adding...' : 'Add Expense'}
		</Button>
	</form>
</BottomSheet>

<!-- Expense Detail / Edit Bottom Sheet -->
<BottomSheet bind:open={showExpenseDetail} title="Edit Expense">
	{#if selectedExpense}
		<form
			method="POST"
			action="?/updateExpense"
			use:enhance={() => {
				updating = true;
				return async ({ update, result }) => {
					updating = false;
					if (result.type === 'success') {
						showExpenseDetail = false;
						selectedExpense = null;
					}
					await update();
				};
			}}
		>
			<input type="hidden" name="expense_id" value={selectedExpense.id} />

			<!-- Amount -->
			<div class="mb-4">
				<label for="edit-amount" class="mb-1 block text-xs font-medium text-ink-muted">Amount (USD)</label>
				<input
					id="edit-amount"
					name="amount_usd"
					type="number"
					step="0.01"
					min="0.01"
					bind:value={editAmount}
					required
					class="w-full rounded-md border border-line bg-surface px-3 py-2.5 font-mono text-2xl font-semibold text-ink focus:border-moss focus:outline-none"
				/>
			</div>

			<!-- Description -->
			<div class="mb-4">
				<label for="edit-desc" class="mb-1 block text-xs font-medium text-ink-muted">Description</label>
				<input
					id="edit-desc"
					name="description"
					type="text"
					bind:value={editDescription}
					required
					class="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-moss focus:outline-none"
				/>
			</div>

			<!-- Category chips -->
			<fieldset class="mb-4">
				<legend class="mb-1.5 text-xs font-medium text-ink-muted">Category</legend>
				<div class="flex flex-wrap gap-1.5">
					{#each categories as cat}
						<button
							type="button"
							class="rounded-full px-3 py-1 text-xs font-medium transition-colors {editCategory === cat.value ? 'bg-ink text-paper' : 'bg-surface-2 text-ink-soft hover:bg-line'}"
							onclick={() => (editCategory = cat.value)}
						>{cat.label}</button>
					{/each}
				</div>
			</fieldset>

			<!-- Date -->
			<div class="mb-4">
				<label for="edit-date" class="mb-1 block text-xs font-medium text-ink-muted">Date</label>
				<input
					id="edit-date"
					type="date"
					bind:value={editDate}
					class="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-moss focus:outline-none"
				/>
			</div>

			<!-- Paid by -->
			<div class="mb-4">
				<label for="edit-paid-by" class="mb-1 block text-xs font-medium text-ink-muted">Paid by</label>
				<select
					id="edit-paid-by"
					bind:value={editPaidBy}
					class="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-moss focus:outline-none"
				>
					{#each data.members as member}
						<option value={member.id}>{memberName(member.id)}</option>
					{/each}
				</select>
			</div>

			<!-- Split config -->
			<div class="mb-4 rounded-md border border-line p-3 space-y-3">
				<div class="flex gap-2">
					<button
						type="button"
						class="flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors {editSplitMode === 'equal' ? 'bg-ink text-paper' : 'bg-surface-2 text-ink-soft'}"
						onclick={() => (editSplitMode = 'equal')}
					>Equal</button>
					<button
						type="button"
						class="flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors {editSplitMode === 'by_amount' ? 'bg-ink text-paper' : 'bg-surface-2 text-ink-soft'}"
						onclick={() => (editSplitMode = 'by_amount')}
					>By Amount</button>
				</div>

				{#if editSplitMode === 'equal'}
					<div class="space-y-1.5">
						{#each data.members as member}
							<label class="flex items-center gap-2 cursor-pointer">
								<input
									type="checkbox"
									checked={editSplitMembers.has(member.id)}
									onchange={() => {
										const next = new Set(editSplitMembers);
										if (next.has(member.id)) next.delete(member.id);
										else next.add(member.id);
										editSplitMembers = next;
									}}
									class="h-4 w-4 rounded border-line text-moss accent-moss"
								/>
								<span class="text-sm text-ink">{memberName(member.id)}</span>
							</label>
						{/each}
					</div>
				{:else}
					<div class="space-y-2">
						{#each data.members as member}
							<div class="flex items-center gap-2">
								<span class="min-w-[80px] text-sm text-ink truncate">{memberName(member.id)}</span>
								<input
									type="number"
									step="0.01"
									min="0"
									placeholder="0.00"
									value={editSplitAmounts[member.id] ?? ''}
									oninput={(e) => {
										editSplitAmounts = { ...editSplitAmounts, [member.id]: (e.target as HTMLInputElement).value };
									}}
									class="flex-1 rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-sm text-ink placeholder:text-ink-muted/40 focus:border-moss focus:outline-none"
								/>
							</div>
						{/each}
						{#if true}
							{@const allocated = Object.values(editSplitAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0)}
							{@const remaining = (parseFloat(editAmount) || 0) - allocated}
							<p class="text-xs text-ink-muted">
								Remaining: <span class="font-mono {remaining < -0.01 ? 'text-clay' : remaining > 0.01 ? 'text-gold' : 'text-moss'}">${remaining.toFixed(2)}</span>
							</p>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Hidden fields -->
			<input type="hidden" name="date" value={editDate} />
			<input type="hidden" name="category" value={editCategory} />
			<input type="hidden" name="paid_by" value={editPaidBy} />
			<input type="hidden" name="split_mode" value={editSplitMode} />
			<input type="hidden" name="split_data" value={buildEditSplitData()} />

			{#if form?.updateExpense && 'error' in form.updateExpense}
				<p class="mb-3 text-sm text-clay">{form.updateExpense.error}</p>
			{/if}

			<Button type="submit" variant="primary" size="lg" class="w-full" disabled={updating}>
				{updating ? 'Saving...' : 'Save Changes'}
			</Button>
		</form>

		<!-- Delete (separate form) -->
		<form
			method="POST"
			action="?/deleteExpense"
			class="mt-3"
			use:enhance={() => {
				deleting = true;
				return async ({ update, result }) => {
					deleting = false;
					if (result.type === 'success') {
						showExpenseDetail = false;
						selectedExpense = null;
					}
					await update();
				};
			}}
		>
			<input type="hidden" name="expense_id" value={selectedExpense.id} />

			{#if form?.deleteExpense && 'error' in form.deleteExpense}
				<p class="mb-2 text-sm text-clay">{form.deleteExpense.error}</p>
			{/if}

			<Button type="submit" variant="ghost" size="md" class="w-full text-clay" disabled={deleting}>
				{deleting ? 'Deleting...' : 'Delete Expense'}
			</Button>
		</form>
	{/if}
</BottomSheet>

<!-- Settle Up Bottom Sheet -->
<BottomSheet bind:open={showSettleUp} title="Settle Up">
	{#if settleStep === 'list'}
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
					{@const iOwe = debt.from === data.membership.id}
					{@const owedToMe = debt.to === data.membership.id}
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
								${formatAmount(debt.amount)}
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

	{:else if settleStep === 'record' && settleDebt}
		<form
			method="POST"
			action="?/recordSettlement"
			use:enhance={() => {
				settleSubmitting = true;
				return async ({ update, result }) => {
					settleSubmitting = false;
					if (result.type === 'success') {
						settleStep = 'confirmed';
					}
					await update();
				};
			}}
		>
			<div class="mb-4 flex items-center justify-center gap-3">
				<div class="text-center">
					<div class="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 mx-auto text-sm font-semibold text-ink">
						{memberName(settleDebt.from).charAt(0)}
					</div>
					<p class="mt-1 text-xs text-ink-muted">{memberName(settleDebt.from)}</p>
				</div>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-ink-muted">
					<path d="M5 12h14M12 5l7 7-7 7" />
				</svg>
				<div class="text-center">
					<div class="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 mx-auto text-sm font-semibold text-ink">
						{memberName(settleDebt.to).charAt(0)}
					</div>
					<p class="mt-1 text-xs text-ink-muted">{memberName(settleDebt.to)}</p>
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

			<input type="hidden" name="from_member" value={settleDebt.from} />
			<input type="hidden" name="to_member" value={settleDebt.to} />

			{#if form?.recordSettlement && 'error' in form.recordSettlement}
				<p class="mb-3 text-sm text-clay">{form.recordSettlement.error}</p>
			{/if}

			<div class="flex gap-2">
				<Button variant="ghost" size="md" class="flex-1" onclick={() => (settleStep = 'list')}>
					Back
				</Button>
				<Button type="submit" variant="primary" size="md" class="flex-1" disabled={settleSubmitting}>
					{settleSubmitting ? 'Recording...' : 'Confirm Payment'}
				</Button>
			</div>
		</form>

	{:else if settleStep === 'confirmed' && settleDebt}
		<div class="flex flex-col items-center py-6 text-center">
			<div class="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-moss-tint">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-moss">
					<path d="M20 6 9 17l-5-5" />
				</svg>
			</div>
			<p class="font-display text-base font-semibold text-ink">Payment Recorded</p>
			<p class="mt-1 text-sm text-ink-muted">
				{memberName(settleDebt.from)} paid {memberName(settleDebt.to)} ${settleAmount}
			</p>
			<div class="mt-4 w-full">
				<Button variant="primary" size="md" class="w-full" onclick={() => { showSettleUp = false; }}>
					Done
				</Button>
			</div>
		</div>
	{/if}
</BottomSheet>
