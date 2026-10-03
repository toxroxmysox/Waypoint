# Card System — how an Item renders everywhere

> **Status:** living design doc, started 2026-10-01. It began as #388 (the timeline card printing its time twice), and Scott widened it to **every surface that renders an [[Item]]**: the planning timeline, the trip-mode hero (Now Focus) and Now cards, multi-day banners, ideas, lens lists, closeout, and the record.
> **How to read it:** §1 is the as-built catalog, verified against the code at `840cd7b`. §2 lists what the catalog exposes. §3 is the decision log, filled in as decisions are made with Scott. §4 is the open-question queue.
> **Relationship to other docs:** `CARD_CONTENT_SPEC.md` stays the binding **field → slot** contract and is amended when a decision here ships. `CONTEXT.md` holds the terms.

---

## 1. As-built catalog (`840cd7b`)

Every place an Item is drawn, grouped by the **job** it does for the user. "Glyph" means `TypeIcon` at the given pixel size.

### A. Plan a day — Timeline card (planning mode)

| | |
|---|---|
| Component | `src/lib/itinerary/components/TimelineItemCard.svelte`, hosted by `DayTimeline.svelte` |
| Where | Day page `/trips/[slug]/days/[dayId]`, every breakpoint |
| Membership | `dayItems` (`day = X && end_date = ""`), ordered by `buildTimeline()` — timed items by anchor time, untimed items woven in by `sort_order` |
| Rail (#353) | 44px gutter with a continuous line. A timed item prints its **anchor** time (its start, or its end if it only has an end, #346) split over two lines (`9:00` / `AM`). An untimed item gets a hollow dot. Morning, Afternoon and Evening dividers sit on the rail. |
| Face, top → bottom | 32px glyph · pill above the title (`Booked` **or** `Needs booking`) · title (one line, truncated) · time/location line (`9:00 AM – 11:00 AM`, `Ends by 6:00 PM`, or `No Time Set`, then `· location`) · subtype (its own uppercase line) · vote sentiment pill (`♥ 2 + 1`) · cost (top right) · assignee row (avatars, or a dashed `+ Me`; only when the trip has >1 member) |
| Interactions | Tap → item detail. Long-press (250ms) → drag to reorder or park. One-tap self-assign. Assignee view sheet. |
| States | Overlapping → gold left border at 90% opacity |

### B. Live the day — Trip-mode card (trip mode)

| | |
|---|---|
| Component | `src/lib/trip-mode/components/TripModeCard.svelte` |
| Where | **Now** `/trips/[slug]/now`: the **Focus** (mid-event, wrapped with a `Right now` pill and `Xm remaining`) **and** every "Coming up" card. **Next 3 Days** `/trips/[slug]/today/upcoming`. |
| Face | 44px glyph · start time (mono, large) · `Up next` / `Booked` pills · title (large) · location · subtype · confirmation codes as label/value rows · `⋯` skip menu (owner/co_owner) |
| Not shown | End time, deadline time, cost, votes, assignees |
| States | `isNext` → clay border, clay wash, `Up next` pill |
| Note | The Focus "hero" is this same component. Only the wrapper differs. |

### C. Now page compact rows (inline in `now/+page.svelte`)

| Row | Shows |
|---|---|
| "Earlier today" (faded to 55%) | mono start time + title. Holds timed items whose end has passed. |
| Tomorrow preview (bordered, max 3, "+N more") | mono start time (or `—`) + title |

The Focus slot also holds four **state cards** that are not item cards: Free time (a countdown), Day wrapped, Nothing else planned, and No itinerary for today.

### D. Span context — Multi-day banner and its projections

| | |
|---|---|
| Component | `src/lib/itinerary/components/MultiDayBanner.svelte` |
| Where | Top of the Day page (`spanningItems`) and top of Now (ongoing, with an `Ongoing` pill) |
| Face | Solid **mode-accent** fill (moss in planning, clay in trip mode) · glyph in a translucent circle · title · `Ongoing` pill (Now only) · `Jun 18 → Jun 22 · Check in · 3:00 PM` / `night 2 of 3` / `Check out · 11:00 AM`. Non-lodging items say `Starts` / `Ends`. |
| Projections | **Day card stay chip** (overview + phase): moss `Check-in · Name` / `Check-out · Name`. **Overview "Flights & stays"** rows: 20px glyph + title. |

### E. Weigh ideas — Parking-lot and idea renderings

| # | Rendering | Where | Face | Actions |
|---|---|---|---|---|
| E1 | `ParkingLotSection` (dnd mode) | Day page, behind the collapsed "Parking lot · N ideas" divider | grip · 18px glyph · title · subtype · sentiment pill · assignee row · pull-up chevron | drag to plan; chevron = pull up; tap → detail |
| E2 | `ParkingLotSection` (inert mode) | Desktop ContextRail "Ideas" (≥1280px, day pages) | same as E1, but the grip and chevron are decorative | tap → detail |
| E3 | `PhaseParkingReorder` | Phase Detail `/phases/[id]` | grip · 18px glyph · title · **type label tag**. **No votes, no assignees.** | drag reorders `sort_order` |
| E4 | `IdeasStrip` | Now, at a Free-time or Nothing-else Focus, or after a skip | 20px glyph · title · location · **voter avatars** (`VoteStacks`) · sentiment pill | `Do this` (owner/co_owner) promotes it into today |
| E5 | `GhostCard` | Phase Detail, below the ideas | dashed border · 18px glyph · title · `Pending` badge · "Suggested by X" · voter avatars + sentiment pill | vote buttons; approve/reject (owner/co_owner) |
| E6 | Swipe card (snippet in `swipe/[phaseId]/+page.svelte`) | Swipe-Quiz | 40px glyph · Fraunces title · `Planned`/`Idea` pill · day label · `⌖ location` · cost · "Added by X" · peek of others' votes · Details | swipe to vote |
| E7 | Forming idea row | Overview of a dateless (forming) trip | 20px glyph + title | tap → detail |
| E8 | Scenario chip | `/scenarios/new` | 13px glyph + title | pick into a scenario |
| E9 | Inbox suggestion card | `/inbox` (More → Inbox) | title · type · role badge (`TRAVELER`) · "Suggested by X · date" · votes · description box | Approve / Edit & Approve / Reject |

### F. Lens rows — projections of Items onto other lists

| # | Rendering | Where | Face |
|---|---|---|---|
| F1 | `SmartRow` | Booking list `/lists/booking` | checkbox (marks the item booked) · 34px glyph · title · mono meta (`place · date · N nights`) · `Open ›` |
| F2 | Flight row | Flights list `/lists/flights` | 34px glyph · `from → to` · `dep → arr` date·time · passenger avatars · `Open ›` |
| F3 | "Still planned" row | Money `/money` | 28px glyph · title · cost |
| F4 | Code group header | Docs `/documents` | 22px glyph · title, followed by its code chips |
| F5 | Linked-item row | Goal detail `/goals/[id]` | 28px glyph · title · `phase · day` · status pill (Done moss / Planned sky / Unplanned gold / Considered grey) · unlink |
| F6 | Flights & stays row | Overview | 20px glyph · title |

### G. Review and record — after the trip

| # | Rendering | Where | Face |
|---|---|---|---|
| G1 | `CloseoutItemRow` | Closeout wizard `/closeout` | 28px glyph · title · start time · date range with `adjust` (multi-day items) · `Done` / `Swap` / `Skip` |
| G2 | `ArchiveDaySection` item | Public archive `/archive/[token]` and the closed trip's Record view | 24px glyph · title · location · `start – end` · **full description** |
| G3 | "What we considered" row | Record view | 20px glyph · title, grouped by type |

### H. The inside — Item detail header

`/trips/[slug]/items/[itemId]`: 44px glyph · pills for type, subtype, `Booked`, `Done` · Fraunces title · vote buttons · description, followed by the read-only `ItemForm` (when, where, booking, cost, assignees, documents, comments).

### Dead code

`TodayItemCard.svelte` and `TodayTimeline.svelte` have **no importers**. They have been orphaned since #244 (`e2de1d5`, 2026-06-19) merged Today into Now, and only a code comment still mentions them.

---

## 2. What the catalog exposes (as-built findings)

1. **About 23 distinct renderings of one entity**, built from 11 components plus about 12 inline route snippets. Two of the components are dead.
2. **The type glyph comes in 11 sizes** (13, 18, 20, 22, 24, 26, 28, 32, 34, 40, 44px).
3. **One idea renders 9 different ways (E1–E9), and no planning-mode surface shows its votes.**
   - Phase Detail (E3), the parking lot's canonical home, doesn't render votes.
   - The day page (E1) and the desktop rail (E2) render a sentiment pill, but the day loader never fetches votes for parking-lot items, so the pill never appears (#394, verified with the fixture).
   - Votes only show on ideas in trip mode (E4, voter avatars plus a pill), on pending suggestions (E5/E9), and as a hidden-by-default peek in the swipe deck (E6).
4. **ADR-0011 says card avatars always mean assignees.** That holds on the timeline and the day page parking lot. On E4, E5 and E6 the avatars mean voters.
5. **Time renders differently on every surface.** The timeline prints it twice (rail and card). The trip-mode card shows the start only, with **no end and no deadline**. Earlier-today rows, tomorrow rows and closeout rows show the start only. The archive shows start–end. The flights list shows departure → arrival.
6. **Deadlines (end-only items, #346) are handled on exactly one surface (A).** Everywhere else they render with no time.
7. **Two Now-feed bugs** *(verified 2026-10-01 by a unit probe of the real `getNowFeed`; filed as #392):*
   - A deadline item has no `start_time`, so it always counts as "untimed rest". Once its end passes it *also* counts as "past", so it renders in both lists.
   - A start-only item whose start has passed is not current (that needs an end), not past (that needs an end) and not forward (its start has passed), so it disappears from Now.
   - The Free-time countdown also ignores deadlines. With "Return rental clubs, by 4:30 PM" 25 minutes out, the Focus read "2h 25m until next activity", counting to dinner (fixture screenshot, noted on #392).
8. **Each accent color means several different things:**
   - moss: planning accent, `Booked`, done, the checklist type, love, stay chips
   - clay: trip-mode accent, the meal type, pass, `Up next`, `Do this`
   - gold: the activity type, unplanned ideas, `Needs booking`, overlap
   - sky: the lodging and flight types, `Travel day`, planned (goal status), `Open ›` links
   - `design-system.md` assigns sky to "multi-day/ongoing", but the multi-day banner actually paints the mode accent.
9. **Type and subtype are restated as text on top of the glyph.** E3 adds a type tag. A, B and E1 give the subtype its own uppercase line. The detail header adds type and subtype pills.
10. **The multi-day banner is the heaviest element on its page.** It's a solid accent fill, yet it carries *background* context. On the fixture's Now page, two of these banners stack above everything else.
11. **Closeout and the Record view label every day one day early for viewers west of UTC (#393).** Their day-header formatters omit `timeZone: 'UTC'`. This isn't a card bug, but those headers sit directly above the cards (seen in the fixture: a trip starting Sat Sep 19 opens on "Friday, September 18").

*Screenshots:* `.visual/catalog/` (gitignored) holds full-page 375px shots of every surface, generated by `node .visual/catalog/catalog.mjs` from a seeded three-traveller fixture trip (disposable PocketBase on `:8097`). The published reference page (https://claude.ai/artifact/T9ZBZbLyYfcCB6fUNNMJqe, private to Scott) shows them cropped side by side.

---

## 3. Decision log

*(Filled in as decisions are made. Each entry gets the date, the decision, why, and what it supersedes.)*

### D1 — Four card shapes (Scott, 2026-10-03)

Every [[Item]] rendering is one of **four shapes**. Surfaces configure a shape; they don't invent one.

| Shape | Scott's words | What it is | Replaces (§1) |
|---|---|---|---|
| **Card** | "a main" | The standard shape: the full anatomy, at a consistent rhythm. The unit of a working list. | A, B (Coming up), Next 3 Days, E1–E5, G2 |
| **Hero** | "a larger hero" | The Card enlarged for the one item that *is* the moment: live status, codes and docs up front, larger type. | B (Now Focus), E6 (swipe face), H (detail header) |
| **Row** | "a smaller row" | One line: glyph, title, one trailing value (time, cost, status or route), plus an optional trailing action. For lists where the item is a reference. | C1, C2, E7, E8, E9, F1–F6, G1, G3 |
| **Span** | "an informational/span shape" | An item shown as **context rather than a step**: lower weight than a Card, never dragged. Today that means multi-day stays and rentals. | D (multi-day banner), D′ (stay chip) |

- **An item's lifecycle state marks a shape but doesn't change its layout.** The states are idea, pending, planned, live (past, now or next) and done.
- **One time grammar spans all four shapes** (§4.2), so #388's start-versus-end rule is solved once.
- **Each surface's verbs** (drag, pull up, `Do this`, check booked, Done/Swap/Skip, vote, approve) sit in one consistent action position per shape. That position is decided with the anatomy.
- **The only bespoke piece left is the swipe deck's gesture layer.** Its card face is a Hero.
- *Why:* 23 renderings had drifted into 23 different answers to the same questions (see §2: time, votes, avatars, glyph sizes). Four shapes give each question one answer.
- *Open within D1:* whether "informational" stretches beyond multi-day items, for example to the Now page's Free-time and Day-wrapped cards. That gets decided when the Span shape is designed.

---

## 4. Open questions (queue)

1. ~~**Do we need this many card types?**~~ Resolved by **D1**: four shapes.
2. **Time grammar (#388).** One way to show start, range, deadline and untimed, used on every surface. Start and end must stay distinguishable (Scott, 2026-10-01).
3. **Rail direction** for the timeline: the clock rail (A) or the stop rail (B), from the 2026-10-01 mockups.
4. **Card height.** Fixed, proportional to duration, or driven by content with a consistent minimum.
5. **What goes on the face versus the detail page**, per job.
6. **Text versus symbol versus color.** One vocabulary for type, status and mode.
