# IA Depth Exploration — "Should we have fewer layers of information?"

> v2 exploration, 2026-06-12. Lens = audit charter (docs/app-audit/charter.md), binding decisions D1–D6.
> Code is source of truth; every layer below is verified against `src/routes/` + nav chrome on this branch.
> Scope: mobile (375px). SideRail and ContextRail are `md-desktop:`/`lg-desktop:`-gated
> (src/lib/shell/components/SideRail.svelte:38, ContextRail.svelte:70) — they do not exist on the phone,
> so the mobile layer stack is exactly: bottom-nav tab → sub-tab → page → detail (+ sheets).

**Short answer: yes — but only in the middle.** Both bottom navs are right-sized and charter-locked
(mode split, D1). Item detail is correctly the single deep destination. The excess depth is one layer
down: a duplicate index (Phases vs Overview), two 2-item sub-tab sets whose second tab is a thin page,
a junk-drawer tab (More), and one page (Inbox) whose only entry is buried inside that drawer.
Flattening those four spots removes a layer from 9 of the 20 most common intents without touching
either nav or any charter decision.

---

## 1. The layer stack as shipped (mobile)

### Planning mode (moss accent) — `getNavConfig` src/lib/shell/nav-tabs.ts

```
L0  /trips  (trips list, NavBar avatar→/account, FAB→/trips/new)
L1  bottom nav: Itinerary | Money | Members | Docs | More
│
├─ Itinerary  /trips/[slug]          SubTabs: Overview | Phases | Lists | Goals   ← L2
│   ├─ Overview   (+page.svelte, 230 ln)  stats card · lists strip (MiniListCard)
│   │             · per-phase blocks: phase link + DAY CHIPS + per-phase lists · unphased days
│   ├─ Phases     (phases/+page.svelte, 268 ln)  phase cards (create/reorder/delete) + swipe-launch
│   │   └─ Phase detail  (phases/[phaseId], 254 ln)  parking lot + InlineQuickAdd + day drop-dividers  ← L3
│   │       └─ Day view  (days/[dayId])  timeline + DayNav + FAB                                        ← L3
│   │           └─ Item detail  (items/[itemId])  votes·comments·checklist·docs·goals·expense          ← L4
│   │               └─ Item edit  (items/[itemId]/edit)                                                ← L5
│   ├─ Lists      (lists/+page.svelte, 162 ln)  checklist index + booking smart-list link
│   │   ├─ Booking smart list  (lists/booking, 69 ln)                                                  ← L3
│   │   └─ List detail         (lists/[listId])                                                        ← L3
│   └─ Goals      (goals/+page.svelte, 222 ln)  goal list + capture CTA
│       ├─ Goal capture  (goals/capture, IMMERSIVE — chrome suppressed)                                 ← L3
│       └─ Goal detail   (goals/[goalId])  link/unlink/status                                          ← L3
│
├─ Money  /expenses                  SubTabs: Expenses | Budget                    ← L2
│   ├─ Expenses  (expenses/+page.svelte)  list · add form (?action=add) · Settle Up → BottomSheet
│   └─ Budget    (budget/+page.svelte, 227 ln)  per-category plan WITH spent-vs-plan bars (line 118)
│
├─ Members  /members                 no sub-tabs — invite/revoke/placeholder/join-link
├─ Docs     /documents               no sub-tabs — grouped docs + DocumentAddSheet (item-scopable)
└─ More     /more (177 ln)           link hub: Inbox*  Closeout*†  Settings  Clone*  Export
                                     (* = owner/co-owner-gated, more/+page.svelte:36,54,88; † status-gated)
    ├─ Inbox     (inbox)   suggestion review — ONLY inbound UI link is this More row              ← L2.5
    ├─ Settings  (settings) update/delete/archive
    ├─ Closeout / Clone / Export                                                                   ← L2.5
```

### Trip mode (clay accent)

```
L1  bottom nav: Now | Today | [Add ⊕ sheet] | Docs
├─ Now    /now      3 derived states (mid-event / between-things / day-wrapped); cards → item detail
├─ Today  /today    SubTabs: Today | Next 3 Days                                   ← L2
│   ├─ Today      timeline (TodayItemCard → item detail + direct edit link) + inline checklists (#52)
│   └─ Next 3 Days  (today/upcoming, 68 ln)  read-only lookahead
├─ Add ⊕  AddSheet.svelte → items/new?day=today | expenses?action=add | documents?action=add
└─ Docs   same /documents route, both modes
```

### Sheets inventory (the "L0.5" overlay layer)

AddSheet (trip ⊕), DocumentAddSheet, MoveItemSheet, AssignMemberSheet, SettleUpFlow-in-BottomSheet
(expenses/+page.svelte:223), GoalVoteResultsSheet, NotificationBell dropdown panel. All are
correctly sheet-weight interactions — **no sheet found that should be a page**. The reverse exists
(§3.6).

### Landing wrinkle that adds a tap to everything mid-trip

AppShell derives mode (`active ? trip : planning`, AppShell.svelte:35-40) but tapping a trip card on
/trips always lands `/trips/[slug]` — the planning Overview page rendered inside trip-mode chrome.
`getActiveTab` falls through to `'now'` so the Now tab lights up while Overview content shows.
There is no server redirect to `/now` for active trips (no `redirect` in `[slug]/+page.server.ts`).
Every cold open mid-trip costs +1 tap and one disorientation beat before scenario 18 even starts.

---

## 2. Taps-to-content — 20 most common intents (charter §9, mobile)

Counting: from mode-appropriate trip home (planning = Overview, trip = Now) unless noted "cold".
A tap = link/tab/button press; scroll/typing = 0. "Fork" = a wrong-guess point the novice lens hits.

| # | §9 | Intent | Current path | Taps | Fork? |
|---|----|--------|--------------|------|-------|
| 1 | 1 | When is our flight? | Overview → day chip → flight item | 2 | Overview-vs-Phases fork; must guess the day |
| 2 | 2 | Park an idea | Overview → Phases → phase → InlineQuickAdd | 3 | "Phases" label ≠ "ideas"; capture is L3 |
| 3 | 10 | What does everyone want? | Overview → Goals | 1 | — |
| 4 | 6/13 | What needs booking? | Overview → Lists → Booking | 2 | booking hidden under "Lists" |
| 5 | 7 | Attach hotel PDF to item | day chip → item → Documents section | 3 | or Docs tab → sheet → re-scope select, also 3 |
| 6 | 8 | Can we afford this? | Money → Budget sub-tab | 2 | Expenses-vs-Budget guess |
| 7 | 9 | Plan day 3 of Paris | Overview → Paris day-3 chip | 1 | via Phases instead = 3 |
| 8 | 11 | Several ideas, one city | Overview → Phases → city phase → quick-add ×N | 3 to first | same as #2 |
| 9 | 16 | Discuss an idea | day chip → item → comment box | 2 | comments only on item detail (fine) |
| 10 | 18 | What's next right now? | cold: trip card → (Overview w/ trip chrome) → Now | 2 cold / 0 warm | landing mismatch (§1) |
| 11 | 19 | Find the boarding pass | Docs → document row | 2 | — |
| 12 | 20 | Add dinner expense | ⊕ → Add expense → form | 2 | — |
| 13 | 21 | Tonight fell through | pill → planning home → Phases → phase parking | 4 + mode exit | **D3 violation shape** — parking lot invisible in Trip Mode on phone (ContextRail desktop-only) |
| 14 | 22 | Quick-add coffee today | ⊕ → Add to today → form | 2 | — |
| 15 | 23 | Hotel address (ongoing) | Today → item card | 2 | — |
| 16 | 24 | Tomorrow's plan | Today → Next 3 Days sub-tab | 2 | — |
| 17 | 27 | Confirmation code | Today → item → codes (scroll) | 2 | — |
| 18 | 30 | Budget so far, mid-trip | pill → Money → Budget | 3 + mode exit | no money surface in trip nav |
| 19 | 31 | Who owes whom | Money → Settle Up button → sheet | 2 | below expense list fold |
| 20 | 42 | Catch up on changes | bell → panel | 1 | bell absent on Members/Docs/days/items pages |

Reading: 13/20 are already ≤2 taps — the top-level navs work. The misses cluster in four places:
**capture depth** (#2/#8: 3 taps to the parking lot), **glance depth** (#6: budget behind a sub-tab;
#19 behind a fold), **mode-boundary breaks** (#13/#18: today-scoped tasks that force the pill), and
**duplicate-index forks** (#1/#7: Overview and Phases both claim to be "the itinerary").

---

## 3. Diagnosis — which layers carry value, which carry only structure

### 3.1 Overview vs Phases index: one collection, two L2 surfaces (the real finding)

Overview (+page.svelte:125-205) already renders the entire trip skeleton: every phase (linked), its
day chips (direct `days/[dayId]` links), per-phase lists, unphased days. The Phases sub-tab re-renders
the same phase collection one tab over, adding only management verbs (create/reorder/delete) and the
swipe-launch card — then links down to phase detail, which Overview also links to. Two sibling tabs
answering "what's the shape of my trip" is the novice fork behind #1/#2/#7/#8, and the only reason
parking-lot capture sits at L3. **Phases-as-index exists for structure (a home for CRUD verbs), not
for information value.** Designer lens, P2 (shipped but split; the workaround is reading both tabs).

### 3.2 Two-item sub-tab sets with a thin second destination

- **Money: Expenses | Budget.** Budget already computes spent-vs-plan (budget/+page.svelte:118,141-158)
  — it *is* the "can we afford this" answer — but it hides behind the second sub-tab while the landing
  tab shows the raw ledger. Two pages share one dataset; the split is by record type, not by user
  question. Charter scenario 8 (P) and 30 (N) both want plan-vs-actual *first*.
- **Today: Today | Next 3 Days.** `today/upcoming` is 68 lines of read-only lookahead. A sub-tab
  navigation event for content that is naturally "keep scrolling past tonight." It also burns the
  SubTabs row in the mode where vertical space matters most (one-handed, on-trip).

A 2-item sub-tab whose second item is a glance, not a workspace, is a layer for structure. P3 each.

### 3.3 The More junk drawer + the buried Inbox

More (177 ln) is five links, three owner-gated. Cost: Inbox — the only place suggestions get
reviewed — has exactly one inbound UI link, behind a tab named "More" (M4-adjacent; V2 risk: a
member's suggestion rots unseen because the owner never opens the drawer). Settings/Clone/Export are
genuinely rare-use and fine one layer down; the drawer's crime is hiding a *collaboration inbox*
among trip plumbing. Closeout's discoverability is D5's problem (pre-flagged P1, feature-sized —
not re-litigated here; the flattened IA just must not block a wrap-up banner).

### 3.4 Pages that could be sections of a parent

- **Lists index** (162 ln): Overview already shows MiniListCard strips (trip-level at :108-117,
  per-phase at :163-171). The index adds create + the booking link. Borderline: it survives as a
  sub-tab only because list-detail and booking need a stable parent; but its *content* is already
  duplicated upward. Cheapest win is surfacing the booking count upward, not deleting the page.
- **Inbox** → a section/ribbon of the itinerary surface (suggestions are proto-items; review feeds
  `items/new?suggestion=`). Relocating the entry ≠ collaboration hub; it stays contextual (D1-safe).
- **today/upcoming** → a section of Today (§3.2).

### 3.5 Sheets that could be inline — none; the gap is the reverse

No shipped sheet hides primary content. The actual gap: **Trip Mode has no door to the parking lot
on the phone** (#13). ContextRail carries phase-scoped ideas on desktop only (ContextRail.svelte:166-169).
The AddSheet's three actions are all *create-new*; there is no *promote-existing*. SPEC_BACKLOG (Trip
Mode, deferred v4): "Inline contextual parking lot" and "Ideas from Free Time" — documented-deferred,
so cited not flagged — except D4 explicitly promotes the free-time door to a charter requirement, and
D3 makes today-scoped replanning a Trip-Mode obligation. So: backlog citation for the timeline-inline
variant; charter requirement for the free-time/skip doors.

### 3.6 Layers that earn their keep (do not flatten)

- **Both bottom navs** — 5 planning / 4 trip is the floor given the mode split (charter-locked) and
  D1 (Members stays a contextual collaboration surface, not a hub).
- **Phase detail as a workspace** — parking lot + day drop-dividers + reorder is a real work surface
  (#159/#160 just shipped into it), not an index.
- **Day view** — the timeline with DayNav/FAB; the day chips on Overview already flatten reaching it.
- **Item detail** — deliberately the single deep page holding six concerns (votes, comments,
  checklist, docs, goals, expense link). Flattening *above* it works **because** this page stays
  heavy; splitting it would re-add layers at the bottom. Item edit as a separate page is fine
  (ItemForm is form-action-based per project rules).
- **Immersive surfaces** (goal capture, swipe decks) — intentional chrome suppression, not depth.

---

## 4. Proposed flattened IA — specific enough to mock

Respects: D1 (no collaboration home — goals/swipe/votes/suggestions stay scattered-contextual),
mode split (two navs stay), D5 (closeout surfacing deferred to wrap-up grill), no realtime, nothing
off-the-table. No route deletions required — only entry-point moves, two merges, one redirect.

### Planning mode — 5 tabs (same count, one renamed)

```
[ Itinerary ]  [ Money ]  [ Members ]  [ Docs ]  [ Settings ]
```

**Itinerary — SubTabs: Plan | Lists | Goals** (4 → 3)

- **Plan** = Overview ∪ Phases index, one surface:
  - stats card (unchanged)
  - **suggestions ribbon** (owner/co-owner): "2 suggestions waiting" → /inbox (route unchanged;
    entry relocated next to the itinerary it feeds). Bell items keep deep-linking there too.
  - phase cards, each: name → phase workspace · day chips (kept — they're the #1/#7 flattener) ·
    **parking count chip** ("4 ideas") → workspace parking section · **InlineQuickAdd directly on
    the card** (promotes capture from L3 to L1.5; answers #2/#8 in 1-2 taps) · per-phase list strip
  - "Edit phases" toggle revealing create/reorder/delete (the management verbs that justified the
    index) + swipe-launch card when `launchPhaseId`
  - unphased-days section (unchanged)
  - `/trips/[slug]/phases` → redirect to `/trips/[slug]` (pattern precedent: parking-lot→phases
    redirect already shipped, routes.json LEGACY row)
- **Lists** — unchanged page; **booking count badge on the sub-tab label** ("Lists · 3 unbooked")
  so scenario 6/13 reads from L1.
- **Goals** — unchanged (index → immersive capture / goal detail). Contextual per D1.

**Money — sub-tabs deleted; one page** (2 → 1)

1. header: **Estimated total vs spent** bar (the budget/+page.svelte:118 math, promoted)
2. balances + Settle Up button (sheet, unchanged) — above the ledger, not below it
3. expense list + add form (`?action=add` deep link unchanged)
4. header tap → **Budget editor** (current budget page content as the only pushed page) — read is
   0 taps, edit is 1. `/budget` route survives as the editor; sub-tab chrome dies.

**Members / Docs** — unchanged surfaces. Bell rendered on both (closes #20's coverage hole; bell is
already in AppShell scope). Docs back-target chrome bug is a separate audit finding, not IA.

**Settings (was More)** — a real page instead of a link hub: current settings form inline, plus rows
for Clone, Export, Account (closes scenario 41's "where do I change my avatar from inside a trip"),
and Closeout (status-gated row, *plus* whatever wrap-up banner D5's grill produces — this IA reserves
the top-of-Plan slot for it). Inbox row removed (entry moved to Plan ribbon).

### Trip mode — 4 tabs (same)

```
[ Now ]  [ Today ]  [ ⊕ Add ]  [ Docs ]
```

- **Now** — unchanged 3 states; free-time state gets the **"Ideas nearby" door** to phase-scoped
  parking (D4 charter requirement; implements backlog's "Ideas from Free Time" rather than the
  heavier inline-timeline variant, which stays deferred).
- **Today** — sub-tabs deleted; one scroll: timeline → inline checklists (already shipped, #52) →
  collapsed **"Next 3 days"** lookahead section (today/upcoming content inlined; route can redirect).
  Optional header line: "spent so far $X of $Y" — gives scenario 30 a 1-tap, no-mode-exit glance.
- **⊕ Add sheet** — gains a fourth action: **"Promote an idea"** → phase-scoped parking picker →
  `pullToPlan` onto today. With the Now door this is the D3-compliant answer to #13 (4 taps + mode
  exit → 2 taps, never leaves Trip Mode).
- **Docs** — unchanged.
- **Landing fix**: `/trips/[slug]` while `isTripActive && no override` → server redirect `/now`
  (pill override preserved; pill→"Edit plan" still lands Overview/Plan). Kills the
  Overview-in-trip-chrome mismatch; #10 cold open = 1 tap.

### Resulting stack

```
planning:  tab → (sub-tab ×3, Itinerary only) → workspace/detail → item → edit
money/settings/members/docs:  tab → page → detail        (sub-tab layer gone)
trip:      tab → page → item detail                       (sub-tab layer gone)
```

Sub-tabs survive only where destinations are genuinely parallel *collections* (Plan/Lists/Goals).
Worst-case depth is unchanged (item edit is still 5 from /trips) — flattening targeted the common
paths, not the maximum.

### Tap deltas (same 20 intents)

| # | Intent | Now | After | Mechanism |
|---|--------|-----|-------|-----------|
| 1 | flight details | 2 + fork | 2, fork gone | one itinerary surface |
| 2 | park an idea | 3 | 1–2 | quick-add on phase card |
| 4 | needs booking | 2 | 1–2 | badge on Lists sub-tab |
| 6 | afford this? | 2 + fork | 1 | budget header on Money |
| 7 | plan Paris day 3 | 1 or 3 | 1 | no dual index |
| 8 | ideas → one city | 3 | 1–2 | phase-card capture |
| 10 | what's next (cold) | 2 | 1 | /now landing redirect |
| 13 | tonight fell through | 4 + mode exit | 2, in-mode | ⊕ promote + free-time door |
| 16 | tomorrow's plan | 2 | 1 | inline lookahead |
| 18 | mid-trip budget | 3 + mode exit | 0–1 | Today header line |
| 19 | settle up | 2 (below fold) | 2 (above fold) | section reorder |
| 20 | catch up | 1 (patchy) | 1 (everywhere) | bell on Members/Docs |
| — | 3,5,9,11,12,14,15,17 | ≤3 | unchanged | already at floor |

### Sequencing note (ship-bias)

Three of these are afternoon-sized and independent: Money merge, Today merge, landing redirect.
The Plan merge is the real project (drag-reorder + quick-add + swipe-launch coexisting on one
surface — #159/#160 interactions). The Trip-Mode parking door overlaps D3/D4 findings already in the
audit; it should ride that disposition, not fork a second plan.

---

## 5. What this exploration is NOT claiming

- Not proposing a collaboration hub (D1 forbids; suggestions ribbon is contextual placement of an
  existing route).
- Not solving wrap-up/closeout discoverability (D5: feature-sized, grill→PRD; this IA only keeps a
  banner slot free).
- Not flagging inline-timeline parking lot or Quick Actions as missing — SPEC_BACKLOG Trip Mode
  marks them deferred; only the D4-promoted free-time door is treated as required.
- Not touching item detail composition, immersive surfaces, or either bottom nav's tab count.
- Tap counts are best-path; novice wrong-guess cost shows up as the "fork" column, and the proposal's
  main value is deleting forks (one itinerary surface, one money surface), not shaving single taps.
