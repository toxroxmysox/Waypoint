# Desktop Layout Exploration — v2 audit

> Lens: charter (docs/app-audit/charter.md). v1 audited mobile-first; v1 findings.json contains
> **zero** desktop/rail findings — everything below is fresh territory.
> Breakpoints (src/routes/layout.css:58-59): `md-desktop` = 900px, `lg-desktop` = 1280px.
> Code-verified static analysis; no live render. Finding IDs `DESK-##` are candidates for Phase 3
> merge into findings.json (renumber to WP-A-### there).

---

## 1. Shell anatomy

`AppShell.svelte` (src/lib/shell/components/AppShell.svelte) wraps **only** `/trips/[slug]/*`
(via `src/routes/(app)/trips/[slug]/+layout.svelte`). Three render branches:

| Branch | Condition | Chrome |
|---|---|---|
| immersive | `/swipe/` or `/goals/capture` (layout.svelte:9-11) | none — children only, all breakpoints |
| mobile | `<900px` (`md-desktop:hidden`, AppShell:75) | in-flow ModePill (active trips) + BottomNav |
| desktop | `≥900px` (AppShell:87) | SideRail fixed left (72px md / 240px lg) + content (`ml-[72px]`→`ml-[240px] mr-[320px]`) + ContextRail fixed right (320px, **lg only**: `hidden lg-desktop:flex`, ContextRail:70) |

Routes **outside** the trip layout get no shell at any width: `/trips`, `/account`, `/trips/new`,
`/trips/import`, `/claim` (and public `/invite`, `/join`, `/archive`). They render mobile NavBar +
centered column.

### Width math (content pane vs `max-w-*`)

Near-universal main pattern: `max-w-lg md-desktop:max-w-2xl` (672px) centered.

- At 1280px (lg floor): content pane = 1280 − 240 − 320 = **720px**; 2xl + px-4 = 704px → fits, 16px slack. No overflow anywhere.
- At 900px (md floor): 900 − 72 = 828px ≥ 704. Fits.
- Waste grows linearly above ~1392px viewport; at 1536px the lg content pane is 976px with a 672px column (~300px dead). Benign — the rail exists to absorb that, which is why rail filler (§3) matters.
- **Deviations:** `/now` is `max-w-lg` only (512px — no md widening; see DESK-09), `/archive/[token]` is `max-w-2xl` public no-shell (fine), invite/join/login `max-w-sm` auth cards (fine).

No page requests more than 2xl, so the 3-pane geometry is internally consistent. The problem is never overflow — it's what fills (or doesn't fill) the right pane.

---

## 2. ContextRail content map — the core gap

`ContextRail.svelte` branches on `getActiveSection(pathname)` (src/lib/shell/trip-nav.ts:5-12),
which knows **five** sections; the rail implements branches for **four**:

| Section (trip-nav.ts) | Routes mapped | Rail content (ContextRail.svelte) | Verdict |
|---|---|---|---|
| `documents` | /documents | lines 220-239: live file count + per-type breakdown via `page.data.documentSummary` | **Real.** Summary-only is by design (V4_DOCUMENTS_PRD §responsive: "summary only"; live preview pane explicitly deferred, PRD line 159, 170). Cite, don't flag. |
| `money` | /expenses, /budget | lines 173-191: static sentence "Track expenses across N phases and N days" + phase date list | **Filler.** Zero money data, yet both loads return `budget`, `spentByCategory` (+ `settlements`, `expenses` on /expenses). DESK-03 |
| `members` | /members | lines 193-218: "Trip Overview" — trip duration + the same phase list | **Filler.** Nothing member-related; members load already computes avatars/placeholders/departed. DESK-04 |
| `more` | /more, /inbox, /settings | **no branch exists** — only the trip-overview header (lines 74-93) renders; ~85% of the 320px pane is blank | **Empty pane.** DESK-02 |
| `itinerary` | **everything else** (~19 routes): trip home, /days/[dayId], /items/*, /phases/*, /goals/*, /lists/*, /now, /today, /today/upcoming, /closeout, /clone | lines 96-171: Today / Current Phase + Up Next (5 day links) + **Ideas (day pages only**, `page.data.parkingLotItems`, #159) | Live and useful on itinerary-ish pages; **mismatched** on goals/lists/items/closeout (DESK-05) |

**Headline stat: 2 of ~24 rail-visible routes have purpose-built rail content** (day pages, documents).
Three more get on-topic-but-generic itinerary glance; the rest get filler or blank.

The plumbing for per-route content is already established and cheap: route loads return a key,
ContextRail reads merged `page.data` (`documentSummary`, `parkingLotItems` precedents,
ContextRail.svelte:24-28 comment documents the pattern). Every proposal in §8 reuses it — no layout
changes needed.

---

## 3. SideRail audit

src/lib/shell/components/SideRail.svelte:

- **Tabs** mirror BottomNav config exactly (`getNavConfig`, nav-tabs.ts:18-41). Planning: Itinerary / Money / Members / Docs / More. Trip: Now / Today / **Add** (oversized action → AddSheet) / Docs. Active-tab logic shared (`getActiveTab`). Coverage parity with mobile: good.
- **Phase quick-links** (lines 144-161): `lg-desktop` only **and** `mode === 'planning'` only. Links to `/phases/[phaseId]` with name + start date + dot. Hidden in trip mode — consistent with D3 (phases are planning structure; trip-mode rail stays Now/Today/Add/Docs). Hidden at md-desktop — acceptable (72px icon rail has no room), but note md loses *both* phase links and the ContextRail, so md-desktop planning = mobile IA with an icon rail.
- **Trip name** lg-only (lines 55-64). Logo "W" → `/trips` at all desktop widths — the only escape to the trips list from the rail; at md it's an unlabeled "W" glyph (novice-lens marginal, but back-buttons on page NavBars cover it).
- **Oversized Add** in trip mode renders as a clay block button in the rail (lines 88-104) wired to the same AddSheet as mobile (AppShell:65-67,105-107). Works at md and lg. Good — quick-add (D3) does not depend on mobile chrome.
- **Mode button** (lines 67-79): `hidden lg-desktop:flex` → **lg only**. See DESK-01.

## 4. Mode pill placement per breakpoint

| Breakpoint | Toggle | Placement | Persistent? |
|---|---|---|---|
| <900 | ModePill.svelte | in-flow, top-center above content (AppShell:76-80), active trips only | no — scrolls away |
| 900–1279 | **none** | — | — |
| ≥1280 | SideRail button (SideRail:67-79) | under trip name in rail | yes |

Both implementations show the *target* mode ("Edit plan" in trip / "Trip view" in planning) with the
same clay/moss tint inversion — visually consistent, duplicated markup (ModePill not reused in rail;
trivial, not flagged).

### DESK-01 — No mode toggle at md-desktop (900–1279px) on an active trip — **P1 candidate**
- **Axis** mechanical M4 (expected-but-missing link) + vision D3. **Lens** novice + code.
- **Where** SideRail.svelte:68 (`hidden lg-desktop:flex`); AppShell.svelte:75 (mobile pill branch `md-desktop:hidden`), 87-103 (desktop branch renders no ModePill).
- **What** Mid-trip at 900–1279px (iPad landscape 1024/1180px, un-maximized laptop windows) the app is locked in Trip Mode: rail tabs are Now/Today/Add/Docs, no planning link, no toggle anywhere. D3 names the mode pill as *the* working door for future-scoped tasks ("touching tomorrow → Planning Mode"); at this breakpoint the door does not exist.
- **Why P1** Charter §5: mid-trip dead end on a critical path. Scenario 24 (check tomorrow's plan) and every future-scoped replanning task fail at this width with no in-app affordance. Mitigations exist but are not affordances: type a URL, resize the window, rotate the iPad, or re-enter via logo → /trips → trip card (which lands on the itinerary page still wrapped in trip chrome — see DESK-11).
- **Fix** Show the mode control at md-desktop: icon-sized toggle in the 72px rail (swap-arrows icon + 11px label, same slot as lg pill), or render ModePill in the content header at md. One-class fix is *not* enough (`lg-desktop:flex`→`md-desktop:flex` breaks the 72px width assumptions); small but real.

---

## 5. Desktop affordance audit (keyboard / hover / modals)

**Passes (record as positives):**
- **No hover-only affordances found.** Grep for `opacity-0` + hover/group reveal patterns returns nothing in src. Novice lens ("if it isn't visibly a button, it doesn't exist") passes shell-wide.
- **SwipeDeck is the desktop high-water mark** (src/lib/collaboration/components/swipe/SwipeDeck.svelte): ArrowLeft/Right (+map at lines 199-210), `u`/Backspace rewind, unconditional `onkeydown` (line 274), `showKeys` kbd hints, × close with aria-label (305-312), detail as centered modal when wide (`detailLayout`), real vote buttons per V4_GROUP_INPUT_PRD (lines 155, 292, 402 — buttons primary, swipes accelerators). Honored in code.
- **BottomSheet** closes on Escape and backdrop, has labeled × (BottomSheet.svelte:30-32, 56-65).
- **Drag-reorder on desktop** is a tracked requirement (PHASE_REDESIGN_PRD story 16 + verification list) — not re-audited here.

**Gaps:**

### DESK-06 — FAB collides with the ContextRail at lg-desktop — P3 (P2 if occlusion confirmed live)
- **Axis** designer. **Where** FAB.svelte:17 (`fixed right-5 z-nav` + `bottom: safe-area + 5rem`); consumers: /days/[dayId]:203 (Add item), /expenses:198 (Add expense), /documents:128 (Add document, planning mode), /trips:146 (no shell, unaffected).
- **What** FAB anchors to the *viewport* right edge. At ≥1280px that is on top of the fixed 320px ContextRail (FAB z-40 paints above the unranked rail), 80px up from the bottom — an offset that exists to clear a BottomNav that isn't rendered at desktop. On day pages the rail's own scrollable content (Up Next links, Ideas/ParkingLotSection) can extend under it.
- **Fix** At md+: anchor FAB to the content pane (`right: calc(320px + 1.25rem)` at lg) and drop the 5rem bottom offset; or replace with an in-column header action at desktop.

### DESK-07 — BottomSheet is bottom-anchored at every width — P3
- **Axis** designer (consistency vs CLAUDE.md "Modals: bottom sheets on mobile, centered modals on tablet+"). **Where** BottomSheet.svelte:38 (`items-end`), 49 (`rounded-t-xl max-w-lg`).
- **What** All 11 consumers (AddSheet — i.e. the SideRail "Add" action, ExpenseForm sheet, DocumentAddSheet, MoveItemSheet, AssignMemberSheet, AvatarCropper, GoalVoteResultsSheet, goals/lists/account sheets) slide a 512px sheet up from the bottom edge of a desktop viewport. SwipeDeck already implements the correct dual pattern in-repo (`detailLayout={isWide ? 'modal' : 'sheet'}`).
- **Fix** Teach BottomSheet one breakpoint: `md-desktop:items-center` + `md-desktop:rounded-xl` (+ fly y small / fade). One component fixes all consumers.

### DESK-08 — Capture wizard omits `showKeys` — P3
- **Where** goals/capture/+page.svelte:184-196 passes `autoFocus={isWide}` but not `showKeys`; harvest deck passes both (swipe/[phaseId]/+page.svelte:106-108). Keyboard *works* (handler unconditional); the hints are just missing. Trivial; possibly intentional (prompt-card text input). Fold into any swipe polish issue.

---

## 6. Immersive surfaces at desktop

`/swipe/[phaseId]` and `/goals/capture` suppress **all** chrome at every width (AppShell:70-72,
layout comment). At desktop both render a centered `max-w-md` card with `md-desktop:my-6 max-h-[760px]
rounded-xl border shadow-modal` (swipe:77, capture:168) on a bare `bg-paper` void — a deliberate
lightbox-like focus mode, *not* an unstyled mobile screen. Exits verified: deck × → `onclose` →
phases/goals (swipe:111, capture:196); end-states offer next-phase / parking-lot / back buttons
(swipe:89-96, 224-228); capture drain-state → "See the goal list" (capture:179). Keyboard path per §5.
**Verdict: intentional and competent; no finding.** (Suppressing the SideRail means no nav during a
deck run — acceptable for a 2-minute flow with a visible ×.)

---

## 7. Wasted-pane pages

### DESK-02 — `more` section renders an empty ContextRail — P3
/more, /inbox, /settings at lg show a 320px pane containing only the trip header (~100px), rest blank.
Inbox is the catch-up surface (scenario 42) and its load already returns `pending`/`approved`
suggestion arrays (inbox/+page.server.ts:35). Proposal in §8.

### DESK-05 — goals / lists / items / closeout / clone fall through to itinerary rail — P3
`getActiveSection` is too coarse. On /goals the rail shows "Up Next" day links — unrelated to goal
review (scenarios 10/33). On /items/[itemId] the rail ignores the item entirely while the load
returns comments, votes, documents, linkedExpenseCount, linkedGoals (items/[itemId]/+page.server.ts:91).
On /lists the rail ignores `done/total` + `bookingCount` (lists/+page.server.ts:28) — booking
readiness (scenarios 6/13) is glanceable data sitting unused next to a generic day list.

### DESK-09 — /now is `max-w-lg` only — cite, don't flag
now/+page.svelte:23 lacks the `md-desktop:max-w-2xl` widening every sibling has; page is explicitly
INTERIM (file comment lines 2-5: #153 slice A; #154 replaces layout). Fold a desktop-width check into
#154's verification instead of filing.

### DESK-10 — Non-trip routes have no desktop shell — P3
/trips (the landing page, scenario 44), /account, /trips/new, /trips/import, /claim render a phone
column + NavBar at any width; /trips adds a viewport-anchored FAB. Architecturally explained (AppShell
requires trip context) and nothing breaks — but the first desktop screen of the app is a 672px phone
list in a 1440px viewport. Cheapest lever: widen /trips into a responsive trip-card grid at md+; a
rail-less two-pane shell for account/new/import is not worth building now.

### DESK-12 — Phase-page parking lot stays in-column at lg; day page moves it to the rail — P3 (note)
Day page hides its in-column parking at lg (`lg-desktop:hidden`, days/[dayId]/+page.svelte:180) in
favor of the rail Ideas section (#159). Phase detail — the *primary* parking surface (#86 retired the
trip-wide lot; CONTEXT.md: parking is phase-scoped) — keeps parking in-column at all widths
(phases/[phaseId]/+page.svelte:163) and passes nothing to the rail. Caveat: phase parking carries
reorder (#88/#160) + quick-add (#57) affordances the rail's ParkingLotSection doesn't host, so
in-column may be the right call — flag as a *consistency decision to make*, not a defect.

### DESK-11 — Trip-mode chrome wraps planning pages reached from the rail — P3
In Trip Mode at lg, ContextRail "Up Next" links → `/days/[dayId]` (planning surface) without flipping
the mode (`userOverride` only changes via toggle, AppShell:38-44): the day editor renders inside trip
chrome — clay rail Now/Today/Add/Docs, no tab active match (`getActiveTab` falls back to 'now'),
phase quick-links hidden. Same state via logo → /trips → trip card at md. D3 wants future-scoped
work in Planning Mode; these doors lead to the right page in the wrong chrome. Fix options: flip
`userOverride` to planning on navigation to planning-only routes, or accept and restyle. (Note: the
rail surfacing future days from Trip Mode is *good* per D4 — the incoherence is the chrome, not the link.)

### Dead component (hygiene)
`src/lib/shell/components/TripTabs.svelte` has zero imports anywhere in src. Dead code; one-line
removal candidate for the doc/code-hygiene appendix.

---

## 8. Per-route ContextRail proposals (all reuse the `page.data` plumb; data already loaded)

| Route(s) | Branch | Proposed content | Data source (already returned) |
|---|---|---|---|
| /expenses | `money` | **DESK-03 fix**: budget vs spent bar, top 3 categories, "you're owed / you owe" line, settle-up link | expenses load: `budget`, `spentByCategory`, `settlements` (+page.server.ts:50-61) |
| /budget | `money` | same glance minus settlements; per-day burn (budget ÷ tripDays) | budget load: `budget`, `spentByCategory`, `tripDays` (46-55) |
| /members | `members` | **DESK-04 fix**: counts by role, unclaimed placeholders ("2 awaiting claim"), departed count, invite CTA | members load (computed member rows) |
| /inbox | new `more`/`inbox` | pending-suggestion count + oldest-pending age; post-review "all caught up" | inbox load: `pending`, `approved` (35) |
| /more, /settings | new `more` | lifecycle glance: trip status (planning/active/wrapped per D5 when built), closeout / clone / export quick links (mirrors /more cards: lines 37-108) | layout data only |
| /goals/* | split from itinerary | goal pulse: top-voted goals, "N members haven't weighed in", capture-deck link | goals load: `goals`, `votesByGoal`, `members` (40) |
| /lists/* | split from itinerary | progress bars per list (done/total), "N items need booking" → /lists/booking | lists load: `lists`, `bookingCount` (28) |
| /items/[itemId] | split from itinerary | item context: vote tally, comment count, attached docs, linked expenses/goals — each anchor-linking into the main column | item load (91) |

Implementation shape: extend `TripSection` (trip-nav.ts:3) — `'goals' | 'lists' | 'item' | 'inbox'` —
or branch on `page.data` key presence like `parkingLotItems` already does. Keep documents as the
template (V4_DOCUMENTS_PRD §responsive blessed the route-aware rail as the system).
Priority order if sliced: money → inbox → goals (highest scenario traffic: 8, 30, 31, 42, 10, 33);
members/settings last.

## 9. What's intentional (cited, not flagged)

- Documents rail = summary only; no live preview pane (V4_DOCUMENTS_PRD lines 144-146, 159, 170).
- Swipe votes as buttons-with-swipe-accelerators incl. desktop/keyboard (V4_GROUP_INPUT_PRD 155/292/402) — implemented.
- Parking lot phase-scoped; trip-wide page retired with 303 redirect (parking-lot/+page.server.ts, #86).
- Immersive chrome suppression for decks (AppShell:30-32 comment + layout comment) — deliberate.
- /now interim layout (#153/#154 file comment).
- ContextRail lg-only / md gets no third pane — geometry choice, sound at 900px.
- SPEC_BACKLOG has zero desktop/rail entries — none of the above is documented-deferred; all fair game for Phase 3.

## 10. Candidate findings summary

| ID | Sev | Axis/Test | One-liner |
|---|---|---|---|
| DESK-01 | **P1** | M4 + D3 | No mode toggle 900–1279px on active trip; Trip Mode is a dead end for future-scoped tasks (SideRail.svelte:68, AppShell.svelte:75) |
| DESK-02 | P3 | designer | `more` section (/more /inbox /settings) renders empty 320px rail — no branch in ContextRail |
| DESK-03 | P3 | designer/power | Money rail is static filler while loads carry budget/spent/settlements |
| DESK-04 | P3 | designer | Members rail shows phases, nothing about members |
| DESK-05 | P3 | designer/power | goals/lists/items fall through to itinerary rail; item/list/goal context data loaded but unused |
| DESK-06 | P3* | designer | FAB overlaps ContextRail at lg; bottom offset clears a nonexistent BottomNav (*P2 if live render shows it occluding rail links) |
| DESK-07 | P3 | designer | BottomSheet bottom-anchored at desktop; violates CLAUDE.md modal convention; 11 consumers, one-component fix |
| DESK-08 | P3 | power | Capture deck missing `showKeys` hints (keyboard itself works) |
| DESK-10 | P3 | designer | Non-trip routes (/trips landing, /account, new/import/claim) are phone columns at desktop |
| DESK-11 | P3 | code/designer | Planning pages reachable in Trip-Mode chrome (rail day links / re-entry); mode never flips on navigation |
| DESK-12 | P3 | designer | Phase-page parking in-column at lg vs day-page parking in rail — pick one treatment (caveat: reorder/quick-add live in column) |
| — | — | hygiene | TripTabs.svelte dead component; /now width interim → fold into #154 |
