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
			class="h-full rounded-full transition-all {totalSpent > budgetTotal ? 'bg-error' : 'bg-moss'}"
			style="width: {budgetTotal > 0 ? Math.min(100, (totalSpent / budgetTotal) * 100) : 0}%"
		></div>
	</div>
	{#if totalSpent > budgetTotal}
		<p class="mt-1 text-xs text-error">${fmt(totalSpent - budgetTotal)} over budget</p>
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
								class="h-full rounded-full {spent > cat.total ? 'bg-error' : 'bg-moss'}"
								style="width: {Math.min(100, (spent / cat.total) * 100)}%"
							></div>
						</div>
					</div>
				</div>
			{/if}
		{/each}
	</div>
{/if}
