<script lang="ts">
	import { enhance } from '$app/forms';
	import { validateForm } from '$lib/shell/actions/validate-form';
	import { untrack } from 'svelte';
	import Button from '$lib/ui/Button.svelte';
	import { toast } from '$lib/shell/stores/toast';
	import { buildSplitData } from '$lib/money/build-split-data';
	import type { Expense, ExpenseCategory, TripMember } from '$lib/types';

	interface Props {
		members: TripMember[];
		membershipId: string;
		expense?: Expense | null;
		form: Record<string, unknown> | null;
		onclose: () => void;
		// #128 — when this expense's linked_item is set, the page resolves the item
		// and passes its detail href + title so we can render a "View item" link.
		linkedItemHref?: string;
		linkedItemTitle?: string;
	}

	let {
		members,
		membershipId,
		expense = null,
		form: formProp,
		onclose,
		linkedItemHref = '',
		linkedItemTitle = ''
	}: Props = $props();

	let isEdit = $derived(expense !== null);
	let submitting = $state(false);
	let deleting = $state(false);

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
		return m.display_name || m.expand?.user?.name || m.expand?.user?.email || m.placeholder_name || '(member)';
	}

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

	<!-- #128 — back-link to the linked item's detail when one is set. -->
	{#if isEdit && linkedItemHref}
		<a
			href={linkedItemHref}
			class="mb-4 flex items-center justify-between rounded-md border border-line bg-surface-2 px-3 py-2"
		>
			<span class="min-w-0">
				<span class="block text-xs text-ink-muted">Linked item</span>
				<span class="block truncate text-sm font-medium text-ink">{linkedItemTitle || 'View item'}</span>
			</span>
			<span class="flex flex-shrink-0 items-center gap-1 text-xs font-medium text-moss">
				View item
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="m9 18 6-6-6-6" />
				</svg>
			</span>
		</a>
	{/if}

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

		<div class="mb-4">
			<label for="expense-date" class="mb-1 block text-xs font-medium text-ink-muted">Date</label>
			<input
				id="expense-date"
				type="date"
				bind:value={expenseDate}
				class="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-moss focus:outline-none"
			/>
		</div>

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
							Remaining: <span class="font-mono {remaining < -0.01 ? 'text-error' : remaining > 0.01 ? 'text-gold' : 'text-moss'}">${remaining.toFixed(2)}</span>
						</p>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

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

		<Button type="submit" variant="ghost" size="md" class="w-full text-error" disabled={deleting} loading={deleting}>
			{deleting ? 'Deleting...' : 'Delete Expense'}
		</Button>
	</form>
{/if}
