# #424 Ideas grouped by type Implementation Plan

> **For agentic workers:** svw:executing-plans, inline. Steps are checkboxes.

**Goal:** Parking-lot ideas read as a categorized list: the type moves from each card to a group heading (icon + plural label), the card loses its icon and gains a `place · cost` sub-line, grip handles retire in favour of whole-card drag.

**Architecture:** Pure derivations in `src/lib/itinerary/idea-groups.ts` (group order, plural labels, in-group score sort, run-start headings, sub-line), unit-tested first. One shared `IdeaCard` (title, sub-line, existing read-only vote pill, assignees) and `IdeaGroupHeading` used by the day page zone (`ParkingLotSection`, dnd + inert rail modes) and Phase Detail (`PhaseIdeas`, replaces `PhaseParkingReorder`). Headings live INSIDE the dnd wrapper of the first idea of each run (same trick as `TimeSlotDivider` in `DayTimeline`), so svelte-dnd-action's 1:1 children mapping holds.

**Spec:** `docs/plans/2026-10-06-card-system/spec.md` (Ideas grouping D7, Votes D3, Drag); `docs/CARD_SYSTEM.md` D2 D3 D10; `CONTEXT.md` (Parking Lot, Vote).

## Scope notes
- Tap-to-vote pills and the sort-by-votes UX are #425 (blocked by this). Existing read-only `VoteSentimentPill` stays; Phase Detail now loads item votes so the in-group sort has its input.
- Dragging among ideas changes nothing: same-zone parking finalize reseeds (no `reorder` post). The `?/reorder` action on Phase Detail stays (unused by UI; separate cleanup).
- Desktop rail (>= 1280px) is inert today; mouse drag from the rail is #445.

## Global Constraints
- Group order Lodging · Flights · Transportation · Activities · Meals · Notes; empty groups omitted.
- Idea card: no type icon; sub-line `place · cost` (`Sheboygan · $40`), empties omitted.
- Pull-up (owner, day page) stays; 44px hit area.
- Touch: long-press 250ms (`delayTouchStart`) anywhere on the card; mouse immediate.

### Task 1: Pure derivations (TDD)
- [ ] `idea-groups.test.ts` red: order, plural labels, in-group sort (score desc, sort_order asc), unknown type -> Notes, run starts, sub-line, scores from votes.
- [ ] Implement `idea-groups.ts`; green; commit `feat(#424)`.

### Task 2: Components + surfaces
- [ ] `IdeaCard`, `IdeaGroupHeading`; rewrite `ParkingLotSection` (grouped dnd + inert, grips out, long-press), `ParkingDivider`, `DragDropTimeline` (no handle unlock, same-zone = reseed), day page order; `PhaseIdeas` + phase server votes; `GhostCard` drops icon; delete `PhaseParkingReorder`.
- [ ] `pnpm check`, commit.

### Task 3: Visual + e2e
- [ ] Seed flag `ideas` in `dev-auth.pb.js`; `verify:visual` day + phase at 375/768, desktop 1280.
- [ ] `ideas-by-type.spec.ts` (headings order, no icon, long-press drag plans); grep old selectors; `E2E_SLOT=3 pnpm test:e2e:clean`.
- [ ] CARD_CONTENT_SPEC parking-lot section; PR.
