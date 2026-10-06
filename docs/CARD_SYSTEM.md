# Card System — how an Item renders everywhere

> **Status:** living design doc, started 2026-10-01. It began as #388 (the timeline card printing its time twice), and Scott widened it to **every surface that renders an [[Item]]**: the planning timeline, the trip-mode hero (Now Focus) and Now cards, multi-day banners, ideas, lens lists, closeout, and the record.
> **How to read it:** §1 is the as-built catalog, verified against the code at `840cd7b`. §2 lists what the catalog exposes. §3 is the decision log, filled in as decisions are made with Scott. §4 is the open-question queue.
> **Relationship to other docs:** `CARD_CONTENT_SPEC.md` stays the binding **field → slot** contract and is amended when a decision here ships. `CONTEXT.md` holds the terms.
> **How decisions get made (Scott, 2026-10-03):** a three-agent review panel stress-tests each proposal before Scott locks it. A **contrarian** attacks the proposal with concrete failure cases. An **alternative proposer** designs a rival from first principles. A **user advocate** checks travellers' needs, accessibility and conflicts with existing ADRs and spec rules. Each decision entry in §3 records what the panel changed.

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
   - The day page (E1) and the desktop rail (E2) render a sentiment pill, but the day loader never fetches votes for parking-lot items, so the pill never appears (#394, verified with the fixture. #394 was fixed on `main` 2026-10-02 in `98ef885`, and **D3** then moves votes off the day page entirely).
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
12. **The overlap warning never renders.** `TimelineItemCard` passes `border-l-2 border-gold` to `Card`, whose base `border border-line` wins, so the overlapping lunch card's edge is a plain hairline. Spotted by the alternative-proposer reviewer and confirmed on a zoomed crop of `day-T.png`. Superseded by D2's text overlap chip and D5's rail.

13. **Contrast and colour-blind audit (panel, 2026-10-06; ratios computed from the token hex values):**
    - **Below the AA minimums:**
      - the activity type glyph, gold on gold-tint, is **2.28:1** (icons need 3:1)
      - `Needs booking` text is **4.27:1** (text needs 4.5:1)
      - the CodeChip label is **1.91:1**
      - opacity-dimmed past rows reach only 2.1–2.4:1
      - an opacity-based "not going" bubble would reach 1.8–2.9:1
    - **Invisible against paper or surface:** every tint fill and every `/20`–`/30` border (1.00–1.37:1). Only a chip's or node's ink carries meaning.
    - **Colour-blind confusions** (Machado 2009 simulation, ΔE2000 < 8): error vs moss for protans (0.5), error vs clay for deutans (2.3), moss vs clay for protans (6.8). A red `Needs booking` would be identical to moss `Booked` for protans.
    - **Direct collisions:**
      - meal = trip accent = pass
      - activity = Needs booking = confirmation code
      - checklist = Booked = every avatar
      - Done is moss on one surface and sky on another
      - delete, over budget and form error are split between clay and error

14. **Item detail shows actions the server refuses (found by the D12 panel, verified 2026-10-06).** `Move` (`items/[itemId]/+page.svelte:83`) and `Delete` (`:417`) render for every role. `items.pb.js:182` allows Delete for owner/co_owner only, and the update gate allows Move for owner/co_owner/creator. The page only renders `uploadError` and `commentError`, so a traveler's or viewer's 403 **fails silently**. `Add checklist`, upload and the vote buttons also show to viewers. Separately, a successful Skip always runs `goto('/now')` (`:399`), even when you skip from Planning Mode before the trip.

*Screenshots:* `.visual/catalog/` (gitignored) holds full-page 375px shots of every surface, generated by `node .visual/catalog/catalog.mjs` from a seeded three-traveller fixture trip (disposable PocketBase on `:8097`). The published reference page (https://claude.ai/artifact/T9ZBZbLyYfcCB6fUNNMJqe, private to Scott) shows them cropped side by side.

---

## 3. Decision log

*(Filled in as decisions are made. Each entry gets the date, the decision, why, and what it supersedes.)*

> **Reading this log:** entries are history, and later decisions amend earlier ones (D9 refines D5's rail, D10 sets the colour and icon rules, D11 settles Row / Hero / Span). A line that a later decision overrides is marked *(⟶ …)* with what replaced it. The **resolved** rules, in one place, are the card system spec issue; implementers build from that, and use this log for the why.

### D1 — Four card shapes (Scott, 2026-10-03)

Every [[Item]] rendering is one of **four shapes**. Surfaces configure a shape; they don't invent one.

| Shape | Scott's words | What it is | Replaces (§1) |
|---|---|---|---|
| **Card** | "a main" | The standard shape: the full anatomy, at a consistent rhythm. The unit of a working list. | A, B (Coming up), Next 3 Days, E1–E5, G2 |
| **Hero** | "a larger hero" | The Card enlarged for the one item that *is* the moment: live status, codes and docs up front, larger type. | B (Now Focus), E6 (swipe face), H (detail header) |
| **Row** | "a smaller row" | One line: glyph, title, one trailing value (time, cost, status or route), plus an optional trailing action. *(⟶ D11: two lines, a headline and a sub-line)* For lists where the item is a reference. | C1, C2, E7, E8, E9, F1–F6, G1, G3 |
| **Span** | "an informational/span shape" | An item shown as **context rather than a step**: lower weight than a Card, never dragged. Today that means multi-day stays and rentals. | D (multi-day banner), D′ (stay chip) |

- *Later mapping changes (2026-10-06):* C1 "Earlier today" became soft-faded Cards on the rail (D10); E9 the Inbox card became the pending idea Card (D11); the Span icon is the 24px disc in the rail column (approved mock).
- **An item's lifecycle state marks a shape but doesn't change its layout.** The states are idea, pending, planned, live (past, now or next) and done.
- **One time grammar spans all four shapes** (§4.2), so #388's start-versus-end rule is solved once.
- **Each surface's verbs** (drag, pull up, `Do this`, check booked, Done/Swap/Skip, vote, approve) sit in one consistent action position per shape. That position is decided with the anatomy.
- **The only bespoke piece left is the swipe deck's gesture layer.** Its card face is a Hero.
- *Why:* 23 renderings had drifted into 23 different answers to the same questions (see §2: time, votes, avatars, glyph sizes). Four shapes give each question one answer.
- *Open within D1:* whether "informational" stretches beyond multi-day items, for example to the Now page's Free-time and Day-wrapped cards. That gets decided when the Span shape is designed.

### D2 — Main Card anatomy: head · meta · strip (Scott, 2026-10-03)

The main **Card** is built from these zones, top to bottom. Empty zones collapse.

| Zone | Rule |
|---|---|
| **Marker** | The type glyph, at the left. A timeline host may lift it onto the rail (decided with the time grammar, §4.2–4.3). |
| **Head** | The title (wraps to 2 lines max, then ellipsis) and **one** trailing value, chosen per job. |
| **Meta** | One line: the best "where" for the type. Location. Flight or transport shows the route (`MKE → DEN`, from `location_name` + the description's arrival label). A note shows the first line of its description. The record shows place · time. |
| **Strip** | *(`Needs booking` stays gold for now — Scott, 2026-10-06 — with darker text to clear 4.5:1. Moving it to the red error scheme is an option for the colour-vocabulary step.)* **Left = info and pills, exception-first:** `Needs booking` (loud), overlap warning, then quiet `✓ Booked`, documents count, `✓ Done`. *(⟶ D10: overlap comes first, then Needs booking)* **Right = people:** the [[Assignment]] people bubbles (and votes only where D3 allows them). |
| **Action** | Secondary verbs go in `⋯`. At most one primary action shows on the face. *(The exact position is still open.)* |

- **Heights** are 1, 2 or 3 rows (head / +meta / +strip), plus one line when a title wraps. Never more. The as-built loaded timeline card is 7 rows.
- **Off the face, detail only:** the subtype as text, the description (except notes and the record), free cancellation, the reservation link, payment state, goals, comments, checklist progress.
- **Time** is not printed on the card when the host has a rail. Where there's no rail (the record) it goes in meta.

Per-job subsets (*same places, different subsets*):

| | Plan (day page) | Live (trip mode) | Idea (phase planning) | Record |
|---|---|---|---|---|
| Head trailing value | cost | — **(no cost in trip mode — Scott)** | cost *(⟶ idea cards show cost in the sub-line, `Sheboygan · $40`, per the approved mocks)* | — |
| Strip: info and pills | Needs booking / ✓ Booked · docs · overlap | Needs booking (loud) · docs · overlap *(open: show the code instead of ✓ Booked?)* *(⟶ resolved below: a code chip upgrades ✓ Booked)* | — | ✓ Done / Considered *(⟶ the record shows no outcome stamp, below)* |
| Strip: people | **who's going (bubbles)** | **who's going (bubbles)** | votes (D3) | — |

*Panel review (2026-10-03: contrarian, alternative proposer, user advocate).* All three attacked "time off the card", and D5 answers that. These points are adopted into D2 as low-controversy rules:
- **A confirmation code upgrades `✓ Booked`; it never replaces it.** In trip mode a booked item shows its code as a chip (copy on tap, ADR-0016), plus `+n` when it has several. A booked item with no code still shows `✓ Booked`, so "booked" never looks like "nobody reserved it" (example: UA 1234 has no code).
- **Strip overflow rule.** At 375px the strip is about 232px wide. The left side keeps priority order: `Needs booking` > `Overlaps …` > code / `✓ Booked` > docs count. When it overflows, the lowest-priority item shrinks to its icon, then drops. The right side shows at most 3 bubbles, then `+n`.
- **Overlap is always text** (`Overlaps tee time`), never colour alone. The as-built gold edge never even renders (see §2.12).
- **The `⋯` menu appears only on jobs that have secondary verbs** (Live: Skip, owner/co_owner). It sits top right, where Live has no trailing value, so it never collides with cost. Plan cards carry no `⋯`: tap opens the item, long-press drags.
- **Pending gets a review tray**, an expansion below the card holding the vote buttons and Approve/Reject. It is exempt from the one-primary-action rule.
- **Record shows no outcome stamp**, because every archived item is done (`archive-view.ts:69`). It shows the **full** description, since public archive rows don't link anywhere.
- **Accessibility requirements:**
  - state chips meet 4.5:1 contrast (as built, `Needs booking` gold-deep on gold-tint measures about 4.27:1 at 10.5px)
  - nested controls get 44px hit areas
  - the card's accessible name carries time + title + type + state (for example "6:30 to 8:30 PM, Dinner at The Immigrant, meal, needs booking")
- **Meta for flights:** the route is `location_name` plus the description's `→` arrival label written by FlightLookup. Transport has no destination field, so it shows its location only. The arrival *time* is the rail's end label.
- **Flight title and place line (Scott, 2026-10-06):** a flight's title defaults to **`Flight to Denver`** (the destination city; the airport code when the city is unknown). The flight number and route share the place line: **`UA 1234 · MKE → DEN`**. This changes the default title the flight lookup writes, not just the card. On a Row where the sub-line overflows, the arrival time drops first, so the route survives.

- **Drag works one way everywhere (Scott, 2026-10-06):** long-press the whole card, on every list. The parking lot's grip handles are retired.
- **Joining ("I'm going") happens by tapping into the card (Scott, 2026-10-03).** There's no per-card button. Expect the item view to make it more obvious later.
- *Open:* a traveller's primary action on idea cards (owners pull up; travellers can't), deferred to #401.

### D3 — Votes live in phase planning, not on the day page (Scott, 2026-10-03; amended 2026-10-06)

Votes belong where ideas are **weighed and moved**: a phase-focused planning context built around the phase's [[Parking Lot]]. The day page (overview/day planning) shows **no votes**, neither on planned cards nor on its parking-lot cards; its people slot is the who's-going bubbles. *(⟶ amended 2026-10-06, below: the day page's parking-lot ideas show tap-to-vote pills; planned cards still show none)*

- *Supersedes:* ADR-0011's "vote count pill on planned and parking-lot cards" (amended in ADR-0011, 2026-10-03). Note the collision: **#394 was fixed on `main` on 2026-10-02 (`98ef885`, PR #398) by *adding* votes to the day-page parking lot and desktop rail.** D3 reverses that. When the card system ships, day-page parking cards drop the vote pill and the phase's idea cards gain it (today's Phase Detail parking cards, E3, show no votes).
- *Seeded a product direction:* a **phase planning mode**, a focused workspace for weighing a phase's ideas and moving them into days. That is bigger than cards and is captured as its own issue (#401). It connects to #391 (getting into a phase).
- *Open:* trip mode's "Ideas for now" strip (E4), where votes help pick a backup on the day. *(⟶ mocked with vote pills, phone and desktop; awaiting Scott, §4.9)*
- **Amendment (Scott, 2026-10-06):** idea cards in the **day page's parking lot** and the **desktop Ideas panel** may show votes too, as an add-on for **unplanned** items, so you can tell which idea is the favourite. Planned cards still show none. **Form (Scott, 2026-10-06): tap-to-vote pills under the sub-line** (the Closeout pill structure). One pill per sentiment, **all four** (love / like / flexible / pass, matching the data model and `VoteButtons`), each with its count. The viewer's own vote is filled, and tapping toggles it. **Ideas sort by votes within each type group**, using the existing `sortByVoteScore` (weights 2 / 1 / 0 / −2, ties by `sort_order`). The cost: idea cards are about 30px taller.
  - **Drag only plans (Scott, 2026-10-06):** votes set the order, so dragging within the ideas list does nothing; a card dropped back among ideas resolves to its vote position. Drag is "put this on a day" only. `sort_order` survives only as the tie-break.
  - **Approved on the before/after page (Scott, 2026-10-06):** the categorized idea list, "really love" it. Phase planning ideas and the pending review tray: "no notes".

### D4 — Assignment means "who's going" (Scott, 2026-10-03)

The `assigned_to` people are **who is going on or doing the item**. That's all. It does not mean who books it, pays, organizes, or "is responsible". It is shown as people bubbles **when planning a day and in trip mode**.

- *Supersedes:* the glossary's earlier "doing / responsible for" wording. ADR-0011 is amended to match.
- **Copy (decided, Scott 2026-10-03):** the surfaced label becomes **"Going"**, replacing "Assigned to" on item detail and in the form. Self-assign reads as "I'm going". The field stays `assigned_to`; only the words change.

### D7 — The type symbol lives on the rail; off the rail, type becomes a group heading (Scott, 2026-10-03)

- **On rail-hosted lists** (planning day, trip-mode Coming up), the type glyph is a **node on the spine, centred vertically on its card.** It takes the place of the old hollow dot. It is **filled** (type tint) *(⟶ D10: monochrome, ink-soft glyph on surface-2)* for timed items and **dashed** for untimed ones, so "pinned vs flexible" survives. The card's text starts at its left edge; nothing pushes it right.
- **Bigger glyph, same footprint:** the node grows only slightly (about 26px). The glyph fills most of it (about 17px) *(⟶ D9: a 24px disc with a 16px glyph)* instead of floating in padding. "Use the space of the icon for the icon."
- The nodes break up the spine line, which Scott found made the vertical line read better than the bare hairline did.
- **Off the rail** (the parking lot / phase planning ideas), the card carries **no** glyph. The list is **grouped by type**, and each group has a divider with the icon and a plain-language label ("Places to eat", "Things to do", …). *(⟶ the type names, next bullet: Activities, Meals…)*
- *Supersedes:* the 32px in-card `TypeIcon` on the timeline card and the type tag on Phase Detail parking cards (E3).
- **Group headings use the type names (Scott, 2026-10-06), not translations:** Meals, not "Places to eat". They are the plural type labels Trip Documents already groups by: Lodging · Flights · Transportation · Activities · Meals · Notes.
- *Open within D7:* the sort order within a group (votes lead in phase planning, D3, #401). *(⟶ resolved by the D3 amendment: by votes wherever ideas show)*

### D8 — Card height follows content, never duration (Scott, 2026-10-06)

- A card is 1, 2 or 3 rows (head / +meta / +strip), plus one line when the title wraps. A card with both a start and an end has a minimum height that fits both rail labels (about 46–50px) *(⟶ D9: about 62px)*. Duration never stretches a card.
- *Panel (2026-10-03):* both reviewers rejected duration scaling, including the one assigned to argue for it. Scaling would size only 3 of the fixture's 9 cards (content height swamps the scale below about 1.5h), and two 45-minute meals would render at different heights. Untimed, start-only and deadline items have no duration, so every list would mix two systems. Gaps between cards aren't scaled, so it gives "calendar looks without calendar meaning". It adds about 19% scroll and pushes the next item below the fold in trip mode. And the drafting precedent cuts against it: "do not scale drawing" — the dimension text governs.
- *Accepted 2026-10-06 (see D9, text label only, no line):* a **free-time marker** on the rail. When the gap between a *known* end (an end time or a `by` deadline) and the next timed start is ≥ 60 minutes, draw a dashed rail segment *(⟶ D9: text label only, no line)* labelled `2h free · 4:30p to 6:30p`. It is not a card, can't be dragged and has no tap target. A start-only item creates no gap. Screen readers hear "Free, 4:30p to 6:30p".

### D11 — Row, Span and Hero designs (2026-10-06)

**Row (Scott's revision):** every Row has **two lines**.
- **Icon on the left:** a 16px bare glyph.
- **Headline:** the title.
- **Sub-line:** the time and the place (or date).
- **Trailing slot:** one value or action (a chip, a cost, a chevron, people bubbles).
- **Leading action** (the booking list's checkbox) sits to the **left of the icon** and shifts the row right. That's accepted.
- **Closeout:** its `Done` / `Swap` / `Skip` pills sit **under the sub-line, inside the row**, making that row taller. **All three are the same bordered pill (Scott, 2026-10-06):** Skip is not styled differently.
- **Goal rows** sit under the heading **Linked items** (Scott, 2026-10-06; was "Items addressing it"), matching the glossary's *linked*. Status is a word in the sub-line (`Idea · Phase 1`, `Planned · Thu Oct 1 · 6:30p`), with no coloured pills.

**Time on shapes without a rail (text form of the D5 grammar):**

| Shape | Text |
|---|---|
| Start only | `9:30p` |
| Start and end | `10:00a–12:00p` |
| Deadline | `by 4:30p` |
| Untimed | Omitted |

Flights write departure → arrival (`2:05p → 4:20p`). **In text, an end time never appears on its own without `by`.** Text has no top or bottom edge to carry the meaning, so `by` stays here even though the rail dropped it (2026-10-06). On the booking list, the date is prefixed (`Thu Oct 1 · 6:30p`).

**Span, day by day** (approved by Scott, 2026-10-06, "no notes"):
- A stay reads `Check-in 3:00p · 3 nights` on the first day, then `Night 2 of 3 · check-out Sat by 11:00a`, then `Check-out by 11:00a`.
- A rental car reads `Pick up 10:00a`, then `Day 2 of 5 · return Sun by 12:00p`, then `Return by 12:00p`.
- Check-out and return are deadlines, so they use `by`.

**Hero** (the Now Focus). *Scott, 2026-10-06: the title comes first, top-down. The 40px type icon sits **upper left, beside the title**. Then the place, then the `NOW · until 4:00p · 55m left` line, then the codes, then booked and going.*
- **Mid-event:**
  - a 40px node filled with the accent, then `NOW` and `until 4:00p · 55m left` (live, the end time matters most)
  - a large title, the place plus address
  - codes as large tap-to-copy rows
  - `✓ Booked`, who's going **with names**, and `⋯` (Skip)
- **Free time (Scott, 2026-10-06, keeping the old card's look):** centred, with the time as the focus: `FREE TIME`, then a large `25m`, then `until Return rental clubs` (the next item by name). It counts down to the next timed thing **including deadlines**, which fixes the countdown half of #392. No second line about later free time; the rail's free-time label already says it.

**Several Heroes when several items are ongoing (Scott asked for it 2026-10-06; rules PROPOSED, awaiting Scott).** Scott: check "we have the option of having multiple hero cards in trip mode if we have multiple ongoing items with different people." As built, Now keeps only the ongoing item that ends last and drops the others from the page entirely (`findCurrentItem`, verified 2026-10-06). Proposed rules, drawn on the before/after page:
- Every [[Ongoing]] item gets a Hero, the full Hero (clay border, filled icon, `NOW` line, codes, Going with names).
- **Yours first:** items the viewer is going to, then everyone else's; by start time within each group.
- Heroes don't repeat the neutral `Overlaps …` note between themselves, because stacking already says "at the same time". A red conflict (the same people on both) still shows.
- The free-time card shows only when nothing is ongoing for anyone.
- *Glossary impact:* [[Focus]] is defined as "the single emphasised block"; with this it can hold several Heroes.

**Swipe face = Hero, details shown by default (Scott, 2026-10-06).** The 40px icon beside the Fraunces title; place and cost; then the date and time when it has them, or **`Unplanned`** when it has none; then the description; then `Added by Kim` on its own line; then, below a divider and centred, `Others' votes hidden until you vote`. *(Scott, 2026-10-06: keep those two apart.)* No `Details` tap, no `Planned` / `Idea` pill, no "not on a day yet".

**Inbox suggestion (Scott, 2026-10-06).** The pending idea card, with **Approve / Edit / Reject** on the outside. **Edit** opens the item, and its actions inside are **Reject / Save / Approve**. Save keeps the edits and leaves it pending. The `TRAVELER` role badge goes.

### D12 — Item detail, the full page (2026-10-06: partly approved — see the status line)

*Status (2026-10-06):* **approved by Scott:** "Are you going?" ("that's good"), no job dock, planned items stay in the swipe quiz with a quiet vote row, and Mark booked going to the existing Add expense. **Not yet explicitly approved:** a visible Edit with a role-filtered `⋯`, the Hero as the venue kit (place line opens Maps, codes, documents, live line), the Details card, empty sections shrinking to one line, the comment box first, the type and subtype in words, and trip mode's "Plan details" plus Log payment under the Hero.

Scott: the detail page "might deserve a bit more review". A panel (contrarian, alternative proposer, user advocate) reviewed a first draft, and this is where they agreed. It is drawn in three states on the before/after page: planned in planning mode with needs booking, trip mode mid-event, and an unplanned idea.

- **NavBar:** back · trip name · **Edit** (visible, the most-used verb) · `⋯`. `⋯` holds Move, Skip… and Delete, **each shown only to roles the server allows**: owner/co_owner get all three, the creator gets Move, everyone else gets no `⋯` and no Edit. Skip confirms in a sheet that keeps "Nothing is deleted". The NavBar drops the item title, because the Hero shows it.
- **Hero = the venue kit:**
  - the icon beside the title, then the type and subtype in words (`Meal · Fine dining`; this keeps subtype, which finding 9's pill removal would otherwise lose)
  - the **place line is the Maps link**, then the time line in text grammar
  - in trip mode during the item: the `NOW · until …` line, a clay border and a filled icon (D10)
  - codes as large, arm's-length mono rows, tap to copy
  - **documents as rows under the codes**
  - Going
- **Needs booking is a button** (owner/co_owner/creator): `Needs booking · Book ↗ · Mark booked`. Mark booked opens a sheet with an optional code and a **"Log what I paid next"** checkbox. After Save, that opens the **existing Add expense** (#228's prefilled form: amount from the estimate, you as payer, the usual split, all editable), **not** a cut-down inline expense. *(Scott, 2026-10-06: an inline version would have allowed only even splits.)* Booked and paid stay separate (ADR-0014). Booking drops from about 8 taps to about 4, with no trip through the Edit form.
- **Going is a question until you answer:** "Are you going? Going · Not going", then "You're going · change". Others' bubbles have names. "Not going" waits on #402's migration.
- **Votes or Going, never both.** An idea shows your four vote pills plus who voted what, and an **Add to a day** primary button. A planned item shows Going.
- **Body:** description, then one **Details** label/value card (cost estimate, Log payment / Paid $X as its own row that never depends on an estimate, booking link, cancellation, phase), then Goals if linked. Empty Documents and Checklist shrink to one `+ Document · + Checklist` line. Comments come next, with the composer **above** the newest-first list.
- **Trip mode** reorders for use, not planning: Log payment sits under the Hero once the item has started; Details collapses to "Plan details".
- **Rejected (Scott, 2026-10-06):** the proposer's sticky **job dock** (a bottom bar with Going / Comment / Edit, or Directions / Copy code / Going, replacing the tab bar). The Hero already puts those verbs at zero scroll.
- **Planned items stay in the swipe quiz (Scott, 2026-10-06).** So a planned item can carry votes. Its detail page shows one quiet Details row, `Your vote: Love · change` (tap to open the four pills), and never the vote pills on the face. Cards still show no votes on planned items (D3).
- **Desktop:** see D13.

### D13 — Desktop (approved by Scott 2026-10-06: "no notes")

Drawn at true 1280px on the before/after page: the day page while dragging an idea, Now, and item detail. *Follow-up on the back burner: desktop card variants that use the extra width (#417).* AppShell already has three widths: phones below 900px; a 72px icon rail plus content from 900px; and from 1280px, a 240px side rail, a 720px content column and a 320px context rail.

- **One card, any width.** No desktop-only card layout. Cards stretch to the content column (about 610px beside the 48px rail) and keep D2's rows and D8's heights.
- **Ideas live in the context rail at ≥1280px** (as built), now grouped by type, sorted by votes and carrying the vote pills (D3). Below 1280px they stay under the timeline, as on phones.
- **Drag with the mouse, straight away.** The long-press exists only to separate drag from scroll on touch. A mouse press-and-move lifts the card immediately. Valid drops (a free gap, a slot) highlight in the planning accent: `Drop to plan · 2h free · 4:30p to 6:30p`. The keyboard path is the item's "Add to a day".
- **The context rail's Up next becomes mini day cards:** the date, the day title, the item count and any `1 needs booking`. As built, it repeats "Phase 1" for every day.
- **Hover adds speed, never facts.** A card lifts on hover. A vote pill's tooltip lists who voted, which is also shown on the item page. Nothing exists only on hover.
- **Item detail splits into two columns** in the content column: the Hero, description, Details and Goals on the left; `+ Document · + Checklist` and Comments (composer first) on the right. Each column is about a phone's width.
- **Now in trip mode:** the same Hero and rail in the content column; Ideas for now and tomorrow's rows in the context rail.
- **Group order everywhere** follows D7's type order (Lodging · Flights · Transportation · Activities · Meals · Notes). The earlier phone mocks had Meals first; fixed 2026-10-06.

### D10 — Colour means "act on this"; type icons are monochrome (Scott, 2026-10-06)

**Rule:** on an item, colour only ever means *act on this*. **Gold** marks an open loop (needs booking, pending). **Red** (`error`) marks a real conflict. The **mode accent** (moss in planning, clay in trip mode) means "now / your move". Everything else — type, settled states, people, votes — is **ink**, told apart by glyph and word, never by colour alone. *Evidence: finding §2.13, the contrast and colour-blind audit.*

| Meaning | Treatment |
|---|---|
| Type icon (rail node, Row, heading) | **Monochrome:** ink-soft glyph on surface-2 with a `line` ring; dashed when untimed. *(Scott: "the monochrome logos are great".)* |
| Now (trip mode) | The Hero: **icon filled** with the accent, a **clay border on the card** (Scott, 2026-10-06), and the `NOW · until 4:00p · 55m left` line |
| Next (trip mode) | **No accent (Scott, 2026-10-06, reversing the outlined node):** the next card looks like every other Coming up card. Being first in Coming up is the signal. |
| Needs booking | Gold chip. `gold-deep` is retuned `#8a6f24 → #745a1c` (5.81:1 on gold-tint, 6.52:1 on white). It stays gold, not red: red would match moss Booked for protans, and lodging, flight and transport are pre-flagged as needing booking, so red would fire on every new booking. |
| Pending suggestion | Gold `Pending` chip + dashed card |
| Overlap | **Both items carry it (Scott, 2026-10-06):** the tee time says `Overlaps lunch` and lunch says `Overlaps tee time`. Red text with an icon, and on the rail **both colliding times** turn red: the earlier item's end and the later item's start. **Red only when the same people are going to both** (Scott). It outranks Needs booking in the strip (D2 priority amended). |
| Booked / with code | Quiet ink `✓ Booked`. Trip mode shows an ink, mono code chip (tap to copy, `+n` for several). |
| Documents, Done, Considered, Free time | Ink / ink-muted, with icon + word |
| Going / not going | Neutral initials bubble (the moss avatar fallback is retired). Not going = a diagonal strike, **no opacity**; the letter stays ≥4.5:1. Its accessible name is "Kevin, not going". |
| Votes (unplanned ideas only, D3) | Tap-to-vote pills with icon + count: heart, thumb-up, flexible, thumb-down, in a fixed order. All four always show, because they are the buttons. The accessible name is "2 love, 1 pass, your vote love". No score. |
| Span (multi-day) | A neutral surface-2 band, never a solid accent fill (fixes §2.10) |

- **Today in planning (Scott, 2026-10-06):** the overview's day card for today gets a **moss outline** instead of a `TODAY` pill. The day card's date block is centred vertically on the card. Its `1 needs booking` gold pill is approved as is.
- **Collisions retired:** moss keeps only the planning accent; clay keeps only the trip accent (plus primary actions like `Do this`); gold keeps only open loops; sky leaves item cards (info banners and links only).
- **Icon size scale, from 11 sizes to 3:** a 16px bare glyph (Row, Span *(⟶ the approved Span mock uses the 24px disc, in line with the rail nodes)*, group heading); 16px in a 24px disc (rail node); 26px in a 40px disc (Hero). State icons are 1em of their text.
- **Overlap with nobody shared** (or nobody has said who's going yet): a plain **ink** `Overlaps tee time` note. It is informational, not a conflict, and red is reserved for shared people. *(Claude's call 2026-10-06 when Scott left it open; reversible.)*
- **Earlier today = soft fade (Scott, 2026-10-06):** past items keep the full Card shape but **without the white fill**, in ink-muted text (5.4:1 on paper, never opacity), with a lighter rail rule and an outlined node. They stay tappable, so you can find the code or address you just used.
- **Span = full-width band (Scott, 2026-10-06):** all-day and multi-day items sit **outside the timeline**, with a border spanning the full width. The icon sits **in the rail column, in line with the rail nodes**, and the title lines up with the card titles. The band is a neutral surface-2 fill.

### D9 — Rail geometry: a centred time · icon · time column (Scott, 2026-10-06)

This refines D5 and D7. The rail becomes a **narrow centred column per card** (gutter about 56px, down from about 70px, so cards gain about 14px):

| Shape | Column |
|---|---|
| Start and end | Start label centred at the top, end label centred at the bottom, a line segment **between the two times**, and the type icon in the middle of the segment |
| Start only | Start label at the top; the segment runs down to the icon |
| Deadline (end only) | The icon, then the segment down to a plain `4:30p` at the bottom. **No `by` on the rail (Scott, 2026-10-06):** sitting alone at the card's bottom edge already says "ends", and the prefix was clutter. The segment and leader work the same as for any end time. |
| Untimed | The icon alone, dashed, centred on the card |

- **Leaders (Scott, 2026-10-06): a rule *across* the time, level with the card edge.** The start rule runs over the start label along the card's top edge. The end rule runs under the end label (or `by` label *(⟶ the rail dropped `by` on 2026-10-06)*) along the bottom edge. Each spans from the column's left edge to the card.
- **Spacing is a spec, not eyeballed (Scott: "enough margin around the time text and all lines"):**
  - 5px from each rule to its time text
  - 4px from the text to the line segment
  - 4px from the segment to the icon disc
  - icon disc 24px with a 16px glyph
  - column 48px, then 8px to the card
  - at least 3px side padding around each label
  - Where a card is too short for a segment to be at least 6px, the segment is dropped and only the labels and icon render.
- **Consequence for D8:** a card with a time label has a **minimum height of about 62px** (5 + 11 + 4 + 4 + 24 + 4 + 4 + 11 + 5 − overlap), so the labels, segment and icon never crowd. A typical 2-row card is about 56px naturally, so timed 2-row cards grow slightly. Untimed cards keep their content height.
- **No line between cards.** The old continuous spine is gone, and so is the dotted "journey" connector.
- **Time-slot dividers (Scott, 2026-10-06):** Morning / Afternoon / Evening sit **centred on the screen with a rule on either side**. They are not indented to the card column, which aligned them with nothing.
- **Free time (accepted):** when there are ≥ 60 minutes between a known end and the next start, the gap shows a **text label only**, `2h free · 4:30p to 6:30p`. It has no line, no card and no tap target. Screen readers hear it as a separator. This closes D8's proposal.
- *Supersedes:* D5's left-hand time labels and the continuous spine. D5's grammar stands: time only in the rail, start up top, end at the bottom, `6:30p`. *(Amended 2026-10-06: the rail drops `by`; see the Deadline row.)*

### D6 — "Going" has three states; dissent shows as "not going", not as votes (Scott, 2026-10-03)

The panel wanted a vote-based "Pass" marker on planned cards. Scott reframed it: on a committed item, the question isn't whether someone likes it but **whether they're going**. Participation has **three states**:

| State | Shown on the card? |
|---|---|
| **Going** | Yes: their bubble, in colour *(⟶ D10: a neutral initials bubble)* |
| **Not going** (said so) | Yes: their bubble greyed and struck through, after the going bubbles *(⟶ D10: struck through, no grey or opacity; the letter stays ≥ 4.5:1)* |
| **No answer** | No. "I don't want to know if someone hasn't responded" |

- D3 stands: votes stay off the day page. *(⟶ D3 amended 2026-10-06: unplanned ideas show votes; planned cards still don't)* Dissent on planned items is a participation fact, not a sentiment.
- *Data implication:* `assigned_to` (a list of who's going) can't express "not going". This needs a new stored state, an append-only migration, and a way to say it (inside the item, per D2's tap-into-the-card rule). Captured as its own issue (#402).

### D5 — The rail owns time: start at the card's top edge, end at its bottom edge (Scott, 2026-10-03)

On any list hosted by the [[Timeline Rail]], **time is printed only in the rail, never on the card.** Where each time sits says what it means:

| Shape | Rail |
|---|---|
| Start only | Start label at the card's **top edge**, with a short leader line level with the top border |
| Start and end | Start at the top edge, end at the **bottom edge**, both with leaders. The spine between them is drawn heavier, as a duration bar, so the card is bracketed like a dimension line. *(⟶ no duration bar, below; D9's per-card segments)* |
| Deadline (end only, #346) | **Bottom edge only**, labelled `by 4:30 PM` *(⟶ D9 2026-10-06: a plain `4:30p`, no `by`)* |
| Untimed | No time. A hollow dot (the 09-17 rule stands). *(⟶ D7/D10: a dashed type icon, centred on the card)* |
| Overlap | Falls out of the grammar: the earlier card's end label (`1:30 PM`) sits *above* the next card's start label (`1:00 PM`). The late start is also tinted, and the card carries an `Overlaps …` strip chip. *(⟶ D10: both items carry it; both colliding times turn red, only when people are shared)* |

- **Labels sit inside the card's vertical extent:** start just below the top leader, end just above the bottom one, so adjacent cards' labels never collide. Times are single-line (`12:30 PM`), so the gutter grows from 44px to about 66px. A card with both a start and an end gets a minimum height that fits both labels (about 46px) *(⟶ D9: a 48px column plus 8px, and about 62px minimum)*, which constrains §4.4.
- **The type glyph stays in the card.** *(⟶ reversed by D7: the icon is the rail node)* The 2026-10-01 "stop rail" option (B, glyph on the spine) is retired, because the gutter now holds top and bottom labels. The rail direction resolves to the clock rail (A) plus leader lines.
- *Resolves #388:* the card no longer repeats the time. Start, end and deadline stay distinguishable by position (an end-only time sits alone at the bottom edge; the rail's `by` prefix was dropped 2026-10-06). This also answers the contrarian's main objection to D2 (end times and deadlines disappearing): the rail now carries them.
- **Revised after the first mockup (Scott, 2026-10-03):**
  - **No duration bar.** The thick spine segment is gone and the spine stays a hairline.
  - **The leaders extend left across the time column,** so a rule sits *on top of* the start label (level with the card's top edge) and *under* the end label (level with its bottom edge). It reads like a dimension line.
  - **The untimed dot is centred vertically on its card.**
- **Trip mode is rail-hosted too (Scott, 2026-10-03).** The Coming up list uses the same rail and the same grammar. The Hero (Now Focus) keeps its own live line, for example "until 4:00 PM · 55m left".
- **Time format (Scott, 2026-10-03): `6:30p` / `10:30a`.** The colon stays; the space and the "m" go. A deadline reads `by 4:30p` **in text** (Rows, Hero, Span). On the rail it is a plain bottom label (D9, 2026-10-06).
- *Open within D5:* the time grammar for Row, Hero and Span. *(⟶ resolved by D11)*

---

## 4. Open questions (queue)

1. ~~**Do we need this many card types?**~~ Resolved by **D1**: four shapes.
2. ~~**Time grammar (#388).**~~ Resolved by **D5** (rail-hosted cards) and **D11** (Row, Hero and Span text grammar). Start and end stay distinguishable everywhere (Scott, 2026-10-01).
3. ~~**Rail direction**~~ Resolved by D5 and D9: the clock rail with leader lines. The icon moved onto the rail in **D7**.
4. ~~**Card height.**~~ Resolved by **D8**: content-driven, never duration.
5. ~~**What goes on the face versus the detail page**, per job.~~ Resolved by **D2** (Card), **D11** (Row, Span, Hero) and D3 (votes only on ideas).
6. ~~**Text versus symbol versus color.**~~ Resolved by **D10**.
7. **Proposed defaults from the before/after page (2026-10-06)** *(⟶ the bullets below are the original proposals; the swipe, inbox and detail-header ones were superseded by D11 and D12, and the desktop Ideas panel by D13's approval)*. Scott's review the same day: phase planning ideas and pending, **approved**; overview day cards, approved with amendments (D10); swipe, inbox and goal rows, amended (D11); detail header, **expanded to the full page, D12**. No comment yet on: the record on the rail, the empty day, the desktop Ideas panel, codes losing gold.
   - Phase planning idea cards: grouped by type, sorted by votes, tap-to-vote pills. A pending suggestion is the same card, dashed, with an Approve / Reject tray.
   - The record (What we did) uses the rail, read-only, with full descriptions (no Done stamp, per D2).
   - The item detail header is a Hero: the icon beside the title, then the place, the time in text form, Booked / Going, then the code rows. The type and subtype pills go (finding 9). **Vote buttons show only while the item is an idea.**
   - Overview day cards: the stay line moves to neutral ink (it is not something to act on). "2/3 booked" becomes the open loop itself, "1 needs booking", in gold. TODAY stays accent as an outline.
   - Empty day: a dashed panel saying "Nothing planned. Add something, or drag an idea here." with + Add item. The day card reads "Nothing planned yet".
   - The desktop Ideas panel matches the day page parking lot: grouped by type, vote pills, sorted by votes.
   - The swipe face (E6) is a Hero: the 40px icon beside a Fraunces title, then place and cost, then the status in words ("Idea · not on a day yet · added by Kim"). The green Planned pill goes.
   - Inbox suggestion (E9) is the pending idea card with an Approve / Edit & approve / Reject tray. The TRAVELER role badge goes, because "Suggested by Jess" already says who.
   - Confirmation codes (Docs, F4) are Rows with the code in mono in the sub-line and a copy action. No gold: a code is a closed loop, not an open one. The tinted type circles go (D10).
   - Goal rows (F5) say "Idea · Phase 1" or "Planned · Thu Oct 1 · 6:30p" in words. The gold Unplanned and blue Planned pills go.
8. **#392's two remaining product calls** (its third, "does an imminent deadline count as next?", is answered by D11: yes):
   - A start-only item after its start (`Lunch 1:00p` at 1:15p): ongoing until the next timed item starts (a Hero, `NOW · since 1:00p`), or straight to Earlier today? *Recommended: ongoing until the next timed item starts.*
   - A deadline after its time: Earlier today (past), or an "overdue" state? *Recommended: past. Trip mode can't mark things done, and red is reserved for shared-people conflicts.*
9. **Mock vs decision log, to confirm:** D2 gives Live cards a `⋯` (Skip, owner/co_owner); the Coming up mocks drew none. D3 left trip mode's Ideas for now open; the mocks drew it grouped by type with vote pills.
