# Waypoint — Tasks & Checklists PRD

> Owner: Scott Vanden Warsen
> Created: 2026-06-07
> Status: Draft
> Context: Issues #45 (closes), #41 · ADR-0003 · CONTEXT.md (Checklist, Task, Smart List, Booking Readiness)

---

## 1. What This Is

A **Checklist** primitive that replaces the legacy `checklist` Item Type. A Checklist is a named container of **Tasks** (checkable lines) that attaches to an Item, a Phase, or a Trip. It gets checklists *out* of the day/timeline model — they have no dates, times, votes, or multi-day spans. Closes #45.

Three real-world shapes, **one entity**:
- **Grocery** — an item-scoped checklist on an activity ("3pm grocery run" → 5 food items).
- **Packing** — a trip- or phase-scoped manual checklist.
- **Booking to-do** — a **Smart List**: Tasks projected from planned-but-unbooked Items, not hand-entered.

This is not a feature expansion of the timeline. It's a sibling primitive for the scaffolding work a trip needs.

---

## 2. Success Criteria

- [ ] A Checklist can be created at trip, phase, or item scope; Tasks added, checked, assigned to a member
- [ ] Tasks render inline on an Item detail view (the grocery case) and on a dedicated **Itinerary › Lists** surface (trip/phase case)
- [ ] The booking **Smart List** lists every planned Item with `requires_booking = true` and `booked = false`; checking a row sets the Item `booked` and the row leaves the list
- [ ] `checklist` no longer appears in the item-type picker
- [ ] All participating members (traveler+) can create/add/check/assign/delete; viewers are read-only
- [ ] Checklists round-trip through Export/Import (assignee stripped) and Clone (checked reset, assignee dropped)
- [ ] Migration creates `checklists` + `tasks` and adds `requires_booking` to `items` — no data migration

---

## 3. Domain Model

See CONTEXT.md for authoritative glossary. Shapes:

**`checklists`** (new collection — Itinerary area)
| Field | Type | Notes |
|-------|------|-------|
| `trip` | relation → trips, required, cascadeDelete | scoping + permissions |
| `phase` | relation → phases, optional, cascadeDelete | set when phase-scoped |
| `item` | relation → items, optional, cascadeDelete | set when item-scoped |
| `title` | text, required | |
| `kind` | select: `manual` \| `booking` | `booking` = the Smart List |
| `order` | number | display ordering within a scope |

Attachment level is **derived**, never stored: `item` → item-level, else `phase` → phase-level, else trip-level. Exactly one of `item`/`phase` is set (or neither, for trip-level); the booking Smart List is `kind = booking`, trip-scoped, and is system-created (one per trip, lazily).

**`tasks`** (new collection — Itinerary area)
| Field | Type | Notes |
|-------|------|-------|
| `checklist` | relation → checklists, required, cascadeDelete | |
| `title` | text, required | |
| `checked` | bool, default false | |
| `assignee` | relation → trip_members, optional, maxSelect 1 | |
| `order` | number | |

**`items`** (add one field)
| Field | Type | Notes |
|-------|------|-------|
| `requires_booking` | bool | pre-filled `true` for lodging/flight/transportation; false/absent otherwise; user-overridable |

`checklist` stays in the `ItemType` union as an inert tombstone (append-only). `parent_item` (dormant self-relation on `items`, never wired to UI) is left untouched.

---

## 4. The Booking Smart List (projection)

Not stored as Task rows. At read time, for the trip's `kind = booking` Checklist, project one synthetic Task per Item where `status = planned AND requires_booking = true AND booked = false`:
- row title = Item title, with a type glyph; links to the source Item
- **no** assignee, **no** notes, **no** add-row, **no** rename
- checking a row = set that Item `booked = true` → the Item leaves the projection
- if per-booking ownership is ever needed, it goes on the **Item**, not the Task (out of scope for v1)

Booking stays an **orthogonal binary** `booked` flag. The Tri-State Booking Pill is deferred (separate backlog item) and is not part of this work.

---

## 5. UI / Surfacing

**Itinerary sub-nav** gains a third tab beside Overview / Phases: **Lists** (`src/routes/(app)/trips/[slug]/+page.svelte:64` `SubTabs`).

- **Lists index** — cards for every trip/phase Checklist + the auto-present booking Smart List (visually distinct as system-maintained). Each card: title, scope chip (Trip or `PhaseChip`), progress `n/m`, assignee avatar stack. "New list" affordance.
- **Checklist detail (manual)** — task rows (checkbox + title + optional assignee avatar); checked rows de-emphasized; inline "Add task"; row overflow → assign member.
- **Smart List detail** — projected read-only rows; check = mark Item booked; no add/rename/assign.
- **Overview preview** — under each phase's days, a compact one-line preview of that phase's / the trip's checklists ("Packing · 3/12") linking through. Lightweight; must not crowd the day-centric layout.
- **Inline item checklist** — the grocery case: a checklist embedded on an Item detail page using the same Task-row component.

**Trip Mode** — Tasks are **checkable** in Trip Mode (check off packing while traveling). Creating/renaming lists stays Planning Mode.

Mobile-first 375px. Existing design system (paper/ink/moss/clay/gold; Fraunces/Inter/JetBrains Mono); bottom-sheets on mobile; skeletons, not spinners. *(Design mock prompt produced separately and being handled externally.)*

---

## 6. Permissions

PB rules first. All participating members (owner / co_owner / traveler) may create Checklists, add/check/assign/delete Tasks, and delete Checklists — **unrestricted, intentionally light**. **Viewer = read-only** (cannot check). Tasks are **exempt from the Suggestion/Auto-approve pipeline** by design (operational scaffolding, not itinerary-shaping). No Task notifications in v1.

---

## 7. Lifecycle (Archive & Portability)

| Surface | Behavior |
|---------|----------|
| **Closeout** | Parent Item reviewed (done/considered) as normal; its Checklist ignored. |
| **Public Archive** | Checklists excluded (operational + assignee PII). |
| **Export / Import** | Checklists + Tasks included; `checked` and structure preserved; **`assignee` stripped** (trip-scoped member IDs won't resolve on import). |
| **Clone** | Checklists + Tasks copied; **`checked` reset to false**, **`assignee` dropped**. Carries packing/booking *templates* forward, blank. Booking Smart List not copied — regenerates from the new trip's Items. |

---

## 8. Migration (no data migration)

Pre-broad-dogfood; existing `checklist` Items are disposable. One append-only migration:
1. Create `checklists` collection (rules scoped via `trip.members`).
2. Create `tasks` collection (cascadeDelete from `checklists`).
3. Add `requires_booking` to `items`; backfill default by type for existing rows.
4. Remove `checklist` from the item-type **picker** (UI), leaving the union value as a tombstone.

No conversion of legacy `checklist_items`. `checklist_items`, `parent_item` remain in place, inert (append-only discipline).

---

## 9. Out of Scope

- Tri-State Booking Pill (deferred backlog item).
- Task notifications / assignment push.
- Stored-and-synced booking Tasks (projection only).
- Per-Task scheduling (time/place) — that's the parent Item's job.
- Smart-list assignees or notes.
- Sub-tasks / nested checklists.

---

## 10. Open / Deferred

- Per-booking ownership ("who books the flights") — if needed, lands on the **Item** (`booking_owner`), not the Task. Revisit after dogfood.
- Promote a single `task_assigned` notification type if dogfood shows missed assignments.
