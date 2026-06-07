# Waypoint — Tasks & Checklists PRD

> Owner: Scott Vanden Warsen
> Created: 2026-06-07
> Status: Draft
> Context: Issues #45 (closes), #41 · ADR-0003 · CONTEXT.md (Checklist, Task, Smart List, Booking Readiness)
> Design: `design/lists-checklists/` — `Waypoint Lists - Final Pass.html` is the visual spec (art direction **B "Ledger"**); `README.md` is the dev handoff; `source-jsx/` is the reference source. Implementation issues #48–#53.

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

**Design source of truth:** `design/lists-checklists/Waypoint Lists - Final Pass.html` (all five screens × mobile + tablet, interactive). The decisions below are locked; defer to the handoff for pixel-level layout math, spacing, and state logic.

**Art direction: B "Ledger"** — a unified ruled-list aesthetic: square checkboxes, monogram dots, JetBrains-Mono numerals, progress donuts. Two affordances carried over from direction C: **in-place strikethrough** for checked rows (strike + dim to `ink-muted`, row does *not* move unless "Done last" is on) and a **Hide-done** toggle. Earlier 3-direction exploration preserved in `Art Direction Variations.html` (reference only — build B).

**One accent per context.** This is a **Planning** surface → **moss** (`#3E5A3A`) for checks, progress, active states. **Gold** (`#C89B3C`) is reserved exclusively for the auto/Booking signal (the Smart List + its "AUTO" chip). **Never use clay here** — clay is Trip Mode only.

**Itinerary sub-nav** gains a third tab beside Overview / Phases: **Lists** (`src/routes/(app)/trips/[slug]/+page.svelte:64` `SubTabs`). No new primary nav tab — Planning Mode stays four tabs; Lists lives entirely under Itinerary.
> **Sub-tab styling — code wins.** The prototype shows the active sub-tab with a moss underline; shipped `SubTabs.svelte` uses an **ink** underline (`border-ink`). Keep the shipped ink treatment unless design approves changing it app-wide. This is the one place the prototype diverges from shipped reality.

The five screens (→ owning issue):

- **Lists index** (`/trips/[slug]/lists`) — *#49.* One Card, ruled rows. The booking Smart List is **pinned first, visually distinct** (3px gold left border, gold-tint wash, sparkle mark, "AUTO" chip, "N left"). Checklist rows: monogram (trip-level = compass-star on neutral `surface-2`; phase-scoped = phase letter in phase color) + title + subtitle (scope) + avatar stack + progress donut. "New list" row (dashed moss). Tablet swaps bottom-nav for the 232px SideRail.
- **Checklist detail (manual)** (`/trips/[slug]/lists/[listId]`) — *#49.* Stat strip (donut + scope chip + "N left") → controls row (**segmented "In order / Done last"** + **"Hide done" toggle pill**) → Card of task rows (square checkbox + text + ⋯ overflow → Assign + single assignee avatar) → inline "Add task". *In order* = original; *Done last* = open rows first then done; *Hide done* filters checked out of the visible set. Sort pref may persist; hide-done is ephemeral.
- **Smart List detail** (`/trips/[slug]/lists/booking`, reserved slug, not a stored list) — *#50.* Gold lens banner → ruled rows (square checkbox = mark booked · TypeIcon tile · title + mono meta line · blue "Open ›" to source Item). Read-only lens: no assignee, notes, add-row, or rename. Check → optimistic `booked=true`, brief "Booked" pill, fade ~300ms, leaves the projection.
- **Overview preview** (`/trips/[slug]/+page.svelte`, modify) — *#51.* Whole-trip lists once at top under a tracked header; under each phase's days a quiet "Lists" sub-group of **mini list cards** (`surface-2`, 20px donut + title + mono "3/12" + chevron). **Do not collapse days** — condense each day to a tight single line but keep them all visible; never hide behind "+N more".
- **Inline item checklist (grocery case)** (`/trips/[slug]/items/[itemId]`, modify) — *#48.* The same task rows as the detail screen, embedded under a "Shopping list" section on Item detail, **with assignees but no sort/hide controls** (`showControls=false`). The checklist carries no dates/times/location — execution context belongs to the parent Item.

**Reuse, don't rebuild** (`$lib/ui/*`): `Card`, `Pill`, `PhaseChip`, `Avatar`, `SubTabs`, `NavBar`, `Button`, `SectionH`, `BottomSheet`, `TypeIcon`, `StarIcons`, `Skeleton`. **New atoms** to build under `src/lib/itinerary/components/` (translate from `source-jsx/`, no shipped equivalent): `TaskRow`, `ChecklistBody`, `ProgressDonut`, `SortSegmented`, `TogglePill`, `AutoChip`, `SmartRow`, `MiniListCard`, list index rows, `AssignMemberSheet` (wraps `BottomSheet` mobile / centered modal tablet).

**Trip Mode** — Tasks are **checkable** in Trip Mode (check off packing while traveling). Creating/renaming lists stays Planning Mode.

Mobile-first 375px; bottom-nav → SideRail at 900px, sheets → centered modals at tablet+. Existing design tokens in `src/routes/layout.css` (paper/ink/moss/gold; Fraunces/Inter/JetBrains Mono) — reference the token, never the prototype's literal hex. Bottom-sheets on mobile; **skeletons, not spinners** (spinner only inside a submitting button). Empty states editorial (Fraunces italic, one next step). Assign affordance = bottom sheet (mobile) / centered modal (tablet+).

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
