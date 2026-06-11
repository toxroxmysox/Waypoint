import type { Expense } from './types';

// #128 — Item ↔ Expense nav. The `expenses.linked_item` relation is one item to
// MANY expenses, so every lookup returns a list, never a single record.

/** All expenses whose `linked_item` points at `itemId`. Empty when none / no id. */
export function expensesForItem(expenses: Expense[], itemId: string): Expense[] {
	if (!itemId) return [];
	return expenses.filter((e) => e.linked_item === itemId);
}

/** How many expenses link to `itemId` — drives the conditional detail affordance. */
export function countExpensesForItem(expenses: Expense[], itemId: string): number {
	return expensesForItem(expenses, itemId).length;
}
