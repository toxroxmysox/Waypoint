// Trip-Mode Money glance — the pure, testable core of the per-person summary (#227).
//
// Answers ONE question per member: "how much do I have left to spend?" Everything
// here is per-person (group framing was superseded 2026-06-15; multi-person units +
// custom budgets are deferred to #230). No I/O — expenses + budget + roster + a few
// trip facts in, the figures out. Mirrors `debt-simplify.ts` / `build-split-data.ts`
// as a pure money module.
//
// The numbers (TRIP_MONEY_PRD §Grill Resolutions A; issue #227 body):
//   my budget  = group budget total ÷ member count
//   my share   = my RECONCILIATION-AWARE share of logged expenses — the same per-split
//                attribution `computeBalances` does (what I consumed/owe, NOT my
//                out-of-pocket). If I owe $300, that $300 is part of my share.
//   N1 (left to spend)      = my budget − my share
//   N2 (left for unplanned) = N1 − my share of remaining planned estimates
//                             (Σ cost_estimate_usd over unbooked, unlinked items ÷ members)
//   per-day rate            = N ÷ remaining days (the hero framing)

import type { Expense, TripBudget } from './types';
import type { SplitDataEqual, SplitDataByAmount } from './types';

/** Just the item shape this aggregation needs (matches a field-limited fetch). */
export interface GlanceItem {
	booked: boolean;
	cost_estimate_usd?: number;
}

export interface MoneyGlanceInput {
	/** Current member's `trip_members` record id — the same id space `paid_by` /
	 *  split member ids use. */
	meId: string;
	/** Number of members the group budget is divided across (≥ 1). */
	memberCount: number;
	/** Trip end date — `YYYY-MM-DD` or a stored datetime; only the date part is read. */
	tripEnd: string;
	/** Trip-local "today" as `YYYY-MM-DD` (compute with `tripToday`, never machine-tz). */
	today: string;
	/** Whole trip length in days — drives `per_day` budget categories. */
	tripDays: number;
}

export interface MoneyGlance {
	/** Σ group budget across categories (per_day × tripDays, else total). null = no budget set. */
	groupBudgetTotal: number | null;
	/** groupBudgetTotal ÷ memberCount. null when no budget set. */
	myBudget: number | null;
	/** My reconciliation-aware share of all LOGGED expenses (consumption, incl. what I owe). */
	myShare: number;
	/** Σ cost_estimate_usd over remaining (unbooked + unlinked) planned items — the GROUP figure. */
	remainingPlannedTotal: number;
	/** remainingPlannedTotal ÷ memberCount — my share of what's still planned. */
	myRemainingPlanned: number;
	/** Calendar days left, inclusive of today (≥ 1 while on/within the trip; 0 once past). */
	remainingDays: number;
	/** N1 — my budget − my share. null when no budget set. */
	n1LeftToSpend: number | null;
	/** N1 ÷ remaining days. null when no budget / no remaining days. */
	n1PerDay: number | null;
	/** N2 — N1 − my share of remaining planned estimates. null when no budget set. */
	n2LeftForUnplanned: number | null;
	/** N2 ÷ remaining days. null when no budget / no remaining days. */
	n2PerDay: number | null;
	/** True when a budget exists and my share already exceeds my budget (N1 < 0). */
	overBudget: boolean;
}

/** Date part of a `YYYY-MM-DD` or stored-datetime string. */
function dateOnly(s: string): string {
	return s.split(/[T ]/)[0];
}

/**
 * The group budget envelope: Σ over categories. A `per_day` category's true envelope
 * is `daily_amount × tripDays`; the budget editor already syncs `total` to that, but
 * we derive it explicitly so the figure is right even if `total` wasn't synced (the
 * PRD §82 formula: "per_day × tripDays + total"). `total`-mode categories use `total`.
 * Returns null when there's no budget at all (so the page can omit "left", per A3).
 */
export function groupBudgetTotal(budget: TripBudget | null, tripDays: number): number | null {
	if (!budget) return null;
	let sum = 0;
	for (const c of budget.categories) {
		if (c.mode === 'per_day' && c.daily_amount != null) {
			sum += c.daily_amount * tripDays;
		} else {
			sum += c.total;
		}
	}
	return sum;
}

/**
 * My RECONCILIATION-AWARE share of logged expenses: the per-split amount attributed to
 * me across every expense, regardless of who paid. This is the debit side of
 * `computeBalances` — the consumption that counts against my budget (if I owe $300 for
 * a dinner Alice paid, that $300 is mine here). Estimates are NEVER read; only recorded
 * `expenses`. An equal split divides `amount_usd` across `split_data.members`; a
 * by_amount split reads `split_data.amounts[meId]`.
 */
export function myShareOfExpenses(expenses: Expense[], meId: string): number {
	let share = 0;
	for (const e of expenses) {
		if (e.split_mode === 'equal') {
			const data = e.split_data as SplitDataEqual;
			if (data.members.length > 0 && data.members.includes(meId)) {
				share += e.amount_usd / data.members.length;
			}
		} else if (e.split_mode === 'by_amount') {
			const data = e.split_data as SplitDataByAmount;
			share += data.amounts[meId] ?? 0;
		}
	}
	return share;
}

/**
 * Σ cost_estimate_usd over items that are still planned (unbooked) AND have no linked
 * expense yet. `linkedItemIds` is the set of item ids that already have ≥1 expense
 * (built once from `expenses[].linked_item`), so an item that was booked-and-logged
 * drops out of the forecast. Each item carries its own id for the linkage check.
 */
export function remainingPlannedTotal(
	items: (GlanceItem & { id: string })[],
	linkedItemIds: Set<string>
): number {
	let sum = 0;
	for (const item of items) {
		if (item.booked) continue;
		if (linkedItemIds.has(item.id)) continue;
		const est = item.cost_estimate_usd ?? 0;
		if (est > 0) sum += est;
	}
	return sum;
}

/**
 * Calendar days left INCLUSIVE of today, in trip-local terms: `today` and `tripEnd` are
 * both `YYYY-MM-DD`. On the last day → 1 ("today is your last day"); once past the trip
 * → 0. Used as the denominator for the per-day rates (guarded against /0 by the caller).
 */
export function remainingDays(today: string, tripEnd: string): number {
	const t = new Date(dateOnly(today) + 'T00:00:00Z').getTime();
	const end = new Date(dateOnly(tripEnd) + 'T00:00:00Z').getTime();
	if (Number.isNaN(t) || Number.isNaN(end)) return 0;
	const diff = Math.round((end - t) / 86_400_000);
	return diff < 0 ? 0 : diff + 1;
}

/**
 * The whole per-person glance. Pure: same inputs → same output. `expenses` are LOGGED
 * expenses only (never estimates); `budget` is the trip's budget or null; `items` carry
 * `booked` + `cost_estimate_usd` + `id` for the N2 forecast.
 */
export function moneyGlance(
	expenses: Expense[],
	budget: TripBudget | null,
	items: (GlanceItem & { id: string })[],
	{ meId, memberCount, tripEnd, today, tripDays }: MoneyGlanceInput
): MoneyGlance {
	const members = Math.max(1, memberCount);

	const groupTotal = groupBudgetTotal(budget, tripDays);
	const myBudget = groupTotal == null ? null : groupTotal / members;

	const myShare = myShareOfExpenses(expenses, meId);

	const linkedItemIds = new Set<string>();
	for (const e of expenses) {
		if (e.linked_item) linkedItemIds.add(e.linked_item);
	}
	const remainingPlanned = remainingPlannedTotal(items, linkedItemIds);
	const myRemainingPlanned = remainingPlanned / members;

	const days = remainingDays(today, tripEnd);

	const n1 = myBudget == null ? null : myBudget - myShare;
	const n2 = n1 == null ? null : n1 - myRemainingPlanned;

	// Per-day rate only makes sense with a budget AND days left; otherwise null (the UI
	// renders "—" / a zero-days caveat rather than dividing by zero or showing Infinity).
	const n1PerDay = n1 == null || days <= 0 ? null : n1 / days;
	const n2PerDay = n2 == null || days <= 0 ? null : n2 / days;

	return {
		groupBudgetTotal: groupTotal,
		myBudget,
		myShare,
		remainingPlannedTotal: remainingPlanned,
		myRemainingPlanned,
		remainingDays: days,
		n1LeftToSpend: n1,
		n1PerDay,
		n2LeftForUnplanned: n2,
		n2PerDay,
		overBudget: n1 != null && n1 < 0
	};
}
