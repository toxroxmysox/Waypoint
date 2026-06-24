# ADR-0018: Money has two independent axes — unit (settlement collapse) and participation (split membership)

**Status:** Proposed
**Date:** 2026-06-23
**Deciders:** Scott (ratifies)
**Context:** BUILD_PLAN S8 · capability **Money** · research, no PR. Amends/extends `docs/adr/0015-money-units-collapse-settle-up.md`. Issue #267. Money Units (S10, #266) must not bake a whole-group-split assumption into its data model: if "who pools money" (unit) and "who an expense splits across" (participation) are stored or reasoned about as one thing, Waypoint re-creates the exact Splitwise friction ADR-0015 set out to avoid — every expense silently splitting the whole roster, the unit becoming a de-facto split scope, and "just me and my wife paid for the cab" becoming impossible to express cleanly. ADR-0015 already asserted these are orthogonal ("the unit is orthogonal to splitting"; "Split is never affected") but did so as a property of one decision; #266 needs it stated as a **standing invariant** that constrains the data model before any code lands. The #259 transfer-on-reassign (shipped) is the participation axis already in motion — proof the two axes move independently in live code. This ADR is the **model**, not an implementation: it builds no money_units and chooses no UI.

## Decision

### The two axes

Money in Waypoint reasons about a member along **two independent axes**. Every expense and every settle-up touches both, but they answer different questions and never collapse into each other.

**Axis 1 — Participation (the split axis).** *"Who is in this expense's split, and for how much?"* This is per-**Expense**, scoped to a single money record. It lives in `expenses.split_data` — either `{ members: [...] }` (equal split) or `{ amounts: { id: n } }` (by-amount). It is the input to `computeBalances` / `debt-simplify` — it decides who owes whom and how much *before* any collapse. Participation is a property of an **expense**, set when the expense is logged, and varies expense to expense: the same three people can split dinner three ways and a cab two ways.

**Axis 2 — Unit (the settlement-collapse + glance axis).** *"Who settles as one?"* This is per-**trip**, a self-declared, leave-able [[Money Unit]] (ADR-0015) — a couple, an ad-hoc pool, or a solo member as a unit of one. It does **not** decide who is in any split. It acts **after** participation has produced per-person balances: it aggregates each member's balance into their unit-node so intra-unit debts wash and any one member settles the unit's net (ADR-0015 settle-up collapse). The unit also scopes the personal glance (spent/budget summed across its members). A unit is a property of the **trip's roster**, set once, stable across all expenses.

### They stay orthogonal — the invariant

The two axes are **independent and must never be conflated**:

- **Participation is per-expense; unit is per-trip.** They have different lifetimes and different owners (an expense's author sets its split; the roster declares units).
- **Being in a unit changes nothing about any split.** "Three units of five people still splits five ways" (ADR-0015). A unit is never a default participant set, never a split scope, never a payer.
- **Being a split co-participant implies nothing about units.** Two people splitting a cab are not thereby a unit and do not settle as one.
- **The mechanical test for any future Money feature:** if a proposed field or rule lets the *unit* decide split membership, or lets a *split* imply settlement collapse, it is conflating the axes and is **forbidden** by this ADR. The unit feeds `debt-simplify`'s pre-aggregation step (ADR-0015); participation feeds `debt-simplify`'s input. They meet only inside the settle-up pipeline, in that fixed order (participation → balances → unit-collapse → simplified debts), never in storage.

### Why this is the Splitwise-friction fix

Splitwise (and the naive read of #266) makes the unit *be* the split: a "group" or a shared identity becomes the implicit set of who-splits, so every expense splits everyone and carving out "just us two paid" is friction. Keeping the axes orthogonal means **participation stays expense-local and explicit** (you name who's in *this* split, default-whole-group but freely narrowed — see [[Paid Moment]] "split ← whole group, editable") while **the unit stays a settlement convenience** that never reaches back into what an expense means. The group can have households *and* still split a single taxi between two named people without the household leaking into it.

## Consequences for #266 (Money Units) and `split_data`

This ADR **blocks Money Units (#266 / S10)** — #266 inherits these constraints:

- **`money_units` stores membership and (optional) budget override only.** It is the unit axis: trip-scoped member grouping + the ADR-0015 personal budget override. It carries **no split semantics** — no "default split set," no participant list, no payer. A unit is not referenced by `expenses.split_data` and never appears in a split's shape.
- **`split_data` stays the sole participation record, keyed by `trip_members` id, never by unit.** Splits name **members**, not units. Settle-up reads member-level balances out of split-derived `computeBalances`, *then* applies the unit pre-aggregation (member → unit-id) in front of `debt-simplify` (ADR-0015). A unit id never enters `split_data`; a member id never carries unit meaning inside a split.
- **The collapse is a settle-up-time projection, not stored state.** Intra-unit wash and inter-unit net are computed in the settle-up pipeline from (member balances × unit map). Nothing rewrites `split_data` to "merge" unit members. The per-person breakdown survives under the unit-net (ADR-0015 display note).
- **Defaults compute on the member axis, scoped by the unit axis for display only.** Even-share default = group ÷ heads (members, not units); the glance then *sums* a unit's members' shares for the viewer's auto-scoped view. The budget override is the unit's absolute target, decoupled, non-redistributing (ADR-0015) — a unit-axis fact that never alters any expense's split.

### #259 is the participation axis, already shipped

The #259 reassign logic (`src/lib/money/transfer-split.ts` `transferSplitParticipation`; the faithful goja port inlined in `backend/pb_hooks/members.pb.js`'s reassign block) is **the participation axis decided and shipped as a subset of this model.** When a departed member is reassigned, the hook rewrites `expenses.split_data` to move that member's *split participation* to the target (move-to-target merge: dedupe for equal splits, sum for by-amount) — operating purely on the participation axis, per-expense, keyed by member id, with **no notion of units anywhere in the code path** (units don't exist yet, and this proves they needn't). The function is even *named* `transferSplitParticipation`, and ADR-0008 (tombstone resolution) is what makes per-expense participation a thing that must be rewritten rather than cascaded: money records are immutable financial facts kept with a tombstone, so a reassign edits *participation* in place. #266 generalizes the **other** axis (unit) over the same `split_data` without touching it — confirming the two move independently. #259 is, concretely, this ADR's participation axis already in production; #266 adds the unit axis beside it.

## Considered and rejected

- **One axis: the unit *is* the split scope** (the Splitwise model — a group/household defines who-splits). Rejected: this is the friction we are eliminating. It makes "whole-group split" the silent default and "just two of us" an uphill edit, and re-couples settlement identity to expense membership. The whole point of ADR-0015's unit was to be a *settle-up* convenience, not a split scope.
- **Store the unit collapse into `split_data`** (rewrite splits so unit members merge at log time). Rejected: it destroys the per-person breakdown (ADR-0015 keeps it under the unit-net), bakes a per-trip fact into per-expense records (so leaving a unit would require rewriting historical splits), and violates the "collapse is a settle-up-time projection" consequence. Collapse belongs in the `debt-simplify` pre-step, computed, not stored.
- **Reference `money_units` from `split_data`** ("this expense splits across units X, Y"). Rejected: a unit is leave-able and per-trip; an expense's split is an immutable historical fact. A unit id in a split would make a member leaving their unit retroactively change what an old expense meant. Splits are keyed by member, full stop.
- **Leave it implicit in ADR-0015.** Rejected — that is the failure mode #267 names: ADR-0015 stated orthogonality as a property of one decision; without it pinned as a standing invariant, #266's data model could quietly re-fuse the axes, and the first money_units schema would decide it implicitly.

## Consequences

- **Money Units (#266 / S10) is gated on this ADR** and inherits the invariant: `money_units` = membership + optional budget override, **zero split semantics**; `split_data` stays the sole, member-keyed participation record; the collapse stays a settle-up-time projection. Everything else (the date-wedge, etc.) runs parallel — nothing else depends on this.
- **No code, no schema, no migration.** This is a model/posture ADR. `money_units` is still unbuilt; this fixes the rules its build must obey.
- **CONTEXT.md gains the two-axis framing.** The [[Money Unit]] term already says "splitting is unaffected (always per-person)"; on #266 ship, CONTEXT should name the two axes explicitly (participation = `split_data`, per-expense; unit = `money_units`, per-trip) so the orthogonality is glossary-visible. Deferred to the #266 build, not done here.
- **Every future Money feature inherits the mechanical test:** a unit may not decide split membership; a split may not imply settlement collapse. The two axes meet only in the settle-up pipeline, in fixed order, never in storage.
- **#259 is reframed, not changed.** `transferSplitParticipation` is recognized as this model's participation axis already shipped; no edit to it — this ADR documents what it already proves.
