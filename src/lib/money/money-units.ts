// #230 / ADR-0015 — Money Units: a settle-up + glance GROUPING, not a split or payer
// concept. A Money Unit is a self-declared, shared, trip-scoped grouping of members who
// pool money (a couple, or any ad-hoc pool). Pure module — no I/O. Mirrors `debt-simplify`
// / `money-glance` as a pure money module.
//
// Three invariants from ADR-0015:
//   1. Split is NEVER affected — expenses always split per-person. A unit changes nothing
//      about how an expense divides. The unit is orthogonal to splitting; this module
//      never touches split_data.
//   2. Settle-up collapses to UNIT-NODES: aggregate each member's balance into their unit,
//      then run the EXISTING greedy debt-simplification on those nodes. Intra-unit debts
//      wash for free (same node); inter-unit debts net; any one member settles the unit's
//      net. A member→unit pre-aggregation in FRONT of `debt-simplify` — nothing rewritten
//      (we reuse `computeBalances` + the extracted `simplifyFromBalances`).
//   3. Budgets are BOTTOM-UP + decoupled: default unit budget = even share
//      (group ÷ heads × unit size); an optional ABSOLUTE custom override does NOT
//      redistribute and does NOT change the group total (Σ unit budgets ≠ group total is
//      expected). A solo member is a unit of one (unchanged).

import type { Expense, Settlement } from './types';
import { computeBalances, simplifyFromBalances, type DebtEdge } from './debt-simplify';

/** A Money Unit: its members and an optional absolute budget override. `id` is the unit's
 *  record id (used as the unit-node key in settle-up). */
export interface MoneyUnit {
	id: string;
	members: string[];
	/** Absolute custom budget for this unit. null/undefined → use the even-share default. */
	budget_usd?: number | null;
}

/**
 * Build the member-id → unit-key map. A member in a declared unit maps to that unit's id.
 * A member in NO unit is a unit of one, keyed by their OWN member id (so solo members are
 * unchanged — their unit-node is just themselves). `allMemberIds` ensures every active
 * member gets a node even if no unit references them.
 *
 * If a member somehow appears in two units (shouldn't happen — opt-in/leave is the consent
 * valve), the FIRST unit in `units` wins, deterministically.
 */
export function buildMemberUnitMap(units: MoneyUnit[], allMemberIds: string[]): Map<string, string> {
	const map = new Map<string, string>();
	for (const unit of units) {
		for (const memberId of unit.members) {
			if (!map.has(memberId)) map.set(memberId, unit.id);
		}
	}
	// Anyone not in a declared unit is their own unit of one.
	for (const memberId of allMemberIds) {
		if (!map.has(memberId)) map.set(memberId, memberId);
	}
	return map;
}

/**
 * Aggregate per-member balances into unit-node balances: sum every member's balance into
 * their unit key. Intra-unit debts wash here automatically (two members of the same unit,
 * +X and −X, sum to 0 at the node). A member with a balance but no entry in `memberUnitMap`
 * is treated as their own unit (defensive — `buildMemberUnitMap` normally covers everyone).
 */
export function aggregateBalancesByUnit(
	memberBalances: Map<string, number>,
	memberUnitMap: Map<string, string>
): Map<string, number> {
	const unitBalances = new Map<string, number>();
	for (const [memberId, balance] of memberBalances) {
		const unitKey = memberUnitMap.get(memberId) ?? memberId;
		unitBalances.set(unitKey, (unitBalances.get(unitKey) ?? 0) + balance);
	}
	return unitBalances;
}

/**
 * The Money-Unit settle-up: per-member balances → aggregate to unit-nodes → run the SAME
 * greedy simplification on those nodes (ADR-0015). The returned `DebtEdge`s have unit KEYS
 * as `from`/`to` (a declared unit's id, or a solo member's own id). Any one member of the
 * `from` unit can settle the whole edge, clearing every co-member's share. With no units
 * declared, every node is a unit of one and this reduces EXACTLY to per-person `simplifyDebts`.
 */
export function simplifyDebtsByUnit(
	expenses: Expense[],
	settlements: Settlement[],
	units: MoneyUnit[],
	allMemberIds: string[]
): DebtEdge[] {
	const memberBalances = computeBalances(expenses, settlements);
	const memberUnitMap = buildMemberUnitMap(units, allMemberIds);
	const unitBalances = aggregateBalancesByUnit(memberBalances, memberUnitMap);
	return simplifyFromBalances(unitBalances);
}

/**
 * The even-share DEFAULT budget for a unit: `(groupBudgetTotal ÷ totalHeads) × unitSize`.
 * This is the per-head share scaled by the number of people in the unit. Null group budget
 * → null (no budget set). Guards `totalHeads` against 0.
 */
export function defaultUnitBudget(
	groupBudgetTotal: number | null,
	totalHeads: number,
	unitSize: number
): number | null {
	if (groupBudgetTotal == null) return null;
	const heads = Math.max(1, totalHeads);
	return (groupBudgetTotal / heads) * unitSize;
}

/**
 * The effective budget for a unit: the ABSOLUTE custom override when set (full stop — it
 * does NOT redistribute to other units and does NOT change the group total), else the
 * even-share default. The override is symmetric above OR below the even share (the even
 * share is the unset-default only, never a floor). null when there's no group budget AND
 * no override.
 */
export function effectiveUnitBudget(
	unit: Pick<MoneyUnit, 'members' | 'budget_usd'>,
	groupBudgetTotal: number | null,
	totalHeads: number
): number | null {
	if (unit.budget_usd != null) return unit.budget_usd;
	return defaultUnitBudget(groupBudgetTotal, totalHeads, unit.members.length);
}

/**
 * A unit's spent = Σ its members' individual shares (attribution is free once the unit is
 * defined — ADR-0015). `memberShares` maps member id → that member's reconciliation-aware
 * share of logged expenses (computed by `money-glance`'s `myShareOfExpenses` per member).
 * Members not in `memberShares` contribute 0.
 */
export function unitSpent(memberShares: Map<string, number>, unitMembers: string[]): number {
	let sum = 0;
	for (const memberId of unitMembers) {
		sum += memberShares.get(memberId) ?? 0;
	}
	return sum;
}

/**
 * The unit a member belongs to, for auto-scoping the glance to the viewer's OWN unit
 * (persistent + declared → no per-view picking). Returns the declared unit containing
 * `meId`, or a synthetic unit-of-one ({ id: meId, members: [meId] }) when the member is in
 * no declared unit (a solo member is a unit of one — unchanged).
 */
export function unitForMember(units: MoneyUnit[], meId: string): MoneyUnit {
	const found = units.find((u) => u.members.includes(meId));
	if (found) return found;
	return { id: meId, members: [meId], budget_usd: null };
}

/** A settle-up edge between unit-nodes, carrying both the unit KEYS (for labels / "is this
 *  my unit") and a REPRESENTATIVE member on each side (for recording the member-level
 *  settlement — "any one member settles the unit's net", ADR-0015). */
export interface UnitDebtEdge {
	/** Representative member of the paying unit — the from_member to record. */
	fromMember: string;
	/** Representative member of the receiving unit — the to_member to record. */
	toMember: string;
	/** Unit key of the paying side (a declared unit id, or a solo member id). */
	fromUnit: string;
	/** Unit key of the receiving side. */
	toUnit: string;
	amount: number;
}

/**
 * The unit-collapsed settle-up as edges that are RECORDABLE at the member level. Runs the
 * unit aggregation + greedy (ADR-0015), then maps each unit-node key back to a
 * representative member so the existing `?/recordSettlement` (which writes member ids into
 * a settlement) stays correct: one member of the `from` unit pays one member of the `to`
 * unit, and because `computeBalances` applies that settlement at the member level, the next
 * aggregation re-nets every co-member's share to zero. The representative is the unit's
 * first member (deterministic); for a solo node it's the member themselves.
 */
export function unitDebts(
	expenses: Expense[],
	settlements: Settlement[],
	units: MoneyUnit[],
	allMemberIds: string[]
): UnitDebtEdge[] {
	const edges = simplifyDebtsByUnit(expenses, settlements, units, allMemberIds);
	const unitById = new Map(units.map((u) => [u.id, u]));
	const repFor = (unitKey: string): string => {
		const unit = unitById.get(unitKey);
		// A declared unit → its first member; a solo node's key IS the member id.
		return unit && unit.members.length > 0 ? unit.members[0] : unitKey;
	};
	return edges.map((e) => ({
		fromMember: repFor(e.from),
		toMember: repFor(e.to),
		fromUnit: e.from,
		toUnit: e.to,
		amount: e.amount
	}));
}
