# Handoff: Itinerary › Lists (Checklists & Tasks)

A new **Lists** surface for Waypoint — a third sub-tab inside the Itinerary tab, plus
two existing screens that gain checklist affordances. Built against the live Waypoint
design system and codebase (SvelteKit + Tailwind v4 + PocketBase).

---

## Overview

Waypoint is a collaborative trip-planning PWA. Today the trip page has two Itinerary
sub-tabs: **Overview** and **Phases**. This work adds a third, **Lists**, and the
screens behind it:

1. **Lists index** — the new sub-tab. A vertical list of checklist cards.
2. **Checklist detail (manual)** — a hand-built checklist of tasks with assignees.
3. **Booking smart list (projected, read-only)** — an auto-maintained lens over the
   itinerary: planned items that still need a reservation.
4. **Overview preview (modify existing)** — compact one-line list previews under each
   phase's days, plus whole-trip lists at the top.
5. **Inline item checklist (the grocery case)** — the same task-row component embedded
   inside an Item detail page (e.g. a 3 PM "Grocery run").

The chosen art direction is **B "Ledger"**: a unified, ruled list aesthetic — square
checkboxes, monogram dots, mono numerals, progress donuts — combined with **in-place
strikethrough** for checked rows and a **Hide-done** toggle (these two came from
direction C). Earlier exploration of three directions is preserved in
`Waypoint Lists - Art Direction Variations.html` for context, but **build direction B**.

---

## About the design files

The files in this bundle are **design references created in HTML/React (Babel JSX)** —
prototypes showing intended look and behavior. **They are not production code to copy.**
The target codebase is **SvelteKit + Tailwind v4** (the mounted `Waypoint/` repo). The
task is to **recreate these designs as Svelte components and routes using the app's
existing primitives and token system** — not to port React or inline styles.

- `Waypoint Lists - Final Pass.html` — **the spec.** All five screens at 375px and
  tablet, fully interactive (check rows, sort, hide-done, mark-booked, open assign).
- `Waypoint Lists - Art Direction Variations.html` — the earlier 3-direction round
  (A soft cards / B ledger / C progress-forward). Reference only; B was chosen.
- `source-jsx/` — the React component source behind the prototype. Read this for exact
  layout math, spacing, and state logic. **Translate to Svelte; do not import.**

The prototype hard-codes design tokens as CSS variables and a `V2` JS object so it runs
standalone. In the real app these already exist as Tailwind `@theme` utilities in
`src/routes/layout.css` — **use those, never the prototype's literal hexes.**

## Fidelity

**High-fidelity.** Final colors, type, spacing, and interactions. Recreate pixel-faithfully
using the codebase's existing components (`$lib/ui/*`) and Tailwind tokens. Every value
below maps to an existing token — match the token, not the raw value.

---

## Where this plugs into the codebase

All paths relative to the mounted `Waypoint/` repo.

### Existing primitives to reuse (do NOT rebuild)
| Prototype component | Use this Svelte primitive |
|---|---|
| Card (white, hairline, radius, accent stripe) | `src/lib/ui/Card.svelte` |
| Pill (Booked / Activity / status) | `src/lib/ui/Pill.svelte` |
| PhaseChip (phase monogram + name) | `src/lib/ui/PhaseChip.svelte` |
| Avatar (initial circle) | `src/lib/ui/Avatar.svelte` |
| SubTabs (Overview · Phases · **Lists**) | `src/lib/ui/SubTabs.svelte` |
| NavBar (back, title, subtitle, right slot) | `src/lib/ui/NavBar.svelte` |
| Button | `src/lib/ui/Button.svelte` |
| SectionH (tracked small-caps header) | `src/lib/ui/SectionH.svelte` |
| Bottom sheet (mobile) | `src/lib/ui/BottomSheet.svelte` |
| Type glyphs (lodging/flight/transport/meal…) | `src/lib/ui/TypeIcon.svelte` |
| UI line icons (plus, clock, arrow…) | `src/lib/ui/StarIcons.svelte` |
| Skeleton loaders | `src/lib/ui/Skeleton.svelte` |

> **Important:** the prototype draws its own avatars, chips, checkboxes, and donuts.
> Most have a shipped equivalent above. Build the genuinely-new atoms (square checkbox,
> progress donut, segmented sort control, "Auto" chip, task row) as small new components
> under `src/lib/itinerary/components/`.

### Routes to add / modify
| Screen | File | Action |
|---|---|---|
| Lists index | `src/routes/(app)/trips/[slug]/lists/+page.svelte` (+ `+page.server.ts`) | **new** |
| Checklist detail | `src/routes/(app)/trips/[slug]/lists/[listId]/+page.svelte` (+ server) | **new** |
| Booking smart list | `src/routes/(app)/trips/[slug]/lists/booking/+page.svelte` (+ server) | **new** (reserved slug; not a stored list) |
| Overview preview | `src/routes/(app)/trips/[slug]/+page.svelte` | **modify** — add list previews |
| Inline item checklist | `src/routes/(app)/trips/[slug]/items/[itemId]/+page.svelte` | **modify** — embed checklist |

### Add the sub-tab
In `src/routes/(app)/trips/[slug]/+page.svelte` (and the phases page, wherever SubTabs is
rendered), add the third tab:
```svelte
<SubTabs tabs={[
  { id: 'overview', label: 'Overview', href: `/trips/${data.trip.slug}` },
  { id: 'phases',   label: 'Phases',   href: `/trips/${data.trip.slug}/phases` },
  { id: 'lists',    label: 'Lists',    href: `/trips/${data.trip.slug}/lists` }
]} />
```
> **Styling note:** the prototype shows the active sub-tab with a **moss** underline.
> The shipped `SubTabs.svelte` uses an **ink** underline (`border-ink`). Code wins —
> keep the shipped ink treatment unless design explicitly approves changing it app-wide.
> This is the one place the prototype diverges from shipped reality.

**No new primary nav tab.** Planning Mode stays four tabs (Itinerary · Money · Members ·
More per `src/lib/shell/nav-tabs.ts`). Lists lives entirely under Itinerary.

---

## Data model

### What already exists (`src/lib/itinerary/types.ts`)
- **`Item`** already has everything the smart list needs: `type`
  (`lodging | transportation | activity | meal | note | checklist | flight`), `status`,
  **`booked: boolean`**, **`booked_by: string`**, **`assigned_to: string[]`**,
  `reservation_url`, `parent_item`, `sort_order`.
- **`ChecklistItem`** already exists, **scoped to an Item**: `{ item, text, checked_by,
  checked_at, order }`. This is exactly the **inline item checklist (screen 5)** — the
  grocery case is largely a data-model match already. It has **no `assigned_to`** today.

### What's new
1. **`Checklist`** (standalone list — the thing the Lists index enumerates). Suggested shape:
   ```ts
   interface Checklist extends RecordModel {
     trip: string;
     phase: string;        // '' / null = trip-level; else the phase id
     title: string;
     order: number;
     created_by: string;
   }
   ```
2. **Task** — a row inside a standalone Checklist, with a single optional assignee.
   Either extend `ChecklistItem` with `checklist` + `assigned_to`, or add a sibling:
   ```ts
   interface ChecklistTask extends RecordModel {
     checklist: string;
     text: string;
     assigned_to: string;  // single member id, '' = unassigned
     checked_by: string;   // '' = open
     checked_at: string;
     order: number;
   }
   ```
   (Reusing `ChecklistItem` with a nullable `checklist` vs `item` parent is fine too —
   pick whichever the team prefers; the row UI is identical either way.)

3. **Booking smart list is NOT stored.** It is a **derived query**, recomputed on load:
   > Items where `booked === false` **and** the item "requires booking" — i.e.
   > `type ∈ {lodging, flight, transportation}` (extend with an explicit "needs booking"
   > rule if the team has one). Order by date/sort_order.
   Checking a row = `PATCH item { booked: true, booked_by: <me> }`. The row then
   disappears from the projection (no separate write to any list). No assignee, no
   add-row, no rename on this screen.

`checklistTemplates` (`src/lib/itinerary/checklist-templates.ts`) already ships Packing /
Grocery / To-Book seed lists — wire "New list" to optionally start from one.

---

## Screens

### 1 · Lists index  (`/trips/[slug]/lists`)
**Purpose:** see and open every checklist for the trip; create new ones.

**Layout (mobile 375px):** NavBar → SubTabs (Lists active) → scroll body, content capped
`max-w-lg` (tablet `max-w-2xl`), 14px gutters, bottom nav.
- Page header row: "Lists" in Fraunces 22/600, right-aligned mono count "5 lists".
- **One Card** containing all rows, ruled with 1px `line` dividers, `radius` 14, `shadow-card`:
  - **Booking smart row (pinned first, visually distinct):** 3px **gold** left border,
    `gold-tint`-wash background. Left: 28px circle, `gold-tint` fill + `gold` border,
    containing the **sparkle** mark. Title "Booking" + an **"AUTO" chip** (gold-tint bg,
    gold border, `#8A6A1E` text, 9.5px uppercase tracked, sparkle glyph). Subtitle
    "Auto · from your itinerary" in `#8A6A1E`. Right: mono "5 left".
  - **Checklist rows:** left monogram — trip-level shows the compass-star in a neutral
    `surface-2` circle; phase-scoped shows the phase letter in the phase color. Title
    14.5/600 ink; subtitle 11px muted = "Whole trip" or phase name. Right: avatar stack
    (19px, overlapped −30%, max 3 + "+N"), then a **progress donut** (33px, 3.5px stroke,
    moss arc, mono count centered).
- **"New list" row:** dashed `line` border, radius 14, 28px dashed-moss circle with a
  plus, "New list" in moss 13.5/600. Tapping opens the create flow (sheet on mobile).

**Layout (tablet):** left **SideRail** (232px: brand, current-trip card, nav items with
moss active state + 3px moss spine, user footer) replaces the bottom nav. Main column:
sticky header ("Spain '25" / "Itinerary") with a **"New list"** moss button top-right,
then `SubTabsWide` (left-aligned, larger), then the same card centered at ~620px.

**Behavior:** tap a checklist row → detail. Tap the Booking row → smart list. "New list"
→ create (bottom sheet mobile / centered modal tablet); optionally seed from a template.

### 2 · Checklist detail — manual  (`/trips/[slug]/lists/[listId]`)
**Purpose:** work a hand-built list; check tasks; assign members.

**Layout:** NavBar (title = list name, subtitle = "Whole trip" or phase). Body:
- **Stat strip:** progress donut (46px / 5px stroke) + scope chip + "9 left to pack"
  (mono number).
- **Controls row:** a **segmented control** "In order / Done last" (pill, `surface-2`
  track, white selected thumb w/ soft shadow) + a **"Hide done" toggle pill** (moss when
  on, 13px square check). These drive the two arrangements the design calls for.
- **Card** of **task rows**, ruled:
  - **square checkbox** (21px, radius 5; moss fill + white check when done),
  - task text 14.5/500 — **checked → `line-through` + dim to `ink-muted`, in place**,
  - **⋯ overflow** button → opens **Assign** (assigns a Trip Member),
  - single **assignee avatar** (24px) on the right, or a dashed empty ring if unassigned;
    avatar dims to 0.4 when the row is done.
  - footer **"Add task"** inline row (dashed moss square + plus + "Add task").

**Sort/hide logic (from the prototype's `ChecklistBody`):**
- *In order* = original order; *Done last* = open rows first, then done rows.
- *Hide done* filters checked rows out of the visible set entirely.
- Both are view state; persistence of the sort preference is optional.

**Assign affordance:** bottom sheet (mobile) / **centered modal (tablet+)** —
list of trip members (avatar + name + radio), "Unassign" + "Done" buttons. Per the DS,
tablet uses a centered modal, not a sheet. (In the prototype the tablet modal is shown
open by default purely to demonstrate the pattern; in production it opens on tap.)

### 3 · Booking smart list — projected, read-only  (`/trips/[slug]/lists/booking`)
**Purpose:** a single place to clear all outstanding bookings. **A lens, not a list.**

**Layout:** NavBar (title "Booking", subtitle "Auto · read-only"). Body:
- **Lens banner:** gold-tinted info card, sparkle + "**A lens over your itinerary.**
  These rows are planned items that still need a reservation. Check one to mark it
  **booked** — it then leaves this list."
- **Card** of **smart rows** (ruled). Each row: square checkbox (= mark booked) · a
  **TypeIcon tile** (lodging/flight/transport glyph in its tinted container) · title +
  a **mono meta line** (the item's plan context, e.g. "Seville · Jun 18–22 · 4 nights")
  · a blue **"Open ›"** link to the source item. **No assignee, no add-row, no rename.**
- Footer line (Fraunces italic, muted): "Updates automatically as you plan. Nothing to
  add by hand."

**Behavior:** checking a row sets `item.booked = true` (+ `booked_by`), the row shows a
"Booked" pill briefly, then **animates out** (fade ~0.3s) and is removed from the
projection. Tapping the row body / "Open" navigates to `…/items/[itemId]`.

### 4 · Overview preview — modify existing  (`/trips/[slug]/+page.svelte`)
**Purpose:** surface lists without disturbing the day-centric overview.

**Modification:** keep the existing phase → day structure exactly. Add:
- **Whole-trip lists** once at the very top, under a tracked "Whole-trip lists" header:
  a stack of **mini list cards**.
- Under **each phase's day list**, a quiet **"Lists"** sub-group (tracked 9.5px header
  with a small sparkle) showing that phase's mini list cards.

**Mini list card:** `surface-2` fill, 1px `line`, radius 10, ~8×11px padding, single line:
small **donut (20px)** + title (12.5/600) + mono "3/12" + a trailing chevron. Taps through
to the checklist detail. **Must stay lightweight — it never competes with the days.**

> **Do not collapse days.** (Explicit design note from review.) Every day stays visible.
> The prototype's Overview shows each day **condensed to a single tight line** — day code
> · date · short summary · planned count · type-glyph dots — but **all days are listed**,
> never hidden behind a "+N more". Match that: condense the per-day row, keep them all.

### 5 · Inline item checklist — the grocery case  (`/trips/[slug]/items/[itemId]`)
**Purpose:** a checklist that lives **on an Item**, not on the Lists surface.

**Layout:** the normal item detail (hero card with type icon, phase chip, "Activity"
pill, Fraunces title "Grocery run", mono time "3:00 – 3:45 PM · Day 8", where/when rows),
then a **"Shopping list"** section (Fraunces 16 + mono "2/7") rendering the **same task
rows** as screen 2 **with assignees** — but **no sort/hide controls** (`showControls=false`
in the prototype) and an "Add an item" footer. Closing italic note: "This list lives on
the item — it travels with the grocery run."

**Data:** this is the existing `ChecklistItem` (parent = `item`). Add a single
`assigned_to` to support the avatars. Execution context (time, place) belongs to the
**Item** — the checklist carries **no dates/times/location** of its own.

---

## Interactions & behavior (global)

- **Toggle a task:** tap anywhere on the row (checkbox or text) → check/uncheck. Checked
  rows strike through + dim **in place**; they only reorder if "Done last" is on.
- **Assign:** ⋯ → member picker (sheet mobile / modal tablet) → single assignee.
- **Mark booked (smart list only):** check → optimistic `booked=true`, brief "Booked"
  pill, fade out ~300ms, remove from projection.
- **Motion:** follow the DS — View Transitions, 180ms tab crossfade, 280ms drill-down
  slide-up; reduced-motion collapses to a fade. No bounce, no infinite loops.
- **Loading:** **skeletons, never spinners** (use `Skeleton.svelte`) for list/detail
  loads. Spinner only inside a submitting button.
- **Empty states:** editorial, Fraunces italic, one next step. e.g. Lists empty →
  *"No lists yet."* / "Make one, or let Waypoint track your bookings." Manual list empty
  → *"Nothing on this list."* / "Add the first task."
- **Responsive:** 375px base; bottom-nav → SideRail at 900px; centered content column,
  sheets → centered modals at tablet+.

## State

- `tasks[]` per checklist with `{ text, assigned_to, checked }`; derived `doneCount/total`.
- View state on detail: `sort: 'order' | 'last'`, `hideDone: boolean` (sort pref may
  persist; hide-done is ephemeral).
- Smart list: derived `rows` from Items (`!booked && requiresBooking`); local `leaving`
  set to animate a just-booked row out before refetch.
- Assign sheet/modal: `{ open, taskId }`.
- All writes are collaborative — assume optimistic update + reconcile (PocketBase realtime
  per existing patterns in `src/lib/shell/pb.ts`).

---

## Design tokens

Use the existing Tailwind `@theme` tokens in `src/routes/layout.css`. Values here are for
verification only — **reference the token, not the hex.**

**Color**
| Token | Value | Use in this feature |
|---|---|---|
| `paper` | `#F6F2EA` | page background |
| `surface` | `#FFFFFF` | cards |
| `surface-2` | `#FBF8F2` | mini cards, segmented track, neutral monogram |
| `ink` | `#1C1B18` | titles, body |
| `ink-soft` | `#4C4A44` | secondary text |
| `ink-muted` | `#67625A` | meta, muted labels |
| `line` | `#E2DCD0` | 1px borders & dividers |
| `moss` / `moss-tint` | `#3E5A3A` / `#E8EFE3` | **Planning accent** — checks, progress, active states |
| `gold` / `gold-tint` | `#C89B3C` / `#FBF1DC` | **Booking smart list** accent + Auto chip |
| `gold-deep` (text on tint) | `#8A6A1E` | smart-list text (≥18px / chrome only) |
| `sky` / `sky-tint` | `#3B6BA5` / `#E6EEF8` | lodging/transport glyphs, "Open" link |
| `clay` | `#A5593A` | **Trip Mode only — never on this Planning surface** |

> **One accent per context.** This is a Planning surface → **moss**. Gold is the only
> other accent, reserved for the auto/Booking signal. Never use clay here.

**Type** — Fraunces (display/titles, optical sizing, italic for editorial lines) ·
Inter (all UI/body; never below 16px on inputs) · JetBrains Mono (counts, times, money,
`tabular-nums`). Title sizes used: page 22, card/list title 14.5–18, section 16,
big stat 30.

**Spacing** — 8pt rhythm (4/8/12/16/20/24/32/48). Content `max-w-lg` mobile,
`max-w-2xl` tablet, centered, 14–24px gutters.

**Radii** — 6 pills/chips · 10 cards/inputs/buttons · 14–16 list cards/sheets/modals ·
square checkbox 5 · donut/avatars full-round.

**Elevation** — warm-ink shadow ladder: `shadow-card` resting on cards,
`shadow-card-strong` on hover, `shadow-overlay` (upward) on bottom sheets,
`shadow-modal` on centered modals. Never neutral grey.

---

## New atoms to build (under `src/lib/itinerary/components/`)

Translate these from `source-jsx/` — they have no shipped equivalent:
- **`TaskRow.svelte`** — square checkbox + text (strike/dim when done) + ⋯ + assignee
  avatar. Reused by screens 2 and 5. (`source-jsx/final/components.jsx → TaskLedgerRow`)
- **`ChecklistBody.svelte`** — holds tasks + sort + hide-done; renders TaskRows + add-row.
  (`source-jsx/final/components.jsx → ChecklistBody`)
- **`ProgressDonut.svelte`** — SVG ring + centered mono count.
  (`source-jsx/lists-components.jsx → ProgressDonut`)
- **`SortSegmented.svelte` / `TogglePill.svelte`** — sort control + hide-done toggle.
- **`AutoChip.svelte`** + **`SmartRow.svelte`** — gold auto badge + projected booking row.
  (`source-jsx/final/components.jsx → SmartRow`, `SmartListBody`)
- **`ListCard` / `ListRow`** + **`MiniListCard.svelte`** — index rows + overview preview.
  (`source-jsx/final/components.jsx → IndexRow`; `overview-item.jsx → MiniListCard`)
- **`AssignMemberSheet.svelte`** — wrap `BottomSheet.svelte` (mobile) and a centered
  modal (tablet) around the member picker. (`source-jsx/final/components.jsx → AssignContent`)

The avatar-stack overlap, donut math, segmented-control styling, and the
booking-row leave animation are all spelled out in the JSX — copy the values, render in Svelte.

---

## Constraints / do-nots (from the brief)

- **No new primary nav tab.** Planning Mode stays 4 tabs; Lists is a sub-tab only.
- **Checklists carry no dates/times/location.** Execution context belongs to the parent
  Item (screen 5) only.
- **Tasks have no votes.** (Voting is a separate `collaboration/` concern.)
- **Smart-list rows have no assignee, no notes, no add-row, no rename.** Read-only lens.
- **Don't collapse days** in the Overview — condense, list all.
- **One accent:** moss (Planning) + gold (auto). No clay on this surface.

---

## Files in this bundle

- `Waypoint Lists - Final Pass.html` — **the spec** (all 5 screens × mobile + tablet, interactive).
- `Waypoint Lists - Art Direction Variations.html` — earlier 3-direction round (reference).
- `source-jsx/final/` — React source for the final screens:
  - `components.jsx` (task rows, checklist body, smart rows, assign, index rows, sheets/modals)
  - `overview-item.jsx` (Overview preview + inline item checklist + mini cards)
  - `tablet-shell.jsx` (SideRail, tablet frame, centered-modal layout)
  - `screens.jsx` (the 5 mobile + 5 tablet screen compositions)
  - `app.jsx` (canvas layout — not needed for implementation)
- `source-jsx/lists-components.jsx` — shared atoms (Avatar, AvatarStack, SubTabs, scope
  chips, progress donut/bar, checkboxes, type tile, sample data).

> The prototypes use React + inline styles + hard-coded tokens to run standalone.
> Ship as **Svelte components + Tailwind token classes**, reusing `$lib/ui/*` everywhere
> a primitive already exists.
