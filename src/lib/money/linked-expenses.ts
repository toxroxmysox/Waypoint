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

// #229 / ADR-0014 — "Paid" is DERIVED, not stored: an item is paid IFF it has ≥1 linked
// Expense. There is NO `paid` flag and no migration. This summary drives the item's
// money-event affordance state flip: 0 linked → "Log payment" (opens #228's prefilled
// add); ≥1 linked → "Paid $X" with a link-out. `total` is the summed amount of the linked
// expenses (a deposit-then-balance item naturally accumulates here — a single boolean flag
// could not represent it). `booked` is orthogonal and never consulted.

/** The minimal expense shape this summary needs — matches a field-limited fetch. */
export interface LinkedExpenseLike {
	linked_item: string | null;
	amount_usd: number;
}

export interface ItemPaidSummary {
	/** Number of expenses linked to the item. */
	count: number;
	/** Σ amount_usd over the linked expenses (deposit + balance accumulate). */
	total: number;
	/** Derived paid state: true IFF count ≥ 1 (ADR-0014). */
	isPaid: boolean;
}

/**
 * Derive the paid state + summed total for an item from the trip's expenses. Pure:
 * filters to the item's linked expenses and folds their amounts. `isPaid` is the
 * ≥1-linked predicate the affordance flips on; `total` is the "Paid $X" figure.
 */
export function paidSummaryForItem(
	expenses: LinkedExpenseLike[],
	itemId: string
): ItemPaidSummary {
	if (!itemId) return { count: 0, total: 0, isPaid: false };
	let count = 0;
	let total = 0;
	for (const e of expenses) {
		if (e.linked_item === itemId) {
			count += 1;
			total += e.amount_usd;
		}
	}
	return { count, total, isPaid: count > 0 };
}
