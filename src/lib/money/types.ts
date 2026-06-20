import type { Item } from '../itinerary/types';
import type { TripMember } from '../collaboration/types';

export type ExpenseCategory = 'lodging' | 'transportation' | 'food' | 'activity' | 'other';

export type SplitMode = 'equal' | 'by_amount';

export interface SplitDataEqual {
	members: string[];
}

export interface SplitDataByAmount {
	amounts: Record<string, number>;
}

export type SplitData = SplitDataEqual | SplitDataByAmount;

export interface Expense {
	id: string;
	trip: string;
	paid_by: string;
	amount_usd: number;
	description: string;
	date: string;
	category: ExpenseCategory;
	linked_item: string | null;
	split_mode: SplitMode;
	split_data: SplitData;
	created_by: string;
	created: string;
	updated: string;
	expand?: {
		paid_by?: TripMember;
		linked_item?: Item;
		created_by?: TripMember;
	};
}

export interface Settlement {
	id: string;
	trip: string;
	from_member: string;
	to_member: string;
	amount_usd: number;
	date: string;
	note: string;
	created_by: string;
	created: string;
	updated: string;
	expand?: {
		from_member?: TripMember;
		to_member?: TripMember;
	};
}

export type BudgetMode = 'per_day' | 'total';

export interface BudgetCategory {
	category: ExpenseCategory;
	mode: BudgetMode;
	daily_amount: number | null;
	total: number;
}

export interface TripBudget {
	id: string;
	trip: string;
	categories: BudgetCategory[];
	created: string;
	updated: string;
}

// #230 / ADR-0015 — a Money Unit: a self-declared, shared, trip-scoped grouping of members
// who pool money. `members` holds trip_members.id[]. `budget_usd` is the OPTIONAL absolute
// custom override (empty/0-unset → the even-share default; a stored 0 is a real target).
// The pure `money-units.ts` MoneyUnit interface is the structural subset this satisfies.
export interface MoneyUnitRecord {
	id: string;
	trip: string;
	members: string[];
	budget_usd: number | null;
	created_by: string;
	created: string;
	updated: string;
	expand?: {
		members?: TripMember[];
		created_by?: TripMember;
	};
}
