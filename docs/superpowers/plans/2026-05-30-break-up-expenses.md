# Break Up Expenses God-Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the 888-LOC expenses page into focused sub-modules so the orchestrator page drops under 150 LOC and each sub-flow is independently understandable.

**Architecture:** Extract four pieces: `buildSplitData()` utility → `money/build-split-data.ts`, expense add/edit form → `ExpenseForm.svelte`, settle-up state machine → `SettleUpFlow.svelte`, budget summary → `BudgetSummary.svelte`. The expenses page becomes an orchestrator that mounts sub-modules and manages which bottom sheet is open.

**Tech Stack:** SvelteKit, Svelte 5, TypeScript, Tailwind CSS, Vitest (for buildSplitData tests)

**GitHub Issue:** [#15](https://github.com/toxroxmysox/Waypoint/issues/15)

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/money/build-split-data.ts` | Pure function: `buildSplitData(mode, members, amounts)` → JSON string |
| Create | `src/lib/money/build-split-data.test.ts` | Unit tests for buildSplitData |
| Create | `src/lib/money/components/ExpenseForm.svelte` | Add/edit expense form rendered inside a BottomSheet |
| Create | `src/lib/money/components/SettleUpFlow.svelte` | Settle-up state machine (list → record → confirmed) |
| Create | `src/lib/money/components/BudgetSummary.svelte` | Collapsible budget vs actual summary |
| Modify | `src/routes/(app)/trips/[slug]/expenses/+page.svelte` | Thin orchestrator: mounts sub-modules, manages sheet state |
| None | `src/routes/(app)/trips/[slug]/expenses/+page.server.ts` | No changes — server actions stay in the route |

### Design Decisions

1. **`buildSplitData` is a pure function.** Currently duplicated as `buildSplitData()` and `buildEditSplitData()` in the page — identical logic with different state variables. Extract once, call with arguments.

2. **ExpenseForm handles both add and edit.** It receives an optional `expense` prop. When present, it's edit mode (pre-fills, shows delete button, uses `?/updateExpense` action). When absent, it's add mode (blank form, uses `?/addExpense` action). The form posts to the parent's route actions.

3. **SettleUpFlow owns its own state machine.** The three steps (`list` → `record` → `confirmed`) are internal state. It receives `debts`, `members`, `membership` as props and emits settlement form submissions to the route's `?/recordSettlement` action.

4. **BudgetSummary is read-only.** Receives budget data and spent-by-category, renders the collapsible summary. No form actions.

5. **`memberName()` helper is duplicated across components.** It's a 4-line function used by ExpenseForm, SettleUpFlow, and the orchestrator. Rather than creating a shared utility for something this small, each component that needs it receives the `members` list and `membership` (current user) as props, and defines `memberName` locally. The function body is identical — this is acceptable duplication for a display helper.

---

## Task 1: Extract `buildSplitData` with TDD

**Files:**
- Create: `src/lib/money/build-split-data.ts`
- Create: `src/lib/money/build-split-data.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/money/build-split-data.test.ts
import { describe, it, expect } from 'vitest';
import { buildSplitData } from './build-split-data';

describe('buildSplitData', () => {
	it('returns equal split JSON with member IDs', () => {
		const result = buildSplitData('equal', new Set(['m1', 'm2', 'm3']), {});
		expect(JSON.parse(result)).toEqual({ members: ['m1', 'm2', 'm3'] });
	});

	it('returns by_amount split JSON with positive amounts only', () => {
		const result = buildSplitData('by_amount', new Set(), {
			m1: '10.50',
			m2: '0',
			m3: '5.25'
		});
		const parsed = JSON.parse(result);
		expect(parsed).toEqual({ amounts: { m1: 10.5, m3: 5.25 } });
	});

	it('filters out zero and negative amounts in by_amount mode', () => {
		const result = buildSplitData('by_amount', new Set(), {
			m1: '-5',
			m2: '0',
			m3: ''
		});
		expect(JSON.parse(result)).toEqual({ amounts: {} });
	});

	it('handles empty member set in equal mode', () => {
		const result = buildSplitData('equal', new Set(), {});
		expect(JSON.parse(result)).toEqual({ members: [] });
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/money/build-split-data.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/money/build-split-data.ts
export function buildSplitData(
	mode: 'equal' | 'by_amount',
	members: Set<string>,
	amounts: Record<string, string>
): string {
	if (mode === 'equal') {
		return JSON.stringify({ members: [...members] });
	}
	const parsed: Record<string, number> = {};
	for (const [id, val] of Object.entries(amounts)) {
		const n = parseFloat(val);
		if (n > 0) parsed[id] = n;
	}
	return JSON.stringify({ amounts: parsed });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/money/build-split-data.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/money/build-split-data.ts src/lib/money/build-split-data.test.ts
git commit -m "feat(#15): extract buildSplitData with tests"
```

---

## Task 2: Create BudgetSummary component

**Files:**
- Create: `src/lib/money/components/BudgetSummary.svelte`

This is the simplest extraction — a self-contained read-only display component.

- [ ] **Step 1: Create the money components directory and BudgetSummary**

```bash
mkdir -p src/lib/money/components
```

```svelte
<!-- src/lib/money/components/BudgetSummary.svelte -->
<script lang="ts">
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import { titleCase } from '$lib/shell/format';
	import type { BudgetCategory, ExpenseCategory, ItemType } from '$lib/types';

	interface Props {
		budget: { categories: BudgetCategory[] };
		spentByCategory: Record<string, number>;
	}

	let { budget, spentByCategory }: Props = $props();

	const expenseCategoryIcon: Record<ExpenseCategory, ItemType> = {
		lodging: 'lodging',
		transportation: 'transportation',
		food: 'meal',
		activity: 'activity',
		other: 'note'
	};

	const categoryLabels: Record<ExpenseCategory, string> = {
		food: 'Food',
		transportation: 'Transport',
		lodging: 'Lodging',
		activity: 'Activity',
		other: 'Other'
	};

	let expanded = $state(false);

	let budgetTotal = $derived(
		budget.categories.reduce((s, c) => s + c.total, 0)
	);
	let totalSpent = $derived(
		Object.values(spentByCategory).reduce((s, v) => s + v, 0)
	);

	function fmt(n: number): string {
		return n.toFixed(2);
	}
</script>

<button
	type="button"
	class="mb-3 w-full rounded-lg border border-line bg-surface p-3 text-left"
	onclick={() => (expanded = !expanded)}
>
	<div class="flex items-center justify-between">
		<span class="text-xs font-medium text-ink-muted uppercase tracking-wider">Budget</span>
		<div class="flex items-center gap-2">
			<span class="font-mono text-sm text-ink">
				${fmt(totalSpent)} / ${fmt(budgetTotal)}
			</span>
			<svg
				width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
				stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
				class="text-ink-muted transition-transform {expanded ? 'rotate-180' : ''}"
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
		<p class="mt-1 text-xs text-clay">${fmt(totalSpent - budgetTotal)} over budget</p>
	{/if}
</button>

{#if expanded}
	<div class="mb-4 space-y-1.5">
		{#each budget.categories as cat}
			{@const spent = spentByCategory[cat.category] ?? 0}
			{#if cat.total > 0}
				<div class="flex items-center gap-2 rounded-md bg-surface-2/50 px-3 py-2">
					<TypeIcon type={expenseCategoryIcon[cat.category] ?? 'note'} size={20} />
					<div class="min-w-0 flex-1">
						<div class="flex items-center justify-between mb-0.5">
							<span class="text-xs font-medium text-ink">{categoryLabels[cat.category] ?? titleCase(cat.category)}</span>
							<span class="font-mono text-xs text-ink-muted">${fmt(spent)} / ${fmt(cat.total)}</span>
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
```

- [ ] **Step 2: Verify no type errors**

Run: `pnpm check`
Expected: 0 errors, 0 warnings

- [ ] **Step 3: Commit**

```bash
git add src/lib/money/components/BudgetSummary.svelte
git commit -m "feat(#15): extract BudgetSummary component"
```

---

## Task 3: Create SettleUpFlow component

**Files:**
- Create: `src/lib/money/components/SettleUpFlow.svelte`

Encapsulates the three-step state machine: debt list → record payment form → confirmed.

- [ ] **Step 1: Create SettleUpFlow**

```svelte
<!-- src/lib/money/components/SettleUpFlow.svelte -->
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
```

- [ ] **Step 2: Verify no type errors**

Run: `pnpm check`
Expected: 0 errors, 0 warnings

- [ ] **Step 3: Commit**

```bash
git add src/lib/money/components/SettleUpFlow.svelte
git commit -m "feat(#15): extract SettleUpFlow component"
```

---

## Task 4: Create ExpenseForm component

**Files:**
- Create: `src/lib/money/components/ExpenseForm.svelte`

Handles both add and edit modes. Uses `buildSplitData` from the extracted utility.

- [ ] **Step 1: Create ExpenseForm**

```svelte
<!-- src/lib/money/components/ExpenseForm.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { validateForm } from '$lib/shell/actions/validate-form';
	import { untrack } from 'svelte';
	import Button from '$lib/ui/Button.svelte';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import { toast } from '$lib/shell/stores/toast';
	import { buildSplitData } from '$lib/money/build-split-data';
	import type { Expense, ExpenseCategory, TripMember, ItemType } from '$lib/types';

	interface Props {
		members: TripMember[];
		membershipId: string;
		expense?: Expense | null;
		form: Record<string, unknown> | null;
		onclose: () => void;
	}

	let { members, membershipId, expense = null, form: formProp, onclose }: Props = $props();

	let isEdit = $derived(expense !== null);
	let submitting = $state(false);
	let deleting = $state(false);

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
		const m = members.find((mem) => mem.id === memberId);
		if (!m) return 'Unknown';
		if (m.id === membershipId) return 'You';
		return m.display_name || m.placeholder_name || '(member)';
	}

	// Form state
	let amount = $state(untrack(() => expense?.amount_usd.toString() ?? ''));
	let description = $state(untrack(() => expense?.description ?? ''));
	let expenseDate = $state(untrack(() =>
		expense?.date?.split(/[T ]/)[0] ?? new Date().toISOString().split('T')[0]
	));
	let category = $state<ExpenseCategory>(untrack(() =>
		(expense?.category as ExpenseCategory) ?? 'other'
	));
	let paidBy = $state(untrack(() => expense?.paid_by ?? membershipId));
	let splitMode = $state<'equal' | 'by_amount'>(untrack(() =>
		(expense?.split_mode as 'equal' | 'by_amount') ?? 'equal'
	));

	let splitMembers = $state<Set<string>>(untrack(() => {
		if (expense) {
			const sd = expense.split_data as { members?: string[] } | null;
			return new Set(sd?.members ?? members.map((m) => m.id));
		}
		return new Set(members.map((m) => m.id));
	}));

	let splitAmounts = $state<Record<string, string>>(untrack(() => {
		if (expense) {
			const sd = expense.split_data as { amounts?: Record<string, number> } | null;
			const raw = sd?.amounts ?? {};
			return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v)]));
		}
		return {};
	}));

	let showMoreOptions = $state(untrack(() => isEdit));
	let showSplitConfig = $state(untrack(() => isEdit));

	function computeSplitData(): string {
		return buildSplitData(splitMode, splitMembers, splitAmounts);
	}
</script>

<form
	method="POST"
	action={isEdit ? '?/updateExpense' : '?/addExpense'}
	use:validateForm
	use:enhance={() => {
		submitting = true;
		return async ({ update, result }) => {
			submitting = false;
			if (result.type === 'success') {
				onclose();
				toast.show(isEdit ? 'Expense updated' : 'Expense added');
			}
			await update();
		};
	}}
>
	{#if isEdit && expense}
		<input type="hidden" name="expense_id" value={expense.id} />
	{/if}

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

	{#if !isEdit}
		<!-- Paid by summary (add mode, collapsible) -->
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

		<!-- Split summary (add mode, collapsible) -->
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
	{/if}

	{#if isEdit}
		<!-- Category chips (always visible in edit mode) -->
		<fieldset class="mb-4">
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

		<!-- Date (always visible in edit mode) -->
		<div class="mb-4">
			<label for="expense-date" class="mb-1 block text-xs font-medium text-ink-muted">Date</label>
			<input
				id="expense-date"
				type="date"
				bind:value={expenseDate}
				class="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-moss focus:outline-none"
			/>
		</div>

		<!-- Paid by (always visible in edit mode) -->
		<div class="mb-4">
			<label for="expense-paid-by" class="mb-1 block text-xs font-medium text-ink-muted">Paid by</label>
			<select
				id="expense-paid-by"
				bind:value={paidBy}
				class="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-moss focus:outline-none"
			>
				{#each members as member}
					<option value={member.id}>{memberName(member.id)}</option>
				{/each}
			</select>
		</div>
	{/if}

	<!-- Split config -->
	{#if showSplitConfig}
		<div class="mb-4 rounded-md border border-line p-3 space-y-3">
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
				<div class="space-y-1.5">
					{#each members as member}
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
				<div class="space-y-2">
					{#each members as member}
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

	<!-- More options (add mode only, expandable) -->
	{#if !isEdit && showMoreOptions}
		<div class="mb-4 rounded-md border border-line p-3 space-y-3">
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

			<div>
				<label for="expense-date" class="mb-1 block text-xs font-medium text-ink-muted">Date</label>
				<input
					id="expense-date"
					type="date"
					bind:value={expenseDate}
					class="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-moss focus:outline-none"
				/>
			</div>

			<div>
				<label for="expense-paid-by" class="mb-1 block text-xs font-medium text-ink-muted">Paid by</label>
				<select
					id="expense-paid-by"
					bind:value={paidBy}
					class="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-moss focus:outline-none"
				>
					{#each members as member}
						<option value={member.id}>{memberName(member.id)}</option>
					{/each}
				</select>
			</div>
		</div>
	{:else if !isEdit}
		<button
			type="button"
			class="mb-4 text-xs font-medium text-moss"
			onclick={() => (showMoreOptions = true)}
		>More options (category, date, paid by)</button>
	{/if}

	<!-- Hidden fields -->
	<input type="hidden" name="date" value={expenseDate} />
	<input type="hidden" name="category" value={category} />
	<input type="hidden" name="paid_by" value={paidBy} />
	<input type="hidden" name="split_mode" value={splitMode} />
	<input type="hidden" name="split_data" value={computeSplitData()} />

	{#if !isEdit && formProp?.addExpense && 'error' in (formProp.addExpense as Record<string, unknown>)}
		<p role="alert" class="mb-3 text-sm text-error">{(formProp.addExpense as Record<string, string>).error}</p>
	{/if}
	{#if isEdit && formProp?.updateExpense && 'error' in (formProp.updateExpense as Record<string, unknown>)}
		<p role="alert" class="mb-3 text-sm text-error">{(formProp.updateExpense as Record<string, string>).error}</p>
	{/if}

	<Button type="submit" variant="primary" size="lg" class="w-full" disabled={submitting} loading={submitting}>
		{submitting ? (isEdit ? 'Saving...' : 'Adding...') : (isEdit ? 'Save Changes' : 'Add Expense')}
	</Button>
</form>

{#if isEdit && expense}
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
					onclose();
					toast.show('Expense deleted');
				}
				await update();
			};
		}}
	>
		<input type="hidden" name="expense_id" value={expense.id} />

		{#if formProp?.deleteExpense && 'error' in (formProp.deleteExpense as Record<string, unknown>)}
			<p role="alert" class="mb-2 text-sm text-error">{(formProp.deleteExpense as Record<string, string>).error}</p>
		{/if}

		<Button type="submit" variant="ghost" size="md" class="w-full text-clay" disabled={deleting} loading={deleting}>
			{deleting ? 'Deleting...' : 'Delete Expense'}
		</Button>
	</form>
{/if}
```

- [ ] **Step 2: Verify no type errors**

Run: `pnpm check`
Expected: 0 errors, 0 warnings

- [ ] **Step 3: Commit**

```bash
git add src/lib/money/components/ExpenseForm.svelte
git commit -m "feat(#15): extract ExpenseForm component"
```

---

## Task 5: Rewrite expenses page as thin orchestrator

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/expenses/+page.svelte`

The 888-LOC page gets replaced with ~140 LOC that mounts the extracted sub-modules.

- [ ] **Step 1: Rewrite the expenses page**

```svelte
<!-- src/routes/(app)/trips/[slug]/expenses/+page.svelte -->
<script lang="ts">
	import { untrack } from 'svelte';
	import NavBar from '$lib/ui/NavBar.svelte';
	import SubTabs from '$lib/ui/SubTabs.svelte';
	import NotificationBell from '$lib/collaboration/components/NotificationBell.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import FAB from '$lib/shell/components/FAB.svelte';
	import BottomSheet from '$lib/ui/BottomSheet.svelte';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import { simplifyDebts } from '$lib/money/debt-simplify';
	import type { Notification, Expense, ExpenseCategory, ItemType } from '$lib/types';

	import BudgetSummary from '$lib/money/components/BudgetSummary.svelte';
	import SettleUpFlow from '$lib/money/components/SettleUpFlow.svelte';
	import ExpenseForm from '$lib/money/components/ExpenseForm.svelte';

	let { data, form } = $props();

	let notifications = $state<Notification[]>(untrack(() => data.notifications ?? []));
	let unreadCount = $state(untrack(() => data.unreadCount ?? 0));

	// Debt simplification
	let debts = $derived(simplifyDebts(data.expenses, data.settlements));
	let myDebts = $derived(
		debts.filter((d) => d.from === data.membership.id || d.to === data.membership.id)
	);
	let hasBudget = $derived(data.budget !== null && (data.budget?.categories.reduce((s, c) => s + c.total, 0) ?? 0) > 0);

	// Sheet state
	let showSettleUp = $state(false);
	let showAddExpense = $state(false);
	let showExpenseDetail = $state(false);
	let selectedExpense = $state<Expense | null>(null);

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
	{:else}
		{#if hasBudget && data.budget}
			<BudgetSummary budget={data.budget} spentByCategory={data.spentByCategory} />
		{/if}

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

<!-- Add Expense -->
<BottomSheet bind:open={showAddExpense} title="Add Expense">
	<ExpenseForm
		members={data.members}
		membershipId={data.membership.id}
		{form}
		onclose={() => (showAddExpense = false)}
	/>
</BottomSheet>

<!-- Edit Expense -->
<BottomSheet bind:open={showExpenseDetail} title="Edit Expense">
	{#if selectedExpense}
		<ExpenseForm
			members={data.members}
			membershipId={data.membership.id}
			expense={selectedExpense}
			{form}
			onclose={() => { showExpenseDetail = false; selectedExpense = null; }}
		/>
	{/if}
</BottomSheet>

<!-- Settle Up -->
<BottomSheet bind:open={showSettleUp} title="Settle Up">
	<SettleUpFlow
		{debts}
		members={data.members}
		membershipId={data.membership.id}
		{form}
	/>
</BottomSheet>
```

- [ ] **Step 2: Verify no type errors**

Run: `pnpm check`
Expected: 0 errors, 0 warnings

- [ ] **Step 3: Verify line count**

Run: `wc -l src/routes/\(app\)/trips/\[slug\]/expenses/+page.svelte`
Expected: Under 150 LOC (down from 888)

- [ ] **Step 4: Commit**

```bash
git add src/routes/\(app\)/trips/\[slug\]/expenses/+page.svelte
git commit -m "refactor(#15): rewrite expenses page as thin orchestrator"
```

---

## Task 6: Verify and clean up

**Files:**
- All modified/created files from Tasks 1-5

- [ ] **Step 1: Run type checker**

Run: `pnpm check`
Expected: 0 errors, 0 warnings

- [ ] **Step 2: Run all unit tests**

Run: `pnpm test`
Expected: All tests passing (48+ with new buildSplitData tests)

- [ ] **Step 3: Run E2E tests (if PocketBase available)**

Run: `pnpm test:e2e`
Expected: All existing tests pass

- [ ] **Step 4: Verify line count of orchestrator page**

Run: `wc -l src/routes/\(app\)/trips/\[slug\]/expenses/+page.svelte`
Expected: Under 150 LOC

- [ ] **Step 5: Verify buildSplitData is not duplicated**

Run: `grep -rn "buildSplitData\|buildEditSplitData" src/`
Expected: Only references are `import` statements and the definition in `build-split-data.ts`

- [ ] **Step 6: Commit final state**

```bash
git add -A
git commit -m "refactor(#15): break up expenses god-page — complete"
```
