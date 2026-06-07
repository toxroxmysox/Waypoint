# ADR-0002: Multi-day items use an asymmetric start/end storage model

**Status:** Accepted
**Date:** 2026-06-06
**Deciders:** Scott
**Context:** Issue #41

## Decision

A multi-day item (hotel, rental car, overnight transport, multi-day note) stores its span asymmetrically: the **start** is the existing `day` **relation** to a Day record, while the **end** is a new plain `end_date` **date field** on `items`. We deliberately did *not* make the two symmetric.

## Why

The start `day` relation does real work that a bare date cannot:

- **Phase membership** — a Day belongs to 1..n phases (multi-relation); the day→phase bucketing in `backend/pb_hooks/phases.pb.js` keys off it.
- **Day notes** — `Day.notes` is a real field hung off the Day record.
- **Indexes & queries** — `idx_items_trip_day_sort`, every `items WHERE day = dayId` load, drag-reorder `sort_order` within a day, and `MoveItemSheet` are all relation-based.

The **end** day needs none of that. It is purely "when does the span stop." It carries no independent phase membership (the item already has a `phase` field) and no notes. A plain date is exactly the right shape, and it keeps the end date *on the item* so span computation (`itemSpansDay`) needs no relation expansion.

## Considered and rejected

- **`end_day` relation (symmetric with start).** Couples the item to generated/backfilled Day records (cf. migrations 0011/0012), and forces every span computation to resolve two relations to their `.date`. The glossary says "end *date*," not "end day." Symmetry for its own sake, paying coupling + resolution cost for nothing the end day actually needs.
- **Refactor `day` → `start_date` (symmetric the other way).** Would touch nearly every itinerary query, the move logic, the indexes, and the day↔phase model — a large, risky refactor orthogonal to #41, regressing bucketing logic just fixed in PR #43.
- **Overload `end_time`'s date component (no new field).** Zero schema change, but cannot express an untimed lodging span (no checkout time → empty `end_time` → no span detectable).

## Consequences

- The model reads asymmetrically: `day` relation + optional `start_time` for the start, `end_date` date field + optional `end_time` for the end. A future reader will notice this — that's what this ADR exists to answer.
- `isMultiDay` is derived (`end_date && end_date > startDayDate`), never stored.
- Span rendering is date-driven and phase-agnostic, so cross-phase spans (rental car across legs) work with no special-casing.
- Reversing to a relation later is a migration — non-trivial but not catastrophic.
