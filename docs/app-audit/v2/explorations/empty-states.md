# Empty States & First-Run Audit — v2 Exploration

> Auditor: empty-state / first-run lens (charter #116, v2 wave).
> Scope: every zero-data branch in `src/routes/**/+page.svelte` plus the shared components those
> pages delegate their primary lists to (`DayTimeline`, `TodayTimeline`, `DocumentSection`,
> `ChecklistBody`, `NotificationBell`, Now sub-components).
> Method: grep for `length === 0` / `{:else}` / "No … yet" copy → read each branch in context →
> verify CTAs and reachability in code. Backlog/PRD-deferred checked before flagging
> (SPEC_BACKLOG.md, TRIP_REPLANNING_PRD.md, charter D1–D6). All severities use the charter bar.

---

## 1. The app's empty-state voice (baseline, from the good ones)

Waypoint already has a recognizable empty-state grammar:

- **Headline:** short declarative, display font, italic — `No trips yet.` / `No documents yet.` / `A blank itinerary.`
- **Subline:** muted, one sentence, does one of two jobs:
  - *teach what belongs here* — "Boarding passes, tickets, and confirmations land here."
  - *invite the next act* — "Plan your first one." / "What does everyone want out of this trip?"
- **CTA:** either a real button in the empty block (trips list), an always-rendered dashed add-row
  below it (lists, goals), or copy pointing at persistent chrome ("Tap + to log your first expense.").

**Gold standards found (use as templates, no action needed):**

| Surface | file:line | Why it works |
|---|---|---|
| Trips list | `(app)/trips/+page.svelte:49-61` | Teach + primary CTA + secondary (import). The front-door empty done right. |
| Day timeline (planning) | `lib/itinerary/components/DayTimeline.svelte:67-74` | The empty row *is* the CTA (links to `items/new?day=`), and it teaches both input methods: "Empty. Tap to add one — or drag an idea here." |
| Swipe drain | `(app)/trips/[slug]/swipe/[phaseId]/+page.svelte:79-98` | Drain-to-empty with three onward doors: next phase, phase parking lot, back to phases. Never strands the user. |
| Phase parking lot | `phases/[phaseId]/+page.svelte:227-229` | Teaches the domain term in passing: "No ideas yet. Add one to start a parking lot for this phase." |
| Item checklist (absent) | `items/[itemId]/+page.svelte:232-241` | "Track packing, groceries, or to-dos for this item." + Add button. Teaches the feature's job before asking for the click. |
| ChecklistBody dual state | `lib/itinerary/components/ChecklistBody.svelte:80-82` | Distinguishes never-filled ("Nothing on this list.") from drained ("All done — nothing left to show."). The only place in the app that makes this distinction — see ES-2 for where it's missing. |
| Goal detail, links | `goals/[goalId]/+page.svelte:143-149, 223-226` | Teaches the derived-status mechanic ("Link an item and this goal starts tracking it") and has a true drained state ("Every plan on this trip is already attached."). |
| Doc section on item | `lib/documents/components/DocumentSection.svelte:54-64` | Teach-what + uploader directly below. |
| Claim queue, zero claims | `(app)/claim/+page.server.ts:27-38` | Correctly never renders an empty page — server redirects. |

---

## 2. Full inventory — every zero-data branch

Verdict key: **GOOD** (teaches + actionable) · **OK** (acceptable, context makes it harmless) ·
**WEAK** (finding below) · **CITED** (intentional or covered by an open PRD/issue — not a finding).

| # | Page / surface | file:line | Empty copy | CTA present? | Verdict |
|---|---|---|---|---|---|
| 1 | `/trips` | `trips/+page.svelte:49-61` | "No trips yet. / Plan your first one." | New trip btn + import link | GOOD |
| 2 | `/trips/[slug]` blank-itinerary card | `[slug]/+page.svelte:208-228` | "A blank itinerary. / Start by adding a phase or scheduling something." | "Add a phase"; "Add a day item" (dead, see ES-1) | WEAK — **unreachable** (ES-1) |
| 3 | `/trips/[slug]` flat day list (phases=0, days>0) — the *real* first-run | `[slug]/+page.svelte:193-207` + `DayCard.svelte:32` | Rows of "Nothing planned yet" day cards | none on the page itself | WEAK (ES-1) |
| 4 | `/trips/[slug]/phases` | `phases/+page.svelte:161-170` | "No phases yet. / Group days by city, leg, or whatever fits." | "Add phase" button in header (`:73-74`) | GOOD |
| 5 | Phase detail — parking lot | `phases/[phaseId]/+page.svelte:227-229` | "No ideas yet. Add one to start a parking lot for this phase." | Add-idea toggle above | GOOD |
| 6 | Phase detail — days | `phases/[phaseId]/+page.svelte:239-240` | "No days fall within this phase's date range." | none | WEAK-minor (ES-10) |
| 7 | Day view — notes | `days/[dayId]/+page.svelte:119-121` | "No notes for this day." | edit affordance adjacent | OK (field-level) |
| 8 | Day view — timeline | `DayTimeline.svelte:67-74` | "Empty. Tap to add one — or drag an idea here." | the row itself links to `items/new` | GOOD |
| 9 | `/goals` (contributor) | `goals/+page.svelte:143-147` | "No goals yet. What does everyone want out of this trip?" | capture-wizard banner (`:74-87`) + dashed Add (`:126-141`) | GOOD |
| 10 | `/goals` (viewer role) | same, gated by `canAdd` (`:37`) | same question, zero affordances | none | WEAK-minor (ES-8) |
| 11 | Goals capture drain | `goals/capture/+page.svelte:170-181` | "You're all caught up. / No new goals to react to. Check back as the group adds more." | "See the goal list" | GOOD |
| 12 | Goal detail — linked plans | `goals/[goalId]/+page.svelte:143-149` | "No plans linked yet. Link an item and this goal starts tracking it." | "Link an item" (canEdit) | GOOD |
| 13 | Goal link sheet drained | `goals/[goalId]/+page.svelte:223-226` | "No more items to link. Every plan on this trip is already attached." | n/a | GOOD |
| 14 | `/lists` | `lists/+page.svelte:106-110` | "No lists yet. Make one, or let Waypoint track your bookings." | dashed "New list" + pinned Booking smart list | GOOD |
| 15 | `/lists/booking` zero rows | `lists/booking/+page.svelte:57-61,67` | "All booked. Nothing left to reserve." | n/a (auto list, by design #50) | WEAK on fresh trip (ES-2) |
| 16 | List detail — tasks | `ChecklistBody.svelte:80-82` | "Nothing on this list." / "All done — nothing left to show." | add-task input present | GOOD |
| 17 | `/inbox` pending | `inbox/+page.svelte:52-55` | "No pending suggestions." | none | WEAK (ES-3) |
| 18 | `/expenses` | `expenses/+page.svelte:97-102` | "$ / No expenses yet. / Tap + to log your first expense." | FAB exists (`:198`) | GOOD |
| 19 | `/expenses?item=` filtered | `expenses/+page.svelte:115-118` | "No expenses linked to this item." | "Show all" escape only | WEAK-minor (ES-12) |
| 20 | `/budget` zero budget | `budget/+page.svelte:99-122` | "$0.00 Estimated Total" — no copy at all | inputs (owner only) | WEAK for non-owner (ES-6) |
| 21 | `/documents` | `documents/+page.svelte:74-84` | icon + "No documents yet. / Boarding passes, tickets, and confirmations land here." | FAB exists (`:128`) but copy doesn't point at it | WEAK-minor (ES-7) |
| 22 | Item detail — documents | `DocumentSection.svelte:54-64` | "No documents yet. / Add a boarding pass, ticket, or confirmation." | uploader below (canUpload) | GOOD |
| 23 | Item detail — comments | `items/[itemId]/+page.svelte:249-250` | "No comments yet." | composer directly below (`:281`) | OK / polish (ES-9) |
| 24 | Item detail — checklist absent | `items/[itemId]/+page.svelte:232-241` | "Track packing, groceries, or to-dos for this item." | "Add checklist" | GOOD |
| 25 | `/today` outside trip dates | `today/+page.svelte:58-64` | "No itinerary for today / Today doesn't fall within this trip's dates." | none | WEAK (ES-4) |
| 26 | `/today` timeline empty (mid-trip free day) | `TodayTimeline.svelte:62-65` | "Nothing scheduled for today." | none in card; + add-sheet lives in bottom nav (`AppShell.svelte:106`) | WEAK (ES-5, coordinate w/ #166) |
| 27 | `/today` tomorrow preview | `today/+page.svelte:111-113` | "Nothing scheduled." | none | OK (read-only future, D3 boundary) |
| 28 | `/today` trip checklists | `today/+page.svelte:145-147` | "Nothing on this list." | read+check only by design (#52) | CITED (#52) |
| 29 | `/today/upcoming` no days | `today/upcoming/+page.svelte:48-53` | "No upcoming days within the next 3 days." | none | OK (end-of-trip truth; D5 owns the morning-after) |
| 30 | `/today/upcoming` per-day | `today/upcoming/+page.svelte:58-59` | "Nothing scheduled." | none | OK (same D3 boundary as #27) |
| 31 | `/now` nothing-else-planned | `now/+page.svelte:40-46` | "Nothing else planned / The rest of today is open." | none | CITED — PRD #166 Door 1 |
| 32 | `/now` free-time focus | `NowBetweenThings.svelte:19-26` | countdown card, no ideas | none | CITED — PRD #166 Door 1 |
| 33 | `/now` outside trip dates | `now/+page.svelte:47-53` | same as #25 | none | WEAK (ES-4, same fix) |
| 34 | `/swipe/[phaseId]` drain | `swipe/[phaseId]/+page.svelte:79-98` | "All caught up. / Nothing left to rate in {phase}." | next phase / parking lot / phases | GOOD |
| 35 | `/closeout` no days | `closeout/+page.svelte:72` | "No days to review. This trip has no itinerary days." | none | WEAK-minor (ES-11) |
| 36 | `/clone` no items | `clone/+page.svelte:130-131` | "No items to clone." | clone form still usable | OK |
| 37 | Notification bell | `NotificationBell.svelte:112` | "No notifications yet." | n/a (transient popover) | OK |
| 38 | `/claim` zero claims | `claim/+page.server.ts:27-38` | never renders — redirects | n/a | GOOD |

Not in scope / no zero-data branches found: `/account` (the `{:else}` at `:65` is a skeleton-vs-avatar
toggle), `/trips/new`, `/trips/import`, `items/new`, `items/[itemId]/edit`, `/settings`, `/members`
(its `{:else}` branches are join-link create/revoke states), `/archive/[token]`, `/invite/[code]`,
`/join/[token]` (state branches — invalid/expired/auth — belong to the front-door auditor, and the
invalid/expired cards there do explain themselves).

---

## 3. Findings

### ES-1 — The trip home's first-run empty state is unreachable; the real first-run teaches nothing — **P2**

- **Where:** `src/routes/(app)/trips/[slug]/+page.svelte:193-228`; root cause in `backend/pb_hooks/trips.pb.js:30` (day rows auto-created on trip create); `src/routes/(app)/trips/new/+page.svelte:58-92` (start/end dates `required`).
- **Lens:** novice + code. **Axis:** mechanical M3 (shipped-but-unreachable) feeding vision D2 (first five minutes). **Test:** the crafted teaching state can never render for a real trip; the state that *does* render fails the "contributes without being taught" bar.
- **What:** The branch chain is `{#if phases.length > 0}` → `{:else if days.length > 0}` (flat day list) → `{:else}` ("A blank itinerary." + CTAs). Trip creation requires dates and the PB hook generates day rows immediately, so `data.days.length > 0` is always true — every fresh trip lands in the flat day list: an uninstructed wall of `DayCard`s whose only copy is the per-card headline `'Nothing planned yet'` (`lib/itinerary/components/DayCard.svelte:32`). The carefully written "A blank itinerary" card, the one place that teaches *phase* and *add an item*, is dead code. Compounding it: the nested "Add a day item" CTA (`:217-225`) is gated on `firstDayId` (`:44`, `data.days[0]?.id`) which is by definition `undefined` inside a `days.length === 0` branch — that button can never render under any data.
- **Why it matters:** this is the owner's first screen after creating a trip *and* the screen a freshly joined member lands on when the invite goes out before planning starts (a normal sequence). Scenario 5 (first five minutes) starts here. A novice sees fourteen rows of "Nothing planned yet" and no statement of what to do; the contribution on-ramp (goals capture) sits silently behind a SubTab label.
- **Proposed fix:** retire the unreachable branch; key the first-run state on *content*, not day rows — e.g. `const isFresh = totalItems === 0 && data.phases.length === 0`. When fresh, render a hero card **above** the day list (don't hide the days — they teach the trip's shape), role-aware:
  - **Owner/co-owner:**
    > **A blank itinerary.**
    > Your days are ready. Group them into phases — city, leg, whatever fits — or drop the first plan straight onto a day.
    > `[Add a phase]` `[Open day one]` `[Invite the group]`
    — "Open day one" → `/days/{firstDayId}`, where `DayTimeline`'s empty row already teaches tap-to-add and drag-an-idea. "Invite the group" → members. (Phase copy reuses `phases/+page.svelte:166`'s good line.)
  - **Traveler:**
    > **Nothing planned yet.**
    > Start with what you want out of this trip — the itinerary grows from there.
    > `[Add & review goals]` → `/goals/capture`
    — this is the empty-state-sized slice of issue #111's orientation problem; the wizard already exists and is the ideal first contribution (scenario 4).
- **Relation to docs:** D2 declares this task-path first-class; issue #111 (walkthrough/intro wizard) is the bigger orientation play — this finding is narrower (one card, two variants) and shippable without it. D1 is respected: this is not a collaboration hub, it's the page's own zero-content state.

### ES-2 — Booking smart list says "All booked" on a trip with nothing bookable — **P3**

- **Where:** `src/routes/(app)/trips/[slug]/lists/booking/+page.svelte:57-61`.
- **Lens:** novice. **Axis:** vision V1-adjacent (false reassurance on the pre-departure sweep, scenarios 6/13).
- **What:** zero rows renders "All booked. Nothing left to reserve." — but the branch fires identically when the trip simply has no bookable items yet. On a fresh trip the pinned smart list (also surfaced on `/lists` as "0 left") congratulates the user before they've planned anything. Never-filled and drained-to-done are different states; `ChecklistBody.svelte:80-82` already models the distinction.
- **Proposed fix:** pass a `totalBookable` count from the server and split the copy:
  - no bookable items at all:
    > Nothing here needs booking yet. Flights, stays, rentals, and tickets you plan will line up here until they're booked.
  - drained (totalBookable > 0, all booked): keep "All booked. Nothing left to reserve."
  The existing footnote ("Updates automatically as you plan. Nothing to add by hand." `:67`) is correct per #50's design and stays.

### ES-3 — Inbox empty state assumes the user knows what a "suggestion" is — **P3**

- **Where:** `src/routes/(app)/trips/[slug]/inbox/+page.svelte:52-55`.
- **Lens:** novice. **Axis:** vision (missed teaching moment on an owner surface).
- **What:** "No pending suggestions." is the whole state. A suggestion only exists when auto-approve is off and a traveler proposes something (CONTEXT.md glossary, *Suggestion* / *Auto-approve*) — none of which a first-time owner knows. The page reads as a feature with no purpose.
- **Proposed fix:**
  > **No suggestions waiting.**
  > When auto-approve is off, travelers' ideas land here for your sign-off before they join the plan.
  > `[Review approval setting]` → `/trips/[slug]/settings`
  (Keep the card layout; copy + one quiet link.)

### ES-4 — Trip Mode outside trip dates is a dead-end card (Today and Now) — **P3**

- **Where:** `src/routes/(app)/trips/[slug]/today/+page.svelte:58-64`; duplicated at `now/+page.svelte:47-53`.
- **Lens:** novice. **Axis:** mechanical M2-flavored (no onward affordance on the card; the mode pill is the only way out and is chrome, not content).
- **What:** trip home renders a prominent clay "Trip Mode" button at all times (`[slug]/+page.svelte:92-101`). Tap it before the trip starts and both Trip Mode tabs answer "No itinerary for today / Today doesn't fall within this trip's dates." — accurate, actionless. The *post*-trip occurrence of this same card is the D5 wrap-up gap (pre-agreed P1, feature-sized, routed to grill→PRD — cited, not re-flagged here).
- **Proposed fix (pre-trip only):** make it a countdown with a door:
  > **Trip starts in {n} days.**
  > Nothing to show until day one — the plan lives in Planning Mode.
  > `[Browse the plan]` → `/trips/[slug]`
  Quiet, no nagging; one card, both tabs share it.

### ES-5 — A free day mid-trip ("Nothing scheduled for today.") opens no doors — **P3** (coordinate with #166)

- **Where:** `src/lib/trip-mode/components/TodayTimeline.svelte:62-65`.
- **Lens:** novice. **Axis:** vision V3/D4 (free time is THE replanning entry state).
- **What:** an itinerary day with zero items renders a single dead card. The quick-add sheet exists one tap away (bottom-nav `+` → `AddSheet`, wired in `AppShell.svelte:106`) and the phase parking lot holds the group's ideas, but the card points at neither.
- **Backlog check:** PRD `docs/TRIP_REPLANNING_PRD.md` (issue #166) Door 1 surfaces parking-lot ideas on **Now**'s free-time / nothing-else-planned Focus states — but the PRD explicitly scopes Today's layout out ("Changes to Today's layout (only the skip affordance…)" — Out of Scope). So Now gets its door; Today's empty card stays dead unless this lands too.
- **Proposed fix:** copy + pointer only (no layout change, staying inside #166's spirit):
  > Nothing scheduled for today. A free day — tap **+** to add something, or check the parking lot for ideas.
  with "parking lot" linking to the current phase's detail (or, once #166 ships, sharing its ideas vocabulary/surface). Smallest version: just add the "tap +" sentence, mirroring expenses' pattern.

### ES-6 — Budget page with no budget set is mute, and misleading for non-owners — **P3**

- **Where:** `src/routes/(app)/trips/[slug]/budget/+page.svelte:99-122` (header), `:170` (`isOwner` gate on inputs).
- **Lens:** novice. **Axis:** vision V2-adjacent (a member checking "can we afford this?" — scenario 8 — gets "$0.00" with no explanation).
- **What:** with no budget, the page leads with "Estimated Total $0.00 / $0.00 per day" over a stack of $0 category cards. Owners see inputs and can infer; non-owners see a silent wall of zeros — indistinguishable from "this trip is free" or "the feature is broken." There is no zero-state copy anywhere on the page.
- **Proposed fix:** when `grandTotal === 0`:
  - non-owner:
    > **No budget set yet.**
    > The trip owner can set one here. Spending still adds up on the Expenses tab.
  - owner: one line above the cards:
    > Set a per-day or total amount for each category — the estimate updates as you type.

### ES-7 — Documents empty teaches *what* but not *how* (inconsistent with Expenses) — **P3**

- **Where:** `src/routes/(app)/trips/[slug]/documents/+page.svelte:74-84`; FAB at `:128`.
- **Lens:** novice. **Axis:** designer (pattern consistency).
- **What:** Expenses' empty points at its FAB ("Tap + to log your first expense." `expenses/+page.svelte:101`); Documents has the same FAB but its copy stops at "…land here." A novice on the page for scenario 7 (attach the hotel PDF) has to discover the floating button unaided.
- **Proposed fix:** append one sentence: "Boarding passes, tickets, and confirmations land here. Tap **+** to add the first one."

### ES-8 — Goals empty state asks viewers a question they can't answer — **P3**

- **Where:** `src/routes/(app)/trips/[slug]/goals/+page.svelte:143-147`; `canAdd = role !== 'viewer'` at `:37` gates both CTAs (`:74`, `:126`).
- **Lens:** novice. **Axis:** vision V2-shaped, but the role is read-only *by design* — so copy, not capability, is the finding.
- **What:** a viewer sees "No goals yet. What does everyone want out of this trip?" with the wizard banner and add button both hidden — an invitation with no door.
- **Proposed fix:** role-aware subline for viewers:
  > No goals yet. Goals the group adds will show up here.

### ES-9 — "No comments yet." misses the discuss-before-committing invite — **P3**

- **Where:** `src/routes/(app)/trips/[slug]/items/[itemId]/+page.svelte:249-250` (composer follows at `:281`, so not a dead end).
- **Lens:** novice. **Axis:** vision V1 (the alternative venue is the group text — scenario 16).
- **Proposed fix:**
  > No comments yet — say what you're thinking.

### ES-10 — "No days fall within this phase's date range." explains but doesn't point at the fix — **P3**

- **Where:** `src/routes/(app)/trips/[slug]/phases/[phaseId]/+page.svelte:239-240`.
- **Proposed fix:** append "Adjust the phase dates above to pull days in." (date editing lives on the same page).

### ES-11 — Closeout with no itinerary days is a dead end — **P3** (edge case)

- **Where:** `src/routes/(app)/trips/[slug]/closeout/+page.svelte:72`.
- **Proposed fix:** add a back-door link: "No days to review — this trip has no itinerary days. `[Back to the trip]`."

### ES-12 — Item-filtered expenses empty offers escape but no action — **P3**

- **Where:** `src/routes/(app)/trips/[slug]/expenses/+page.svelte:115-118` (banner escape at `:110-112`).
- **What:** "No expenses linked to this item." — the user arrived from an item wanting its costs; the natural next act is logging one, but only "Show all" is offered.
- **Proposed fix:** add a button that opens the existing AddExpense sheet, ideally pre-linked to `filterItemId` (sheet exists at `:200`; prefill needs a small prop). Copy: "No expenses linked to this item yet. `[Log one]`."

---

## 4. Cited, not flagged (intentional / already owned)

| Surface | Why it's not a finding |
|---|---|
| `/now` free-time + nothing-else-planned (no ideas door) | **PRD `docs/TRIP_REPLANNING_PRD.md` (issue #166), Door 1** — exactly these two Focus states get the parking-lot surface with one-tap promote. SPEC_BACKLOG:120-122 ("Ideas from Free Time", "Inline contextual parking lot") absorbed by that PRD. |
| The morning-after `end_date` Trip Mode state | **Charter D5** — pre-agreed P1 vision gap, feature-sized, Phase 3 routes to grill→PRD. ES-4 deliberately covers only the *pre*-trip occurrence. |
| No goals/swipe/votes orientation block on trip home | **Charter D1** — no collaboration hub, surfaces stay contextual by design. ES-1 proposes a *zero-content* hero, not a hub. |
| Booking list has no manual add | **#50 design** — system-maintained; the footnote saying so (`booking/+page.svelte:67`) is correct teaching. |
| Today checklists read+check only ("Nothing on this list.") | **#52 design** — Trip Mode is deliberately non-managing for lists. |
| Full first-run orientation / walkthrough | **Issue #111** (open) + **D2** — the wizard-sized solution is owned there; ES-1 is the empty-state-sized slice and should be reconciled with #111 at disposition time. |
| Tomorrow/upcoming "Nothing scheduled." with no edit path | **D3** — future days are Planning Mode's job; the mode pill is the agreed working door. |
| `/claim` with no pending claims | Server redirect (`claim/+page.server.ts:27-38`) — correct behavior, never renders. |

---

## 5. First-five-minutes synthesis (D2 lens over the inventory)

A new member's first five minutes touch, in order: join/claim → **trip home** → (maybe) goals →
(maybe) a day → documents/expenses later. Of those, the only weak link *attributable to empty
states* is the trip home (ES-1): join and claim are clean, goals' contributor empty is one of the
best in the app, the day view's empty row is the single best teaching state, and documents/expenses
both have copy + FAB. Fixing ES-1's traveler variant — pointing the freshly joined member at the
goals capture wizard from the itinerary they land on — is the highest-leverage empty-state change
in this audit, and it reuses two things that already exist (the wizard, and the phases page's
teaching copy). Everything else here is consistency polish that brings stragglers up to the
app's own established voice.

## 6. Pattern recommendations (cross-cutting, for the report's designer lens)

1. **Adopt the dual-state rule app-wide:** never-filled ≠ drained-to-done. `ChecklistBody` and the
   swipe deck model it; the booking list (ES-2) and goals capture already half-do it. Cheap test:
   does the copy still make sense on a brand-new trip?
2. **Every empty names its next act** — a button in the block (trips), an always-on add-row
   (lists/goals), or copy pointing at chrome ("Tap +"). The four dead cards found (ES-3, ES-4,
   ES-5, today's tomorrow-preview excepted by D3) are the only places the rule breaks.
3. **Teach the domain word once, in passing,** the way the parking-lot empty does ("…start a
   parking lot for this phase") — phases, suggestions (ES-3), and booking (ES-2) all have a
   one-sentence home for their concept.
4. **Role-aware empties:** any empty whose CTA is role-gated needs a viewer variant (ES-8 today;
   goal detail handles it by just hiding the button under a self-explanatory dashed box — fine).
