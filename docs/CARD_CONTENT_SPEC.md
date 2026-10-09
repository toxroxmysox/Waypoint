# Card Content Spec — Item & Day Surfaces

> **Label (Scott, 2026-10-09):** the gold open-loop chip reads **`To book`** everywhere (was `Needs booking`, too wide at 375px). Screen readers still hear "needs booking". The predicate is unchanged: `needsBooking()`.

> Grilled: 2026-06-10. Source of truth: **the repo**. The `waypoint-card-design` handoff was validated against the code, not the other way around.
> Companion to: `docs/PHASE_REDESIGN_PRD.md` (parking-lot/drag mechanics), `CONTEXT.md` (domain language).
> Scope: a **content contract** — which real field feeds each slot on each surface, and its confirmed capture path. This is the binding field→slot reference the phase-redesign build wires against. Not a layout/visual spec (the handoff owns pixels).
>
> **⚠️ Partially superseded (2026-06-13, ADR-0011 / #210 Item Assignment):** the "card avatars = votes only, never assignees" rule is **reversed**. Item-card avatars now denote **assignees** (`assigned_to`, when trip >1 member); **votes move to an icon + count pill** on cards (the who-voted-what avatar stacks remain on item **detail**). Affected below: decision **#5**, the timeline card **Reactor avatars** row, and the **parking-lot card** line.

> **⚠️ Being superseded (2026-10-03, updated 2026-10-06):** the card redesign in `docs/CARD_SYSTEM.md` (decisions D1–D13: four card shapes, the rail owns time, colour means "act on this", Going, votes on ideas only, the item page, desktop) replaces this doc's per-surface tables. Each card-system ticket amends this doc **as its surface ships**, updating the section for its surface or adding one (this doc covers only four surfaces today). Until then, the rows below describe the *as-built* contract, not the target.

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
| 5 | `assigned_to` | "responsible members" (no actual slot) | captured (>1 member) + rendered in detail today | ~~**✅ keep, detail-only.** Card avatars stay votes-only.~~ → **SUPERSEDED by ADR-0011 (#210):** card avatars now denote **assignees** (>1 member) + double as the self-assign "+ Me" target; votes → icon+count pill on cards (faces stay on detail). One avatar meaning per card holds — inverted to assignment. |
| 7 | `reservation_url` | Booking peek | captured + rendered | **✅ keep.** |
| 7 | `free_cancellation` | Booking peek | captured + rendered | **✅ keep.** |
| 7 | `booked_by` | Booking peek | pure ghost (no capture, no render) | **❌ cut.** Column retained, deprecated. |
| 6b | `start_tz` / `end_tz` | When row, "→ when they differ" | flight lookup returns them, form drops them; never rendered | **⚠️ cut from UI.** Capture flight-only via API autofill (no manual field, no display). Stored-not-shown. Capture wiring → follow-up. |
| 6c | linked `goals` in detail | Goals peek | captured goal-side; detail hardcodes `linked_goal_ids: []` | **⚠️ add-render**, deferred follow-up. |
| 6d | "Open in Maps" (`google_place_id`) | Maps link | captured; detail shows name+address only | **⚠️ add-render**, deferred (already on backlog: Integrations → Maps deep-links). |

---

## Per-surface content contract

Convention: every optional slot is **omitted when empty** (graceful degradation — no empty placeholders). `field` = the real `items` field that feeds it.

### 1. Day card — trip overview — AMENDED by #426 (card system, D10)

Colour means "act on this": gold is the one open loop, the stay is plain ink, today is the mode accent. Component `DayCard`; derivations in `src/lib/itinerary/day-card.ts` (`summarizeDay`, `todayTreatment`).

| Slot | Field / source | Capture path | Notes |
|---|---|---|---|
| Date anchor (dow/date/mon) | `day.date` | system | Centred vertically on the card. Formatted with `formatCalendarDate` (UTC). |
| Today marker | `day.date` vs the trip-local date (`tripToday`) | derived | **Planning Mode:** accent (moss) outline on the card, no pill. **Trip Mode:** the TODAY pill. |
| Note headline | `day.notes` | `days/[dayId]` `updateNotes` action | Else first item "+ N more"; fallback "Nothing planned yet" when empty, with a muted hint line "Add something, or drag an idea here" (spec #418; the day page it opens is where adding/dragging happens). |
| **Item count ("N items")** | count of `dayItems` (`day = X && end_date = ""`) | derived | **The sole fullness signal.** Timed + untimed alike. Excludes multi-day banners (`spanningItems`). |
| Second metric (toggle) | `needsBookingCount` **or** Σ `cost_estimate_usd` | derived | UI-preference toggle (booked | budget), persisted. Booked view: gold pill `N to book` (same chip as the item card strip, 5.81:1); when nothing is left to book but something was bookable, a quiet ink-soft `✓ 3/3 booked` (Scott, 2026-10-09: tells the group that day is set); nothing when the day has no bookable items. Budget sums the single Cost. |
| Stay line | multi-day `lodging` spanning the date | `spanningItemsForDate`, `nightInfo` | Plain ink-soft text + 16px lodging icon, one line per lodging: `Night 2 of 3 · The American Club` (check-in and middle days), `Check-out · Name` on the last day. |

**Cut:** Morn/Aft/Eve coverage pills (decision #3); the moss Check-in/Check-out chip and the `x/y booked` ratio (#426). **Loader note:** the overview must fetch items-per-day to compute the count — it doesn't today (loads days only). Count and the budget toggle ride the same fetch; no extra query. The whole card is the tap target (no new controls, so no new hit areas).

### 2a. Day page timeline (Planning Mode) — AMENDED by #420 (card system)

This block replaces the timeline-card table below for the day page. The parking-lot card paragraph below still describes the as-built idea card until #421.

Components: `ItemCard` (head / meta / strip), `RailStack` (the rail's per-card stretch), `CardStrip`, `TimeSlotDivider`, `FreeTimeLabel`; derivations in `src/lib/itinerary/card-anatomy.ts`.

| Slot | Field / source | Rule |
|---|---|---|
| Rail: time | `start_time` (top edge), `end_time` (bottom edge) via `railTimeLabels` | `6:30p` grammar. End-only = plain bottom label, no `by`. Untimed = none. **The card never prints a time.** Both times of a real overlap turn red (earlier item's end, later item's start). |
| Rail: node | `type` | `MonoTypeIcon` 24px disc, vertically centred on the card; dashed when untimed. Segments (within the item only) are dropped under 6px. No line between cards. |
| Head | `title` (2 lines max), `cost_estimate_usd` on the right | Cost shown in Planning Mode only. |
| Meta | location; flight `MKE → DEN` (airport codes in `location_name` + the description's arrival label); note = first description line | One line, omitted when empty. Flight number not stored yet (#flights ticket). |
| Strip left (priority order) | `Overlaps {partner}` · `To book` (gold, `needsBooking()`) or `✓ Booked` · documents count (`documents` where `kind != 'code'`) | Overflow: the lowest-priority entry shrinks to its icon, then drops (`fitStrip`). Overlap is red only when both items share a Going member (`assigned_to`; `not_going` never counts), else ink. The partner is the other item's title clipped to 16 characters (`Overlaps Red Rocks hike`; Scott, 2026-10-09). Only items with both a start and an end can overlap; untimed, start-only and end-only never do. Three-way: the note names a partner sharing people if one exists, else the first by start; each rail time goes red per collision with shared people, so a middle item can be red at both ends. |
| Strip right | `assigned_to` bubbles (`PersonBubble`), then struck `not_going` bubbles; max 3 then `+n` | Shown when the trip has >1 member. Display only: the "+ Me" chip is retired (#440); members answer on the item page. Tapping the bubbles opens a read-only who's-on-this sheet (going names, then struck not-going names). No answer is never shown. |
| Votes | — | Not shown on planned cards. |
| Height | content only | A card with a time label is at least 62px. |
| Dividers | derived from the first anchor of each slot | Morning / Afternoon / Evening, centred, rule on either side. |
| Free time | gap of ≥ 60 min from a known end (end or deadline) to the next timed start | `2h free · 4:30p to 6:30p`, text only; spoken "Free, 4:30p to 6:30p". |
| Accessible name | time + title + type + state | e.g. "6:30 to 8:30 PM, Dinner at The Immigrant, meal, needs booking". On the card's link; the drag wrapper keeps `aria-label={title}`. |

### 2. Itinerary timeline card (+ parking-lot card) — AS BUILT before #420 (superseded for the day timeline by 2a)

Timeline membership = `dayItems` (`day = X && end_date = ""`), ordered by `buildTimeline()` (anchored by time, untimed by `sort_order`). Dayparts (Morning/Afternoon/Evening dividers) live **here**, from `start_time` (`timeline.ts`) — not on the day card.

| Slot | Field / source | Capture path | Notes |
|---|---|---|---|
| Type glyph | `type` (+ `subtype`) | form | `TypeIcon`. |
| Eyebrow pills | `booked` → **Booked**; `needsBooking(item)` → **Needs booking** | form (`booked`, `requires_booking`) | Mutually exclusive. "Needs booking" only on committed (planned) items — never parking lot. |
| Title | `title` | form | |
| Time / location line | `start_time`–`end_time`, `location_name` | form | Anchored shows time; flowing shows "flex". |
| Subtype | `subtype` | form | |
| ~~Reactor avatars~~ → **Assignee avatars** | `assigned_to` (avatars via `member-avatar`); ~~`votes`~~ | self-assign "+ Me" / ItemForm | **ADR-0011 (#210):** card avatar slot = **assignees** (>1 member) + self-assign target. Votes now render as an **icon + count** pill (avatar stacks moved to detail). |
| Cost | **`cost_estimate_usd`** (single "Cost") | form | Number only on the card — no expense link here (keep dense card clean). |

**Parking-lot card** — AMENDED by #424 (card system, D7): see **2d** below. As built before #424: drag handle, `TypeIcon`, `title`, `subtype`, assignee avatars, pull-up. **No "Needs booking" pill** (uncommitted). Lifecycle per `PHASE_REDESIGN_PRD.md` (`pullToPlan` → planned+day; `pushToParking` → unplanned, day cleared, time stripped).

### 2e. Span band — Multi-day Items on the day page and Now — NEW by #423 (card system, D10/D11)

Replaces `MultiDayBanner` (solid moss/clay fill, `Ongoing` pill; both gone). Component `SpanBand`; text from `spanBandText(item, days, date)` in `src/lib/itinerary/multi-day.ts`.

| Slot | Rule |
|---|---|
| Where | Top of the day page (above the timeline, outside the dnd zone, never dragged) and top of Now (above the Hero; the Hero is the only accent). One band per spanning item. |
| Shape | Full-width, `surface-2`, no shadow, no accent, min 44px tall; the whole band links to the item. |
| Icon | `MonoTypeIcon` 24px disc (`sub` passed, so a car rental shows the car), centred in the 48px rail column. |
| Title | Item title, starting where card titles start (rail 48 + gap 8 + card padding 12). One line, truncated. |
| Text | One line, ink-soft, below: see below. |

| Phase | Stay (lodging) | Rental (transportation) | Other type |
|---|---|---|---|
| First day | `Check-in 3:00p · 3 nights` | `Pick up 10:00a` | `Starts 10:00a` |
| Middle | `Night 2 of 3 · check-out Sat by 11:00a` | `Day 2 of 5 · return Sun by 12:00p` | `Day 2 of 5 · ends Sun by 12:00p` |
| Last day | `Check-out by 11:00a` | `Return by 12:00p` | `Ends by 12:00p` |

Times are `start_time` (first day) and `end_time` (middle and last) through `formatClock`; each part drops when the time is unset (`Check-in · 3 nights`, `Night 2 of 3 · check-out Sat`, `Check-out`). One night reads `1 night`. The weekday is the end date as a calendar day (UTC, #393). The rental's `Day N of M` counts days (M = nights + 1); a stay counts nights. The day card's stay line (§1) is unchanged.

### 2d. Ideas grouped by type (Parking Lot) — NEW by #424 (card system, D7)

Surfaces: the day page's Parking Lot (phone and tablet), the desktop Ideas panel (>= 1280px), Phase Detail's parking list (`PhaseIdeas`; includes pending Ghost Cards).

| Part | Rule | Source |
|---|---|---|
| Groups | One group per item type present, in this order: **Lodging · Flights · Transportation · Activities · Meals · Notes**. Empty groups are omitted; the legacy `checklist` type folds into Notes. | `idea-groups.ts` |
| Heading | The 16px mono type glyph + the plural label (`IdeaGroupHeading`). | `MonoTypeIcon` |
| Sort in a group | Weighted vote score desc (2 / 1 / 0 / -2), ties by `sort_order` asc. Never shown as a number. | `voting.ts`, `ideaGroups` |
| Idea card | `title`, then a sub-line `place · cost` (`Sheboygan · $40`; empty parts dropped). Place = card meta (location; a flight's `MKE → DEN`; a note's first line). **No type icon**, no subtype line. | `ideaSub`, `cardMeta` |
| Votes | **Tap-to-vote pills (#425)** under the sub-line: Love ♥ · Like + · Flexible ~ · Pass –, **all four always shown**, each with its count (glyph + count; the label is in the accessible name and tooltip). The viewer's own pill is filled; tapping it again clears the vote; tapping another moves it. No score is ever shown. Each pill is a real 44px box (no pseudo-element overlay). The group's accessible name reads `2 love, 1 pass, your vote love` (`no votes` when empty); each pill reads `Love, 2: You, Sam`. Desktop hover/focus shows a tooltip of who voted. Viewers (`role = viewer`) see the same four pills as counts only, not tappable. A tap never opens the card nor starts a drag; the pills are not a drag handle (press the title or sub-line to drag). Writes go through the item page's `?/vote` / `?/unvote` actions (optimistic, double-tap guarded). Dragging among ideas still changes nothing: a vote moves an idea within its group after the round-trip. | `VotePills`, `votePills`, `votePillsLabel`, `withMyVote` (`voting.ts`) |
| Assignees | `assigned_to` bubbles, then struck `not_going` bubbles (#440; same strip as Planning cards: max 3 then `+n`, no "+ Me"). | `AssigneeStacks` |
| Primary action | The owner's pull-up chevron on the day page (44px hit area), as built. A traveler's action stays deferred to #401. | `pullToPlan` |
| Drag | Grip handles retired. Touch: long-press (250ms) anywhere on the card; mouse: immediate. Dropping on the day plans the idea. Dragging among ideas changes nothing (the order is the vote order): the zone snaps back, no write. Phase Detail has no drag (no day to drop on). The desktop Ideas panel is inert until #445. | `DragDropTimeline`, `ParkingLotSection` |

### 2b. Now — the Hero (mid-event Focus) — added by #428 (card system, D10/D11)

One component, `Hero.svelte`, built here and reused by the item page header (#438) and the Swipe-Quiz face (#443). On Now it renders one Hero per ongoing item (several Heroes: #430, below).

| Row, top to bottom | Shows | Absent when |
|---|---|---|
| Header | 40px accent-filled type icon beside the title (Fraunces 22px); `⋯` at the right | `⋯`: viewer / traveler (no Skip), as `itemMenuEntries` |
| Place | name, then address; the block opens Maps (44px min) | no place |
| Live line | `NOW · until 4:00p · 55m left` in the accent (end exclusive; `< 1m left` in the last minute; ticks every 30s). A start-only item reads `NOW · since 1:00p` (#431; no countdown) | not ongoing |
| Codes | one large (56px) mono tap-to-copy row per code, `LABEL` above the value, toast `Code copied` | no codes |
| People | `✓ Booked` (ink, quiet), `Going` + a neutral bubble and name per going member | not booked / nobody going |

- **Accent:** clay border (2px) and filled icon. The Hero is the only accent on Now: the Coming up divider is ink, and the next card has no accent or `Up next` pill (D10).
- **`⋯`:** `itemMenuEntries` with Move and Delete masked off, so only `Skip…` (owner / co_owner). The sheet is `ItemActionSheets`; a refused Skip shows `ITEM_ACTION_ERRORS.skip` in the sheet. Now is the Skip destination, so it refreshes in place and opens the "Replace it" ideas strip.
- **Tap:** the card opens the item page; the place, codes and `⋯` sit above that link.
- **Props (for #438 / #443):** `item`, `members`, `status` (live styling when set), `timeText` (non-live time line), `typeLine` (`Meal · Fine dining`), `codes`, `href`, `placeLink`, `showGoing`, `menu` snippet, `children` snippet.
- **Several Heroes (#430):** every ongoing timed item gets a full Hero, stacked 12px apart, no divider. Order: items the viewer is going to (their trip_members id in `assigned_to`), then everyone else's; each group by start time, then end time. A Multi-day Item is never a Hero (it stays the banner / Span). No conflict is shown between Heroes: no overlap note, no red times. The free-time card shows only when nothing is ongoing for anyone. Each Hero has its own `⋯` / Skip (one shared sheet, pointed at that item). Seam: `getNowFeed(items, now, hasToday, viewerMemberId)`; mid-event focus is `{ heroes, currentItem (= heroes[0]), minutesRemaining (of heroes[0]; `null` for a start-only Hero, #431) }`.
- **Start-only Hero (#431):** a start-only item is ongoing from its start until the next timed item starts (another non-multi-day item with a later `start_time` that has begun), then it moves to Earlier today. With no later timed item it stays ongoing for the rest of the day. A deadline (no start) or an untimed item never ends it. Two start-only items sharing a start are both Heroes.
- **Free-time card (#431):** centred, three lines and no more: `FREE TIME`, a large countdown (`25m`), `until {next item title}`. It counts to the next timed start **or deadline** (`getNowViewState`: `nextItem` = earliest of upcoming starts and unpassed deadlines). No second line about later free time (the rail's free-time label says it). Shows only when nothing is ongoing.
- **Not here:** the lists around the Hero are 2c.

### 2c. Now's lists and Next 3 days — Trip Mode on the rail — added by #429 (card system, D2/D5/D10)

Earlier today, Coming up and the Next 3 days tab use the day page's Timeline Rail and `ItemCard` (2a) with `mode="trip"`. `TripModeCard` is gone.

| | Earlier today | Coming up | Next 3 days |
|---|---|---|---|
| Where | above the Hero, under an `EARLIER TODAY` divider | under the Hero, `COMING UP` | one group per day, day heading |
| Card | full Card, no white fill (transparent), 1px line border, no shadow | full Card | full Card |
| Text | title, meta and strip in ink-muted (5.4:1), never opacity | ink | ink |
| Rail | lighter rule and segments (`line`), outlined node (ink-muted ring, no fill) | monochrome node | monochrome node |
| `⋯` | none | Skip only, owner / co_owner of a planned dated item (`itemPermissions` + `itemMenuEntries`, Move and Delete masked, same sheet as the Hero) | none |
| Tap | opens the item | opens the item | opens the item |

- **Cost:** none, in any of them. **Overlap:** none, neither the note nor red rail times (`stripEntries` ignores a pair in Trip Mode).
- **Next item:** no accent, no `Up next` pill. The Hero is the only accent on Now.
- **Strip, left, in priority order:** `To book` (gold) > the booked slot > documents count. The booked slot in Trip Mode is `✓ {code}` (first code in mono, `+n` for the rest) when the item is booked and has a code, else `✓ Booked`. The chip is a button: tap copies the first code (toast `Code copied`; clipboard refused: `Could not copy — open the item to copy the code`) and does not open the item. Its 44px hit area is padding cancelled by negative margin, so card height does not change. Overflow: the chip shrinks to its check icon like any entry; its accessible name always carries the code and the `+n`. Earlier today keeps the chip, in ink-muted.
- **Strip, right:** Going bubbles, unchanged. Documents count comes from `docCountsForItems` (files only; codes are the chip).
- **Buckets by time shape (#431, closes #392; `bucketNowItems`).** Every item lands in exactly one of Earlier today / ongoing (a Hero) / Coming up, against the trip's clock:
  - untimed: Coming up, always (never past).
  - range: Coming up before its start, a Hero in [start, end), Earlier today from its end.
  - deadline (end-only): Coming up until its time passes, then Earlier today. No overdue state.
  - start-only: Coming up before its start; a Hero until the next timed item starts (see 2b); then Earlier today.
  - Multi-day: none of the three (banner / Span).
  Earlier today is ordered by anchor time (start, else the deadline). A deadline's rail time is the bare end time on the card's bottom edge; the text form with `by` is for rail-less shapes.
- **`ItemCard` props added:** `muted`, `menu` (snippet). `RailStack`: `past`. `MonoTypeIcon`: variant `outlined`. `CardStrip`: `muted`; `StripEntry` / `stripEntries` / `stripCode` live in `card-anatomy.ts`.

### 3. Item detail

**Hero + body — AMENDED by #438 (card system, D12/D13), Planning Mode.** The Hero (#428) is the header; the old header card and the view-mode Schedule / Location / Booking / Cost / Assigned-to cards are gone. Pure rules in `src/lib/itinerary/item-page.ts`.

| Slot | Field / source | Notes |
|---|---|---|
| Hero: icon, title | `type`, `subtype` (`MonoTypeIcon`), `title` | Not live in Planning Mode: no accent, no `status`. |
| Hero: type in words | `itemTypeLine` | `Meal · Dinner`. A subtype of "other" drops. |
| Hero: place | `location_name`, `location_address` | The line is the Maps link (`mapsUrl`). |
| Hero: time | `itemTimeText` | Date leads: `Thu Oct 1 · 6:30p–8:30p`; a stay reads `Thu Oct 1–Sat Oct 3 · 2 nights`. Untimed: the date alone. |
| Hero: codes, documents | code documents; file documents | Codes are large tap-to-copy rows; documents are 44px rows that open the file, newest first. Documents also stay in the Documents section, which manages them. |
| Hero: status | `booked` → `✓ Booked`; `status === 'done'` → `✓ Done`; `needsBooking` → gold `To book` chip | #441 turns the chip into the Book / Mark booked button. |
| Hero: Going (#440) | `assigned_to`, `not_going`, the viewer's own answer (`goingView`) | Non-viewers on a trip with >1 member see their own control first: unanswered `Are you going?` + **Going** / **Not going**; answered `You're going · change` or `You're not going · change` (`change` reveals the two buttons again). All controls are 44px tall; selected is ink, never colour. Below it, `Going` + a bubble and name per going member, then struck bubbles with struck names for the not-going. No answer is never listed. Viewers see the names and no controls. The write is the caller's own `POST /api/items/{id}/assign-self` with `{ state }` (optimistic, rolled back with an inline error on failure). No "clear my answer" control. The same people row shows on Now's Hero. |
| Votes | `VoteButtons` (non-viewers) | Under the Hero; #442 decides where votes and Going each show. |
| Description | `description` | Plain paragraph. |
| Details (one card) | `detailsRows` | Rows, each omitted when empty: **Estimate** (`cost_estimate_usd`), **Payment**, **Booking** (host of `reservation_url`, opens it), **Cancellation** (`Free cancellation`), **Phase**. Payment is its own row and never reads the estimate: `Paid $X` + `n expenses` (links to the item's expenses) once any expense links the item, else `Log payment` (prefilled add) for non-viewers on non-notes. No rows, no card. |
| Goals | linked `trip_goals.items` | Read-only rows, omitted when none. |
| Documents, Checklist | `documents[]`, item checklist | Full section only when it has content (Documents also after `+ Document`). Otherwise one dashed line: `+ Document · + Checklist`, each entry only for roles that may add it (`canUpload`, `canEditChecklist`); none for viewers. `+ Checklist` attaches in place. |
| Comments | `suggestions` (target_item) | The composer first, then the list newest first (`newestFirst`). |

**Layout.** One column on phones in the order above (Hero, votes, description, Details, Goals, Documents, Checklist, add line, Comments). From 900px two columns, each about a phone wide: left = Hero, votes, description, Details, Goals; right = Documents, Checklist, the add line, Comments. **Copy:** "Assigned to" is now "Going" everywhere (Hero, edit form).

**Cut:** `paid_by`, `booked_by`, `cost_actual_usd`, `start_tz`/`end_tz` display.

**Actions by role (#416).** Each control renders only for roles the server accepts it from, via `itemPermissions()` (`src/lib/itinerary/item-actions.ts`), which mirrors the server gates:

| Control | Shown to | Server gate |
|---|---|---|
| Edit, Move | owner, co-owner, the item's creator | `items.pb.js` update hook |
| Skip | owner, co-owner; planned item on a day | item page `skipItem` action |
| Delete | owner, co-owner | `items.pb.js` delete hook |
| Upload, checklist (add/remove, tick, assign, add task), votes, Log payment | everyone but viewers (Log payment: not on a note) | `documents.pb.js`, `checklists.pb.js` + `tasks.pb.js`, `votes.createRule` (0055), expenses |

A viewer sees an existing checklist read-only. A refused or failed Move, Skip or Delete says so in place ("Couldn't … Reload the page and try again."), inside the sheet that tried it. After Skip, Trip Mode goes to Now; Planning Mode stays on the page with a "back in your ideas" toast.

**Header bar and `⋯` menu (#437, D12).** The NavBar is: back · trip name · **Edit** · `⋯`. The item title is not in the bar (the Hero shows it). Edit is a visible 44px link for anyone who can edit. `⋯` is a 44px button that opens a popover; its rows are 44px tall and come from `itemMenuEntries(itemPermissions(...))`, a pure projection of the permissions, so the menu never lists what the server would refuse:

| Viewer | `⋯` contents |
|---|---|
| owner, co-owner | Move to another day · Skip… · divider · Delete (Skip only for a planned item on a day) |
| the item's creator | Move to another day |
| everyone else (incl. viewers) | no `⋯` (and no Edit unless they created it) |

Each row opens its own bottom sheet (the app's modal shape): **Move** (day / phase pickers), **Skip** ("Not happening?", keeps "Nothing is deleted" and says the item returns to the ideas; Skip / Cancel), **Delete** (names the document count; Delete / Cancel, clay). A refused action shows its `ITEM_ACTION_ERRORS` message inside that sheet and leaves it open. The sheets render outside the NavBar, because the header's backdrop blur would otherwise contain their `position: fixed`. The bottom-of-page "Not happening?" and "Delete item" panels are gone. The edit page keeps its own Delete panel (gated by `canDelete`).

### 4. Item create / edit

Field visibility is driven by `getFieldConfig(type).visibility` (`item-fields.ts`) — the design's "progressive disclosure" is this config. Captured fields exactly as the ground-truth list above. Specifics:

- **Cost section:** **one input — "Cost"** (writes `cost_estimate_usd`). Drop the "Actual" input.
- **Booking section:** `requires_booking` ("Needs a reservation"), `booked`, `reservation_url`, `free_cancellation`. **No `booked_by`, no `paid_by`.**
- **Flight:** `FlightLookup` autofills `title/description/times/end_date/location_name` **and** (⚠️ to wire) `start_tz`/`end_tz` — persisted, never shown.
- **Status:** edit UI exposes **Planned / Done** only. `unplanned`/`considered` are system/closeout-driven — do not add them to the dropdown.
- **assigned_to:** shown only when trip has >1 member. **goals:** "Addresses goal(s)" multi-select.

---

### 4a. Rows, part 1 — booking and flights Smart Lists, money's Still planned, overview Flights & stays — NEW by #433 (card system, D11)

One two-line Row for every list. Component `Row` (`src/lib/ui/Row.svelte`); derivations in `src/lib/itinerary/row.ts` (`rowSub`, `flightSub`, `fitFlightSub`, `rowTrailing`, `rowContent`, `keyItemRows`). Rows part 2 (#434) adopts it on the remaining lists.

| Slot | Field / source | Rule |
|---|---|---|
| Leading action | booking list only: the `Mark booked` checkbox | Left of the icon; shifts the row right. 44x44 hit area. |
| Icon | `type` / `subtype` | `MonoTypeIcon` 16px bare glyph, ink-soft. Never coloured. |
| Headline | `title` | One line, ellipsis. |
| Sub-line, non-flight | day date · time (text grammar) · place | `Thu Oct 1 · 6:30p · Immigrant`. Range `10:00a–12:00p`, deadline `by 4:30p`, untimed = date only. Place = `location_name`, else the phase name. A multi-day lodging reads `Thu Oct 1–Sat Oct 3 · 2 nights · Place`. Parts are omitted when empty. |
| Sub-line, flight | departure date · `dep → arr` · route | `Thu Oct 1 · 2:05p → 4:20p · MKE → DEN`. Route = airport codes in the labels, else the labels. A later-day arrival reads `6:10a +1`; a clock-less red-eye shows the arrival date. **Overflow:** parts drop in this order: arrival time, departure time, date. The route never drops (CSS truncates it last). Measured with the real font (`FlightSubLine`). |
| Trailing slot (one value) | `rowTrailing`: chip > cost > people > chevron | Booking list: moss `Booked` chip once checked, else chevron. Flights list: passenger bubbles (max 3, then `+n`), else chevron. Money Still planned: `$cost` (mono). Overview Flights & stays: gold `To book` chip (`NeedsBookingChip`, the #420 / #426 chip) when `needsBooking()`, else chevron. |
| Tap target | the whole body | One link to the item, at least 44px tall. |

Flights & stays on the overview now sorts by date (undated last, then start time) and reads from a small flights-and-lodging query so the main items fetch stays light. The flight title and `UA 1234 · MKE → DEN` place line are #435.

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
