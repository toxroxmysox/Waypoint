# ADR-0022: `forming` — a derived, dateless trip lifecycle state

**Status:** Accepted
**Date:** 2026-07-03
**Deciders:** Scott
**Context:** Issue #270 (S11 grill). Keystone unblock for Ideation (#271 date-finding wedge — "the
poll is the invite" — by definition starts before dates exist). Today the schema forbids a dateless
trip (`0002_trips.js` — `start_date`/`end_date` `required:true`).

## Decision

A trip may exist **without dates**. Such a trip is in the **`forming`** lifecycle state.

1. **Derived, not stored.** `forming` ⇔ `start_date` is empty. No `status` field. It joins the
   existing derived 4-state lifecycle (`getTripLifecycle`, #195) as the fifth state, following the
   house rule set by multi-day items (ADR-0002) and trip-mode activation: lifecycle is computed from
   data, never persisted as a flag that can drift.
2. **Schema:** append-only migration relaxes `trips.start_date` / `end_date` to optional
   (imperative field-modify API). Both-or-neither is enforced at the app layer: a trip has either no
   dates (forming) or both (dated).
3. **Front door — name-first create.** One create form: title/location first, dates behind an
   optional "I know the dates" expander. Skipping dates creates a forming trip. No separate
   "start an idea" path.
4. **Forming scope: Ideas + Members + Goals.** Collect ideas (unplanned items already require no
   day), invite people, set goals. Day/phase/timeline, money, and documents surfaces are hidden
   until dated; a prominent "set dates" affordance carries the promotion. Trip settings stay
   reachable (chrome, not a capability).
5. **Promotion is one-way.** Setting dates on a forming trip promotes it: the create-time seeding
   (auto "Phase 1" + day generation) runs at first-dating via the update path. Clearing dates on a
   dated trip is blocked (hook + form) — days/phases/items exist by then and un-dating is
   destructive. Date *edits* remain allowed (day reconciliation already exists). Revisit backward
   transition only on real demand.
6. **List presentation:** forming trips live in the same trips list with a subtle "No dates yet"
   badge, sorting ahead of past trips. "Forming" stays internal vocabulary — never a UI label.
7. **`isTripActive` unchanged.** Empty dates can never satisfy the active-window comparison;
   forming trips are never active, with no special-casing.

## Considered and rejected

- **Stored `status` select (`forming|dated|…`).** Rejected: a persisted flag that must be kept in
  sync with dates; the codebase precedent is derivation.
- **Separate "idea" entity promoted into a trip.** Rejected: a forming trip IS the trip — members,
  ideas, and goals accrue to the same record; promotion is a date-set, not a data migration.
- **Symmetric un-dating.** Rejected for v1: destructive (deletes days/phases, parks items) with no
  demonstrated demand.

## Consequences

- The create hook (`trips.pb.js`) must guard phase/day seeding on dateless creates; the update hook
  gains the empty→set promotion branch (seed "Phase 1" + days) and rejects set→empty.
- Nav/AppShell gains forming-aware tab gating; trips list gains the badge + sort tweak.
- #271 (date-finding wedge) can now attach a poll to a forming trip; promotion is the poll's
  resolution writing dates.
- SPEC.md schema/nav sections amended with the exec slice (issue #270).
