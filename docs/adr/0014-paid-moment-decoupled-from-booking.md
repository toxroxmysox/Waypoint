# ADR-0014: Paid-moment expense capture is decoupled from booking

**Status:** Accepted
**Date:** 2026-06-19
**Deciders:** Scott
**Context:** `docs/TRIP_MONEY_PRD.md` (Trip-Mode Money, #211) → Grill Resolutions parts B & C; issues #229 (paid-moment capture) and #228 (reusable prefilled add-expense), grilled together 2026-06-19. The PRD's original design — and the CONTEXT.md [[Expense]] entry — specified capture at the **booked moment**: flipping an item's `booked` flag would raise a dismissible "log what you paid" toast prefilled from the item. Scott's steer reopened it: *"booking isn't always the right signal, only sometimes."* For the big line items the feature exists to capture (group lodging, flights, car), `booked` ≠ money-left-account — a reservation can hold-now/charge-later, or be deposit-then-balance — so a booked-fired toast mostly mis-captures and trains the user to dismiss it.

## Decision

Expense capture from an [[Item]] is triggered by an **explicit, persistent "Log payment" money-event affordance on the item**, not by the `booked` flag. Two consequences fix the model:

1. **"Paid" is derived, not stored.** An item is paid **iff it has ≥1 linked [[Expense]]** (`expenses.linked_item`, via `linked-expenses.ts`). There is **no `paid` flag** on the item.
2. **`booked` and paid are orthogonal.** `booked` keeps its sole meaning — [[Booking Readiness]], a reservation exists. Booking (from either path) fires **no** capture. Capture is the user tapping "Log payment."

The affordance is a **state flip** keyed on the same linked-Expense predicate:

- **0 linked expenses** → **"Log payment"** (opens the prefilled add — #228).
- **≥1 linked expense** → **"Paid $X"** summary with a link-out to the item's expenses. A further payment (deposit→balance) stays loggable there but is no longer prompted. **Never nag, never block.**

Shown on any payable item (every [[Item Type]] except `note`) with no linked expense; open to any non-[[Role|viewer]].

## Why

- **A reservation is not a payment.** Hold-now/charge-later and deposit-then-balance make `booked` a poor proxy for money out. Tying capture to `booked` mis-fires on exactly the largest line items — the ones the mid-trip "spent" number most needs to be real.
- **A toast that's usually wrong trains dismissal.** Once users learn the booked toast is noise, they dismiss it reflexively — and the genuine capture moments go with it.
- **Deriving paid from the linked Expense is free and self-consistent.** No schema field to add, migrate, or keep in sync. It reuses `linked-expenses.ts`, gives **cross-member dedupe** for nothing (the flip is shared state — once anyone logs, everyone sees "Paid $X"), and handles **multi-payment** items (deposit + balance) naturally, where a single boolean flag could not.
- **It keeps `booked` honest.** `booked` means one thing (Booking Readiness); no payment semantics are smuggled onto it.

## Considered and rejected

- **Booked-flip toast (the original #211 design).** Rejected: mis-captures the big line items, trains dismissal, and conflates reservation with payment. This ADR reverses it.
- **A stored `paid` / `prepaid` flag on the item.** Rejected: redundant with the linked Expense (the real source of truth), adds a field to migrate and sync, and can't represent deposit-then-balance. The linked-Expense predicate subsumes it.
- **Per-row capture on the booking Smart List** (wire `?/book` to return the item, consume `result`). Rejected: the list is a *batch* booking sweep; a capture prompt per book recreates the dismissal-training problem this ADR exists to kill. The list gets only a quiet footer link to the expenses page instead.
- **Auto-creating the Expense on the money event.** Rejected (also a PRD non-goal): capture always opens an editable, dismissible prefill — never a silent write.

## Consequences

- **CONTEXT.md is updated:** the [[Expense]] entry's booked-moment parenthetical is reversed, and a new **[[Paid Moment]]** glossary term is added. "Booked moment" / "log-what-you-paid toast" / "paid flag" become deprecated synonyms.
- **#228 is the enabler:** the reusable prefilled add-expense (URL params `amount` / `description` / `date` / `linked_item`; `initial*` props that don't touch `isEdit`). #229 builds the affordance + state flip on top.
- **The pre-trip / on-trip split (#227) keys off `expense.date`, not `booked`.** The user sets the date (defaults to today, backfilled when logging a prepaid item late) — so classifying prepaid vs on-trip spend depends on the date, not on any booking signal.
- **`?/book` is unchanged** — it still returns `{ success: true }` with no item payload; nothing now depends on it returning the item.
- **Placement of the affordance is deferred** to a Claude Design push (card / Trip-Mode surfacing); the build's functional home is the item detail page. This ADR fixes the *trigger model*, not the pixels.
- **Quick-split presets** (one-tap whole-group / solo) are split out to their own non-blocking issue; the defined-unit preset rides #230.
