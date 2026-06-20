# ADR-0015: Money Units collapse settle-up; budgets are bottom-up and decoupled

**Status:** Accepted
**Date:** 2026-06-19
**Deciders:** Scott
**Context:** `docs/TRIP_MONEY_PRD.md` (#211) part-A deferral → issue #230, grilled 2026-06-19. The #227 glance is per-person (`my-budget` = group total ÷ heads; `my-spent` = reconciliation-aware share). Couples who share a card want it scoped to a UNIT ("are my wife and I on budget"), and `trip_members` is flat — no couple/household concept. The naive read suggested two heavy mechanisms (a joint-payer field; a top-down per-head budget partition); the grill rejected both.

## Decision

### Money Unit — a settle-up + glance grouping, not a split or payer concept
A **Money Unit** is a self-declared, shared, trip-scoped grouping of members who pool money (a couple, or any ad-hoc pool). A member creates it and adds others; anyone can leave (opt-out is the consent valve). A solo member is a unit of one.

### Split is never affected
Expenses always split **per-person**. A unit changes nothing about how an expense divides (three units of five people still splits five ways). The unit is orthogonal to splitting.

### Settle-up collapses to unit-nodes
Settle-up runs on **unit-nodes, not people**: aggregate each member's balance into their unit, then run the existing greedy debt-simplification on those nodes.
- **Intra-unit debts wash for free** (same node) — no Scott↔Abby settlement.
- **Inter-unit debts net** at the unit level, and **any one member settles the unit's net** (Justin pays the {Alex,Justin}→{Scott,Abby} amount, clearing both his and Alex's shares).
- This makes a **joint-payer field unnecessary**: one member logs the payment (today's model) and intra-unit suppression yields the identical math to a joint payer — which Venmo can't represent anyway.
- Implementation: a pre-aggregation (member → unit-id) in front of `debt-simplify`; nothing rewritten. The per-person breakdown can still render under the unit-net.

### Budgets are bottom-up and decoupled
The glance **auto-scopes to the viewer's own unit** (persistent + declared → no per-view picking). Unit spent = Σ members' shares.
- **Default** unit budget = the even share (group ÷ heads × unit size).
- A unit may set a **custom override**: an **absolute** number that is its target, full stop. It does **not** redistribute to other units and does **not** change the group total; other units' shares compute as if no overrides exist. Sum of unit budgets ≠ group total is expected — they're decoupled (the group budget stays the planning envelope + default-share source).
- The override is **symmetric** above or below the even share; the even share is the unset-default only, never a floor. A unit budgeting below its share just has a tighter target.

## Considered and rejected
- **Joint-payer field** ("Scott and Abby pay"). Rejected: one-payer + intra-unit settle-up suppression is mathematically identical and far simpler; Venmo can't represent a joint payer anyway.
- **Per-user ad-hoc "money circle" view** (no shared data). Rejected: suppressing an intra-unit balance is a *shared* fact (it must hold in the group's settle-up), so the unit can't be a private lens.
- **Persistent rigid household entity.** Rejected for an ad-hoc, leave-able grouping that flexes to messy units (three friends in a room, covering a parent).
- **Top-down budget partition** (group total divided into per-unit allocations that must sum). Rejected: "I can't force a budget on people" — budgets are bottom-up; a unit's number is its own and doesn't constrain or redistribute to others.

## Consequences
- New Money Unit data (shared, trip-scoped, members) + an optional per-unit budget. CONTEXT.md gains a **[[Money Unit]]** term.
- `debt-simplify` gains a unit-aggregation front-step; solo members (unit of one) are unchanged. The settle-up *display* may show per-person under the unit-net.
- The group-budget **meaning** is untouched here but is now known to conflate "shared-cost share" with "personal allowance" — split out to a separate finance-landscape refresh (shared-cost budget, communicated, with a rough→firm lifecycle; the glance's shared-vs-personal split). #230 ships the unit + personal-override mechanics only.
- The settle-up math change is dogfood-critical — verify on a fresh PB / real-ish data before deploy.
