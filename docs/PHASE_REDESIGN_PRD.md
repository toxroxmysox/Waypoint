# Phase Sub-tab Redesign — PRD

> Milestone: [#2 Phase sub-tab redesign](https://github.com/toxroxmysox/Waypoint/milestone/2)
> Grilled: 2026-06-07. Status: ready-for-agent.
> Domain language: see `CONTEXT.md` (Phase, Day, Item, Parking Lot, Item Status, Sort Order, Multi-day Item).
> Field→slot content contract for the item/day cards: see `docs/CARD_CONTENT_SPEC.md` (grilled 2026-06-10) — binding reference the card build wires against.

## Problem Statement

The **Parking Lot** (a phase's unplanned items — colloquially "ideas") is scattered, inconsistent, and barely usable on mobile:

- It appears in three places that don't agree: a read-only list on **Phase Detail**, an "Ideas" drag section on **Day Detail**, and a standalone `/parking-lot` page under the **More** menu. The standalone page shows *all trip* unplanned items, contradicting the glossary, which defines the Parking Lot as **phase-scoped**.
- There is **no way to add an idea directly to the parking lot** — every "+ Add" entry point forces a Day, producing a planned item. The only path to an unplanned item is to create one and omit the day, which the UI doesn't surface (#57).
- Drag-to-reorder and drag-to-park are built on native HTML5 drag-and-drop, which **never fires on iOS touch** — so on the primary device the feature is dead and a long-press just pops Safari's "Open in New Tab" callout (#60).
- The day cards on the trip overview look "small and empty" and differ from the day cards inside the phase view for no clear reason (#65); the "Promote to primary" control no longer matches the current model (#58).

The Phase sub-tab should be the coherent home for planning a leg of the trip — but today it's a thin shell around an edit form.

## Solution

Make the **Phase** the home of phase-scoped planning, and make ideas first-class and mobile-native.

- **Parking Lot is strictly phase-scoped.** Retire the trip-wide `/parking-lot` page. Every parking-lot surface shows the same phase's unplanned items.
- **Phase Detail is the canonical parking-lot home**: list ideas, **add an idea** (creating an unplanned, phase-scoped, day-less item), and reorder them.
- **Day Detail gets a collapsed drop-divider** beneath the timeline — "Parking lot · N", tap to expand — that is always a drop target (even when empty). When a Day belongs to two Phases (a boundary day), the divider splits into **one drop target per Phase**; an idea can only be pulled into the day within its own Phase (phase is sticky — moving phases requires editing the item).
- **Touch drag works**, via `svelte-dnd-action`: reorder untimed items, eject any item to its phase's parking lot (which **unschedules** it — strips its time), and pull an idea into the day at a chosen position. Timed items stay pinned to their clock time (an in-place drop snaps back) but can be dragged out to park.
- **A layout pass** reconciles the Phase sub-tab UI and the day cards across overview vs. phase, and retires the obsolete "Promote to primary" language.

## User Stories

1. As a trip planner, I want to add an idea straight to a phase's parking lot without picking a day, so that I can capture "maybe in Seville" without committing it to a date.
2. As a trip planner, I want the parking lot to always mean "this phase's unplanned ideas," so that I'm never confused about whether I'm looking at one leg or the whole trip.
3. As a trip planner, I want one obvious home for a phase's ideas (the Phase view), so that I stop hunting between the More menu, the day view, and the phase page.
4. As a mobile user, I want to drag an item to reorder it within a day using my finger, so that I can rearrange my plan on my phone.
5. As a mobile user, I want a long-press on a card to not pop Safari's "Open in New Tab" menu, so that the app feels native rather than like a web page.
6. As a mobile user, I want to drag an item down into the parking lot to unschedule it, so that I can defer something without deleting it.
7. As a trip planner, I want a timed item I drag to the parking lot to lose its time, so that "unscheduled" actually means unscheduled and it won't silently re-anchor later.
8. As a trip planner, I want a timed item to snap back to its time if I try to reorder it in the timeline, so that the clock stays the source of truth for when things happen.
9. As a trip planner, I want to drag an idea from the parking lot up into the day at a specific position, so that it lands where I want it in the running order.
10. As a trip planner on a boundary day that spans two phases, I want separate parking-lot drop targets per phase, so that I don't accidentally pull a Seville idea into the Granada portion.
11. As a trip planner, I want pulling an idea into a day to keep the item's phase, so that drag never silently re-assigns a leg.
12. As a trip planner, I want the day's parking divider collapsed by default with a count, so that the day stays focused on the plan while ideas are one tap away.
13. As a trip planner with an empty parking lot, I want the drop target to still be there, so that I can park the very first item.
14. As a trip planner, I want to reorder ideas within the phase parking lot, so that I can prioritize what to consider first.
15. As a trip planner, I want a card tap (not the handle) to open item detail while the grip handle starts a drag, so that opening and reordering never fight each other.
16. As a desktop user, I want mouse drag-reorder to keep working, so that the touch rework doesn't regress the desktop experience.
17. As a keyboard user, I want to reorder via keyboard, so that drag isn't the only way to organize items.
18. As a trip planner, I want the day cards on the trip overview to carry useful minor info (note, activity count) and be the primary tap target, so that the overview is scannable instead of empty (#65).
19. As a trip planner, I want the day cards to look consistent between the overview and the phase view, so that the app feels coherent (#65).
20. As a trip planner, I want the obsolete "Promote to primary" control replaced with language that matches the current status model, so that the UI isn't lying about what it does (#58).
21. As a trip planner, I want the Phase sub-tab to present its parking lot, days, and edit affordances in a clear hierarchy, so that managing a leg is a single, legible screen.

## Implementation Decisions

### Domain / scope
- **Parking Lot is phase-scoped, full stop.** Reaffirms `CONTEXT.md`. The standalone trip-wide `/parking-lot` route is removed (or redirected); no "trip parking lot" concept is introduced. Introducing phase-less unplanned items would be a separate model change requiring its own grill + ADR — explicitly not done here.
- **Phase is sticky under drag.** Dragging an item between a day timeline and a parking lot changes its `status` and `day` but **never** its `phase`. Cross-phase moves remain an explicit edit on the item.
- **Eject-to-park unschedules.** Pushing any item to the parking lot sets `status=unplanned`, clears `day`, and clears `start_time`/`end_time`. For an already-untimed item this is a no-op on the time fields.

### Modules
- **`resolveDrop()` (new, deep module).** Pure function that maps a drag result to a domain action. Input: the source zone, the target zone, the moved item, the neighbor `sort_order` values at the drop position, and the set of `phase` ids the target day belongs to. Output: a tagged action — `{ kind: 'reorder', before, after }` | `{ kind: 'pull', before, after }` | `{ kind: 'push' }` | `{ kind: 'reject' }` | `{ kind: 'snapback' }`. Encodes all the rules: untimed reorder, timed in-place → `snapback`, eject → `push`, pull-from-parking → `pull` (only if the idea's phase is among the day's phases, else `reject`). This is the single source of truth for drag semantics; the Svelte components and server actions are thin around it.
- **`neighborsForMove()` (new).** Given a flat ordered list and a moved id, returns `{ before, after }` `sort_order` values for `insertBetween`.
- **`buildTimelineFlat()` (new, in the timeline module).** Returns the day's items in display order as a flat list (timed items pinned by time, untimed by `sort_order`, interleaved) with each item's `anchored` flag and an optional `slotLabel` (Morning/Afternoon/Evening). Exists so `svelte-dnd-action` can bind a flat array whose DOM children map 1:1, with time-slot dividers folded into per-item labels.
- **Parking-lot selector.** A thin filter producing a phase's unplanned items in display order (vote score desc, then `sort_order`), reused by Phase Detail and the Day divider. Not a deep module.
- **Day→Phases mapping.** Reuse the existing day/phase relation to compute, for a day, the set of phases whose parking lots its divider must render.

### Surfaces
- **Phase Detail** becomes the interactive parking-lot home: ideas list with an "Add idea" affordance (creates `status=unplanned`, `phase` set, no `day`) and drag-reorder among ideas.
- **Day Detail** renders a collapsed parking divider below the timeline, one droppable section per phase the day belongs to, always present as a drop target. The day timeline itself is a droppable for pulling ideas in and a drag source for reordering/ejecting.
- **More menu** no longer links to a parking-lot page; the route is retired.

### Drag mechanics
- `svelte-dnd-action` replaces native HTML5 DnD on both the day timeline and the parking surfaces (same drag `type` so items move between zones). Drag is **handle-only** via the existing grip icon (the `dragDisabled`-toggle pattern), so card taps open detail and vertical swipes scroll. Touch, mouse, and keyboard dragging all supported.
- iOS long-press callout suppressed on draggable cards (`-webkit-touch-callout: none`, `user-select: none`).
- Persistence stays on the existing SvelteKit form actions (`reorder` / `pullToPlan` / `pushToParking`), fired on the drag library's `finalize`. `pullToPlan` becomes position-aware (accepts before/after); `pushToParking` clears time fields. `reorder` is reused unchanged.

### Status / schema
- No schema change. Uses existing `items` fields: `status`, `phase`, `day`, `sort_order`, `start_time`, `end_time`. Migrations remain append-only (none needed).

## Testing Decisions

Good tests here assert **external behavior** of the pure logic, not Svelte rendering or PocketBase wiring. Drag interactions on touch can't be reliably end-to-end tested, so the value is in unit-testing the decision logic and verifying the UI by hand.

- **`resolveDrop()`** — Vitest. The core target. Cover every branch: untimed reorder (middle/first/last), timed in-place → `snapback`, eject → `push`, pull within phase → `pull`, pull cross-phase → `reject`, boundary day with two phases. Prior art: `src/lib/itinerary/sort-order.test.ts`, `voting.test.ts`.
- **`buildTimelineFlat()`** — Vitest. Untimed-only ordering, timed-anchored labeling, untimed interleaved between anchors, slot-label placement. Prior art: existing timeline logic tests.
- **`neighborsForMove()`** — Vitest. Middle/first/last/single/absent.
- **Not tested:** the parking-lot selector (trivial filter), Svelte components, and the server actions' PB calls (covered by manual verification + existing rules tests). Per CLAUDE.md: Vitest for algorithmic logic, Playwright only for critical-path E2E, no trivial-CRUD tests.

Manual verification (preview tools, 375px) is required for each drag gesture, the empty-parking drop target, tap-vs-drag, callout suppression, and desktop regression — enumerated in the Slice 2 implementation plan.

## Out of Scope

- Phase-less / trip-wide unplanned items ("trip parking lot"). Reaffirmed phase-scoped only.
- Changing an item's phase via drag (remains an explicit edit).
- "Temporarily park without losing the time" (eject always unschedules).
- Multi-day (banner) item dragging.
- The voting/sort model for the parking lot (unchanged — vote score then `sort_order`).
- E2E automation of drag gestures.
- Any new collection, field, or migration.

## Further Notes

- Sequencing (3 slices): **Slice 1** — Parking lot = phase home; retire trip-wide page; add-idea entry (#57); no drag. **Slice 2** — Touch-drag foundation via `svelte-dnd-action` + per-phase day drop-divider (#60); revises the existing `docs/superpowers/plans/2026-06-07-mobile-touch-drag-reorder.md`, which predates the phase-scoped/per-phase decisions and must be brought in line. **Slice 3** — Phase sub-tab layout pass; day-card consistency overview↔phase (#65); retire "Promote to primary" language (#58).
- The existing Slice-2 implementation plan is partially stale: it assumed a single day parking section (now per-phase) and did not retire the trip-wide page. Revise before execution.
- No glossary change needed — `CONTEXT.md`'s Parking Lot definition already encodes the phase-scoped decision; the code was the drift.
