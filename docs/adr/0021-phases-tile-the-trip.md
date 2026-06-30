# ADR-0021: Phases tile the trip (partition model with a shared travel day)

**Status:** Accepted (decision); build pending (a feature — needs plan → execution)
**Date:** 2026-06-30
**Deciders:** Scott
**Context:** #323. Surfaced from dogfood: on a real trip *every* day showed the "Travel day" pill and **two** parking zones on the day view — one labelled `TRIP · N`, one the real leg (`KHAO SOK · 5`). Root cause, confirmed in code: `backend/pb_hooks/trips.pb.js:108` auto-seeds a default **"Trip" phase spanning the whole trip** on trip creation (#217) — because a trip must always have ≥1 phase (items require one; the phases delete hook blocks removing the last). Days are bucketed to **every** phase whose date range contains them (`phasesForDay`, `phases.pb.js`), and there is **no overlap validation**. So once you add real sub-phases (Khao Sok, Krabi), the whole-trip "Trip" phase lingers and overlaps all of them → every day belongs to 2 phases → every day reads as a boundary/travel day → the per-phase parking split (#87) renders two zones everywhere. The `TRIP` label read as a *trip-level* parking lot, not a phase — the real source of confusion.

## Decision

### Phases partition (tile) the trip
Every [[Day]] belongs to a phase — **no gaps**. Phases are non-overlapping **except that two adjacent phases share their single boundary day** (the [[Travel Day]] — the day you transition between legs, which matches reality and is a feature, not a bug). A trip always has ≥1 phase: it **begins as one phase spanning it** (the auto-seed), and is **subdivided** as you plan. A whole-trip phase therefore exists **only when there is exactly one phase** — the instant you add a second, the trip is a tiling of named segments.

### Add = split, delete = merge
- **Adding a phase splits** the covering segment: carving Khao Sok (19–21) out of Trip (17–24) yields `[Trip 17–19] [Khao Sok 19–21] [Trip 21–24]`; adding Krabi (21–24) turns the tail into Krabi → `[Trip 17–19] [Khao Sok 19–21] [Krabi 21–24]`. The leftover head (17–19) is a normal 2-day segment now — **not** whole-trip — so it never pollutes other days.
- **Deleting a phase merges** its span into the previous neighbour (items follow). Tiling is invariant under both.

### Un-named split remainders default to "Phase 1…N"
A split leaves a remainder (e.g. the 17–19 arrival head). It keeps a positional default name **"Phase 1", "Phase 2", …** until renamed — never blocks you to name it mid-split (that fights the "fewer taps" goal). The point of the rename-default is that a parking zone reads as *a place*, never the misleading generic `TRIP`.

### Item re-homing
On a split, **planned** items (which have a day) re-home to the phase that now owns their day; **day-less ideas** (unplanned, phase-only) stay with the leftover segment they were in. On a delete/merge, items follow into the merge-target neighbour.

## Why not the alternatives

- **Free-floating phases + reject >1-day overlap** (the issue's first framing). Rejected: with the whole-trip auto-seed present, *every* real phase overlaps it by its full length, so overlap-rejection would block you from adding **any** real phase. The fix is the phase *lifecycle*, not a validation gate.
- **Strict partition — each day in exactly one phase, no shared day.** Rejected: it kills the travel-day concept, which "is how it works in reality" (you physically transition between legs on one day). Scott chose the shared boundary day; a two-zone *travel* day is correct and intelligible **once the zones carry real leg names**.
- **A single auto-managed "unassigned" bucket that shrinks to the gaps.** Dead end: an *interior* phase splits the gap into two disjoint ranges, and one phase record can't span a gap.
- **Allow phaseless days / relax "items require a phase."** A cleaner long-term model (items belong to a day, phases are an optional overlay) but a much bigger change touching the whole itinerary + parking-lot model. Deferred — tiling is the smaller, coherent step.

## Existing data
**No migration.** Dogfood-only data — a blanket reshape across all real trips is high-risk for a handful of cases. Scott reshapes his existing trips **manually** via the new phase editor (e.g. shrink "Trip" 17–24 → 17–19, rename to "Bangkok"). The new tiling logic ensures it never recurs.

## Consequences
- **#323 becomes a feature**, not a quick fix: a new phase interaction (split/merge + tiling enforcement) + the day-strip editor. Slice MVP-first — **tiling enforcement via the existing date-picker phase form** — before the **V2 drag-divider day-strip editor** ("fewer taps, more tap-and-drag", Scott's UX goal).
- **#324 stays open** (empty/collapsed per-phase parking zone won't accept a drop) — legit travel days still produce two zones, so the drop bug is real, just rarer. Lower priority.
- **#325 unaffected** (parking-divider expand affordance).
- **The auto-seed (#217) changes:** the seeded sole phase is fine (one phase = whole trip, no pollution); the bug is that it *persists at whole-trip span* after subdivision. The split logic must absorb it.
- **Glossary updated** (`CONTEXT.md`): [[Phase]] (tiling + shared boundary + subdivided-from-one), [[Day]] (exactly one phase, or two on a travel day), new [[Travel Day]].
- **SPEC reconciliation** rides the build slices (per the "SPEC current via PRDs, never a standalone pass" rule): `docs/SPEC.md` `phases`/`days`/`items` schema notes (§ around the `phases` collection — drop "0..n", state the tiling invariant + shared-boundary; `day.phase` "computed from date" → tiled membership) and the off-the-table/■ phase-model prose.
