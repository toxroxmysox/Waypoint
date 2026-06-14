import type { ItemType } from '../itinerary/types';
import type { ExpenseCategory } from './types';

// Plan-vs-budget (#198): the Budget tab must answer "can we afford this?" before
// any expenses exist, by aggregating the plan's forward-looking estimate
// (`cost_estimate_usd`, CONTEXT.md's "what we expect to pay") against each budget
// category. Budget categories are ExpenseCategory; itinerary items are ItemType —
// this module is the single mapping + sum, mirroring the per-day Σ in
// `itinerary/day-card.ts` but bucketed by the SAME categories the budget uses.

/** Just the item shape this aggregation needs (matches the field-limited fetch). */
export interface PlannedItem {
	type: ItemType;
	cost_estimate_usd?: number;
}

// ItemType → budget ExpenseCategory. `meal` is the Food category; `flight` is a
// transportation cost (it's also a transportation subtype in the schema);
// `note`/`checklist` carry estimates but have no dedicated envelope, so they fold
// into Other — the same bucket the expense category uses for its `note` icon.
const ITEM_TYPE_TO_CATEGORY: Record<ItemType, ExpenseCategory> = {
	lodging: 'lodging',
	transportation: 'transportation',
	flight: 'transportation',
	meal: 'food',
	activity: 'activity',
	note: 'other',
	checklist: 'other'
};

export function itemTypeToCategory(type: ItemType): ExpenseCategory {
	return ITEM_TYPE_TO_CATEGORY[type] ?? 'other';
}

/**
 * Sum each item's `cost_estimate_usd` into its budget category. Returns a record
 * keyed by every ExpenseCategory (zero when nothing planned), so the budget page
 * can read `plannedByCategory[cat]` without a presence check.
 */
export function plannedByCategory(items: PlannedItem[]): Record<ExpenseCategory, number> {
	const totals: Record<ExpenseCategory, number> = {
		lodging: 0,
		transportation: 0,
		food: 0,
		activity: 0,
		other: 0
	};
	for (const item of items) {
		const cat = itemTypeToCategory(item.type);
		totals[cat] += item.cost_estimate_usd || 0;
	}
	return totals;
}
