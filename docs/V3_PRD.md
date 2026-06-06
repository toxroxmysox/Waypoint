# Waypoint v3 — Product Requirements Document

> Owner: Scott Vanden Warsen
> Created: 2026-05-31
> Status: Draft

---

## 1. What v3 Is

v3 is a **design and architecture alignment release**. It brings the codebase in line with the domain language established in CONTEXT.md, replaces the legacy slot-based day view with an anchor-time timeline, and ships Trip Mode as a distinct live-trip experience.

v3 is not a feature expansion. It deepens the existing planning and execution model.

---

## 2. Success Criteria

- [ ] A trip can be planned using the timeline day view with anchor times and drag-to-reorder
- [ ] An active trip renders in Trip Mode by default with Now/Today/Add/Vault tabs
- [ ] Mode switching between Planning Mode and Trip Mode works via persistent pills
- [ ] All code references match CONTEXT.md terminology (no `slot`, `rank`, `parking_lot_scope`)
- [ ] Schema migration runs cleanly as a hard cut (no backward compatibility)

---

## 3. Workstreams

### 3.1 Schema Cleanup (hard cut migration)

No production data to preserve. One migration that makes the following changes:

**Items collection:**
| Change | From | To |
|--------|------|----|
| Remove field | `slot` (enum: morning/afternoon/evening/anytime) | — |
| Remove field | `parking_lot_scope` (enum: none/trip/phase/day) | — |
| Rename field | `rank` (int) | `sort_order` (int) |
| Add enum value | `status`: planned/done/considered | Add `unplanned` |
| Add enum value | `type`: lodging/transportation/activity/meal/note/checklist | Add `flight` |

**Phases collection:**
| Change | From | To |
|--------|------|----|
| Remove field | `color` (text) | — |

**Types file (`src/lib/itinerary/types.ts`) cleanup:**
- Remove `Slot` type and `ParkingLotScope` type
- Add `'unplanned'` to `ItemStatus`, `'flight'` to `ItemType`
- Remove `slot`, `parking_lot_scope` from `Item` interface
- Rename `rank` → `sort_order` in `Item` interface
- Remove `color` from `Phase` interface

**Codebase rename pass:** ~68 references to `slot`, `rank`, `parking_lot_scope` across queries, components, tests, and utilities. Mechanical find-and-replace as part of the migration.

### 3.2 Day View Layout Revision (Planning Mode)

Replace the current slot-enum-based day view with an anchor-time timeline.

**Layout (top to bottom):**
1. **Multi-day items** — spanning lodging/transport rendered as full-width cards
2. **Timeline** — continuous, 8am–10pm default range (expands if items have times outside)
3. **Parking lot** — unplanned items for the current phase. On desktop, renders in the ContextRail (right panel) instead of below the timeline

**Timeline behavior:**
- Anchored items (have `start_time`) are pinned at their time position
- Untimed planned items flow between anchored items based on `sort_order`
- Untimed items visually expand to fill the gap between surrounding anchored items
- Multiple untimed items in the same gap distribute the space evenly
- Time slot headers (Morning / Afternoon / Evening) are visual dividers derived from anchor time positions, never stored

**Overlap handling:**
- Anchored items with overlapping time ranges render sequentially in `start_time` order with a subtle visual overlap indicator (informational, not blocking)

**Drag interactions:**
| Interaction | What changes |
|-------------|-------------|
| Reorder untimed items | `sort_order` updates |
| Drag untimed item past an anchored item | `sort_order` updates (item flows to new gap) |
| Pull from parking lot onto timeline | `status`: unplanned → planned, `day` assigned, `sort_order` set |
| Push from timeline to parking lot | `status`: planned → unplanned, `day` cleared |

Dragging **never** sets or changes anchor times. Use the item form for that.

**sort_order implementation:**
- Gap-based integers: 100, 200, 300...
- Insert between two items = midpoint (e.g., 150)
- When gaps close, rebalance all items on the day in one write

**Status lifecycle:**
- `unplanned ↔ planned → done | considered`
- Backward (`planned → unplanned`) is allowed — "we're not sure about this anymore"

### 3.3 Trip Mode

Separate views from Planning Mode. Shares item card components but not layout.

**Activation:** Derived from dates. `start_date <= today <= end_date && !archived` → Trip Mode is the default. No manual toggle. User can switch to Planning Mode via "Edit plan" pill and back via "Trip view" pill. Symmetric pills, only visible when the trip is active.

**4-tab clay nav:** Now, Today, Add (center oversized button), Vault

#### Now tab — three states

**Mid-event** (current time falls within an item's anchor time range or multi-day span):
- Expanded card for the current item with full details (location, booking info, reservation codes)
- "UP NEXT" preview below showing next item with countdown
- Tomorrow's first item preview at bottom

**Between things** (no item is ongoing, but items remain today):
- "FREE TIME" card with countdown to next item
- "UP NEXT" preview

**Day wrapped** (all items done or past 10pm):
- End-of-day summary card

#### Today tab

Full-day timeline using the same data as the Planning Mode day view, with distinct rendering:
- Past items dimmed with completion state
- Current item highlighted with "RIGHT NOW" indicator and countdown
- Future items in normal/waiting state
- Auto-scrolls to the current time on load
- Progress indicator ("5 of 7 done")
- Tap any item to edit (pencil icon) — not read-only

#### Add button

Center nav button (not a real tab). Opens a choice:
- Add item to today (pre-filled with current phase and today's date)
- Add expense

For future dates, switch to Planning Mode.

#### Vault

Unchanged from current implementation.

### 3.4 UI Cleanup

**Remove page-level skeleton components** (8 files):
- `TripCardSkeleton.svelte`
- `DayItemSkeleton.svelte`
- `ExpenseRowSkeleton.svelte`
- `MemberRowSkeleton.svelte`
- `TripsPageSkeleton.svelte`
- `DayPageSkeleton.svelte`
- `ExpensesPageSkeleton.svelte`
- `MembersPageSkeleton.svelte`

Keep base `Skeleton.svelte` primitive for future use.

PocketBase loads fast enough that skeletons flash for sub-200ms transitions, which feels worse than no loading state.

---

## 4. Testing Strategy

**Vitest (unit) — dense coverage:**
- Timeline interleaving logic: anchored items sorted by time, untimed items positioned by sort_order, overlap detection, edge cases (no anchored items, all same time, untimed-only days, single item)
- `sort_order` rebalancing: gap insertion, midpoint calculation, full rebalance
- `getTripModeState()`: mid-event/between-things/day-wrapped state derivation
- Trip mode activation: date-based derivation logic

**Playwright (E2E) — critical paths only:**
- Create item with anchor time → correct timeline position
- Drag untimed item between anchored items → sort_order updates, correct render
- Mode switching: active trip → Trip Mode default → "Edit plan" → Planning → "Trip view" → back
- Trip Mode Now: correct state based on time of day

**Skip:**
- Component rendering tests (skeleton removal, pill styling, dimming)
- Schema migration verification (one-shot manual)
- Layout-only changes (ContextRail parking lot placement)

---

## 5. Out of Scope (deferred)

Captured in `docs/SPEC_BACKLOG.md` under v4 Concepts:

- **Inline contextual parking lot** — collapsed "ideas waiting" card between time slot headers
- **Trip Mode Quick Actions** — Add expense / Quick note / Photo log buttons
- **Ideas from Free Time** — parking lot surfaced via free time card tap
- **Note Before Bed** — end-of-day prompt feeding into closeout archive
- **Day Wrapped Stats** — items/distance/spent summary card

Tracked as separate issues:
- **Voting UI** — [#30](https://github.com/toxroxmysox/Waypoint/issues/30)
- **SideRail truncation** — [#29](https://github.com/toxroxmysox/Waypoint/issues/29)

---

## 6. Issue Breakdown

| Issue | Title | Type | Dependencies |
|-------|-------|------|-------------|
| [#31](https://github.com/toxroxmysox/Waypoint/issues/31) | Schema cleanup: hard cut migration | refactor | None |
| [#32](https://github.com/toxroxmysox/Waypoint/issues/32) | Day view timeline layout | feature | #31 |
| [#17](https://github.com/toxroxmysox/Waypoint/issues/17) | Deepen trip-mode module | feature | #31 |
| [#33](https://github.com/toxroxmysox/Waypoint/issues/33) | Trip Mode views (Now/Today/Add) | feature | #17, #32 |
| [#34](https://github.com/toxroxmysox/Waypoint/issues/34) | Mode switching (derived + symmetric pills) | feature | #33 |
| [#35](https://github.com/toxroxmysox/Waypoint/issues/35) | Remove page-level skeleton components | refactor | None |

**Dependency graph:**
```
#31 Schema cleanup
 ├── #32 Day view timeline
 │    └── #33 Trip Mode views ← also depends on #17
 │         └── #34 Mode switching
 └── #17 Deepen trip-mode module
          └── #33 (see above)

#35 Skeleton removal (independent)
```

---

## 7. Changelog

| Date | Summary |
|------|---------|
| 2026-05-31 | PRD created from grill session. Scope: schema cleanup, day view timeline, Trip Mode, skeleton removal. Deferred: inline parking lot, quick actions, day stats, voting UI, note before bed. |
