# Card Content Spec — Item & Day Surfaces

> Grilled: 2026-06-10. Source of truth: **the repo**. The `waypoint-card-design` handoff was validated against the code, not the other way around.
> Companion to: `docs/PHASE_REDESIGN_PRD.md` (parking-lot/drag mechanics), `CONTEXT.md` (domain language).
> Scope: a **content contract** — which real field feeds each slot on each surface, and its confirmed capture path. This is the binding field→slot reference the phase-redesign build wires against. Not a layout/visual spec (the handoff owns pixels).

## Why this exists

The design handoff's "data model" table and field-map screenshots make binding field→slot claims. Several don't survive contact with the code: they render fields that **no create/edit flow captures** (always-empty slots are lies), or describe lifecycle behavior the code contradicts. This doc resolves every such slot to one of:

- **✅ keep** — exists in schema, captured by a real flow, can be populated.
- **⚠️ resolved** — in schema but no capture/render path today; decision recorded (add, or defer).
- **❌ cut** — doesn't exist, is redundant, or is a permanent ghost.

## Capture-path ground truth

What the **real item form** persists (`ItemForm.svelte` → `items/new/+page.server.ts` / `items/[itemId]/edit/+page.server.ts`):

`type, subtype, title, description, status (planned|done in the edit UI only), day, phase, start_time, end_time, end_date, location_name, location_address, location_coords, google_place_id, booked, requires_booking, reservation_url, free_cancellation, confirmation_codes[], cost_estimate_usd, cost_actual_usd, assigned_to[]` (only when the trip has >1 member), `goals` (written goal-side via `syncGoalLinks`).

In schema but with **no capture path anywhere**: `paid_by`, `booked_by`, `start_tz`, `end_tz`, `parent_item`. (`location_coords`/`google_place_id` are captured, but only through the Places autocomplete, never typed.)

Status reality: the edit dropdown offers **Planned / Done only**. `unplanned` is system-set (no `day` → `unplanned`); `considered` is **closeout-only** (`closeout/+page.server.ts` sets it on swap; rendered in archive/closeout/more, never in planning).

---

## Global decisions (the grilled mismatches)

| # | Field / concept | Design claimed | Code truth | Decision |
|---|---|---|---|---|
| 1 | `paid_by` (item) | "Cost · paid by `paid_by`" on detail | Uncaptured, unrendered; "who paid" lives on `expenses.paid_by` | **❌ cut** from all item surfaces. Settlement stays in Money. |
| 1 | `cost_actual_usd` | Two cost columns (Estimate / Actual) | Captured + shown, but **never aggregated** anywhere; `cost_estimate_usd` is the number that circulates | **❌ collapse** to one slot. Single **"Cost"** = `cost_estimate_usd`. Stop capturing/showing actual. Column retained (append-only), deprecated. |
| 1 | Item ↔ Expense link | (implicit) | `expenses.linked_item` captured but rendered in neither direction | **⚠️ deferred.** Detail gets a conditional "View in expenses" affordance (present only when ≥1 linked expense). Two-way nav → follow-up issue. |
| 2 | Parking lot membership | `unplanned`/`considered`, "for that day" | `status="unplanned"` only, **phase-scoped, day-less** (`days/[dayId]/+page.server.ts:53`) | **❌ cut `considered`** from parking lot; **cut day-scoping.** Pool is the phase's `unplanned` items, shown under every day in the leg. |
| 6 | `considered` status | a parking-lot state | closeout-only abandoned/swapped state | **✅ keep as enum value**, **❌ zero binding to the parking lot.** |
| 3 | Day-card coverage (Morn/Aft/Eve) | counts timed items per daypart | dayparts derive only from `start_time`; untimed items (the common case) have none | **❌ cut the coverage pills.** Fullness = **one item count** = `dayItems` (timed + untimed; excludes multi-day banners). |
| 4 | "Needs booking" pill | from `booked`/`requires_booking` | `requires_booking` real + set; pill not rendered today | **✅ add**, bound to `needsBooking()` = `planned && requires_booking && !booked`. Suppressed on parking-lot/unplanned. Mutually exclusive with `Booked`. |
| 5 | `assigned_to` | "responsible members" (no actual slot) | captured (>1 member) + rendered in detail today | **✅ keep, detail-only.** Card avatars stay **votes-only** (one avatar meaning per card). |
| 7 | `reservation_url` | Booking peek | captured + rendered | **✅ keep.** |
| 7 | `free_cancellation` | Booking peek | captured + rendered | **✅ keep.** |
| 7 | `booked_by` | Booking peek | pure ghost (no capture, no render) | **❌ cut.** Column retained, deprecated. |
| 6b | `start_tz` / `end_tz` | When row, "→ when they differ" | flight lookup returns them, form drops them; never rendered | **⚠️ cut from UI.** Capture flight-only via API autofill (no manual field, no display). Stored-not-shown. Capture wiring → follow-up. |
| 6c | linked `goals` in detail | Goals peek | captured goal-side; detail hardcodes `linked_goal_ids: []` | **⚠️ add-render**, deferred follow-up. |
| 6d | "Open in Maps" (`google_place_id`) | Maps link | captured; detail shows name+address only | **⚠️ add-render**, deferred (already on backlog: Integrations → Maps deep-links). |

---

## Per-surface content contract

Convention: every optional slot is **omitted when empty** (graceful degradation — no empty placeholders). `field` = the real `items` field that feeds it.

### 1. Day card — trip overview

| Slot | Field / source | Capture path | Notes |
|---|---|---|---|
| Date anchor (dow/date/mon) | `day.date` | system | "Today" pill when date = now. |
| Note headline | `day.notes` | `days/[dayId]` `updateNotes` action | Fallback "Nothing planned yet" when empty. |
| **Item count ("N items")** | count of `dayItems` (`day = X && end_date = ""`) | derived | **The sole fullness signal.** Timed + untimed alike. Excludes multi-day banners (`spanningItems`). |
| Second metric (toggle) | `booked`/bookable counts **or** Σ `cost_estimate_usd` | derived | UI-preference toggle (booked | budget), persisted. Budget sums the single Cost. |
| Stay chip | multi-day `lodging` spanning the date | `spanningItemsForDate` | Check-in/Staying/Check-out · name. |

**Cut:** Morn/Aft/Eve coverage pills (decision #3). **Loader note:** the overview must fetch items-per-day to compute the count — it doesn't today (loads days only). Count and the budget toggle ride the same fetch; no extra query.

### 2. Itinerary timeline card (+ parking-lot card)

Timeline membership = `dayItems` (`day = X && end_date = ""`), ordered by `buildTimeline()` (anchored by time, untimed by `sort_order`). Dayparts (Morning/Afternoon/Evening dividers) live **here**, from `start_time` (`timeline.ts`) — not on the day card.

| Slot | Field / source | Capture path | Notes |
|---|---|---|---|
| Type glyph | `type` (+ `subtype`) | form | `TypeIcon`. |
| Eyebrow pills | `booked` → **Booked**; `needsBooking(item)` → **Needs booking** | form (`booked`, `requires_booking`) | Mutually exclusive. "Needs booking" only on committed (planned) items — never parking lot. |
| Title | `title` | form | |
| Time / location line | `start_time`–`end_time`, `location_name` | form | Anchored shows time; flowing shows "flex". |
| Subtype | `subtype` | form | |
| Reactor avatars | `votes` (item `votes` collection) | VoteButtons | **Votes only.** Never assignees. |
| Cost | **`cost_estimate_usd`** (single "Cost") | form | Number only on the card — no expense link here (keep dense card clean). |

**Parking-lot card** (phase-scoped `unplanned` pool, rendered under every day in the leg): drag handle, `TypeIcon`, `title`, `subtype`, reactor avatars, pull-up affordance. **No "Needs booking" pill** (uncommitted). Lifecycle per `PHASE_REDESIGN_PRD.md` (`pullToPlan` → planned+day; `pushToParking` → unplanned, day cleared, time stripped).

### 3. Item detail

| Slot | Field / source | Capture path | Notes |
|---|---|---|---|
| Hero: type/subtype, title | `type`, `subtype`, `title` | form | |
| Hero pills | `booked` → Booked; `status === 'done'` → Done | form | |
| Description | `description` | form | |
| Schedule | `day` (date), `phase`, `start_time`–`end_time` | form | **When row = `date · start_time – end_time`. No tz.** |
| Location | `location_name`, `location_address` | form (Places) | **⚠️ add** "Open in Maps" from `google_place_id` (deferred). |
| Booking | `reservation_url`, `free_cancellation`, `confirmation_codes[]` | form | **No `booked_by`.** |
| **Cost** | **`cost_estimate_usd`** (single "Cost") | form | **⚠️ add** conditional "View in expenses" → filtered expenses list, only when ≥1 `expenses.linked_item` points here (deferred). |
| Assigned to | `assigned_to[]` | form (>1 member) | **Keep.** Detail-only. |
| Votes | item `votes` | VoteButtons | Header VoteButtons + stacks. |
| Goals | linked `trip_goals.items` | form (goal-side) | **⚠️ add-render** (deferred); detail currently passes `linked_goal_ids: []`. |
| Documents | `documents[]` | DocumentSection | Keep. |
| Comments | `suggestions` (target_item) | comment form | Keep. |

**Cut:** `paid_by`, `booked_by`, `cost_actual_usd`, `start_tz`/`end_tz` display.

### 4. Item create / edit

Field visibility is driven by `getFieldConfig(type).visibility` (`item-fields.ts`) — the design's "progressive disclosure" is this config. Captured fields exactly as the ground-truth list above. Specifics:

- **Cost section:** **one input — "Cost"** (writes `cost_estimate_usd`). Drop the "Actual" input.
- **Booking section:** `requires_booking` ("Needs a reservation"), `booked`, `reservation_url`, `free_cancellation`. **No `booked_by`, no `paid_by`.**
- **Flight:** `FlightLookup` autofills `title/description/times/end_date/location_name` **and** (⚠️ to wire) `start_tz`/`end_tz` — persisted, never shown.
- **Status:** edit UI exposes **Planned / Done** only. `unplanned`/`considered` are system/closeout-driven — do not add them to the dropdown.
- **assigned_to:** shown only when trip has >1 member. **goals:** "Addresses goal(s)" multi-select.

---

## Cut list (do not render; schema columns retained per append-only rule)

- `paid_by` — Expense concept, not an item concept.
- `cost_actual_usd` — collapsed into single Cost; unused by any aggregate.
- `booked_by` — ghost, marginal value.
- `start_tz` / `end_tz` — captured flight-only, **never displayed**.

## Deferred follow-ups (tracked in `SPEC_BACKLOG.md`)

1. **Item ↔ Expense two-way navigation** (Money) — detail "View in expenses" + expense "View item"; multiplicity-safe (filtered list, not single record).
2. **Linked goals in item detail** (Itinerary) — load `trip_goals.items` back-link into the detail view.
3. **Flight tz capture** (Itinerary/Integrations) — persist `start_tz`/`end_tz` from `FlightLookup` (no UI).
4. **Open in Maps** — already on backlog (Integrations → Maps deep-links).
