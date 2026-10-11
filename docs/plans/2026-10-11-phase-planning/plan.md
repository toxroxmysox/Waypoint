# v3.3 Phases + Trip Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use svw:executing-plans (small plans) or svw:subagent-driven-development (large plans) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the trip → phase → day hierarchy legible and fast to navigate: a Phase Overview of full-header phase cards, a Phase Detail that answers "what are we doing here" (In/Staying/Out, notes, per-phase swipe, two-tap Do this → day), and a trip Overview rebuilt around a shared Level Header with Compact/Details itinerary.

**Architecture:** Two stored text fields (`phases.notes`, `trips.notes`) with hook gates mirroring day notes. Pure derivations in `src/lib/itinerary/` (span labels, Arrival/Departure/Staying, day-menu rows, planned counts), unit-tested. Two shared UI primitives (`LevelHeader`, `NotesEditor`), used by trip, phase and day pages. Placement reuses the day page's tap-to-plan write, extracted into one server helper. Wave 1 = Tasks 1–8 (data + phase screens); Wave 2 = Tasks 9–10 (trip Overview); Task 11 = release gate.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, Tailwind, PocketBase 0.2x (JSVM hooks + JS migrations), Vitest, Playwright, `backend/test-rules.mjs` harness.

**Spec:** `docs/plans/2026-10-11-phase-planning/grill.md` + `docs/plans/2026-10-11-trip-overview/grill.md` (the trip Overview record supersedes phase-record story 27).

**Intent sources:** ADR-0025 (`docs/adr/` — MCP writes: generic ops gated by PB rules + hooks; registry allowlist); glossary `CONTEXT.md` (Arrival, Departure, Phase Notes, Trip Notes, Phase Overview, Phase Detail, Level Header, Travel Day, Parking Lot, Swipe-Quiz).

**Run:** `pnpm verify:visual '/trips/{slug}'`, `'/trips/{slug}/phases'`, `'/trips/{slug}/phases/{phaseId}'`, `'/trips/{slug}/days/{day1}'` (disposable PB :8097, seeded populated trip). Interactive: `pnpm dev` + `./backend/start.sh` with a fresh PB. Never :8090 for migration checks.

## Global Constraints

- Migrations: append only, next number **0084**. Never edit an existing migration.
- PB hooks run in isolated sandboxes: inline every helper inside the callback body.
- Forms: SvelteKit form actions + `use:enhance`, no client `fetch`.
- Span copy everywhere: `N days · M nights` (1 day → `1 day`). Trip adds ` · K phases`.
- UI labels: **In** / **Staying** / **Out**; **Do this**; menu heading **On which day?**; toast **Planned on <Ddd D>** with **Undo**; toggle **Compact** / **Details**; section **Edit phases**; notes prompt **Add phase notes** / **Add trip notes**.
- Glossary nouns in code: `arrival`, `departure`, `staying`, `phaseNotes`/`notes`, `LevelHeader`. Never "transfer", "getting in".
- Notes edit permission = day notes: any non-viewer member. Phase *structure* (name/dates/location) stays owner/co_owner only.
- "Do this" visible only when the viewer may plan the idea: idea's `created_by` is the viewer's member, or viewer role is owner/co_owner. Never on ghost cards.
- No drag on Phase Detail. No trip-wide swipe launcher. No lists or Flights & stays on the Overview. Forming / wrap-up / closed Overview branches untouched.
- E2E: `goto` then click a client control → `waitUntil: 'networkidle'`. Seed via API, never UI. Read `BASE` from `tests/e2e/e2e-env.ts`.
- Removed/renamed labels or selectors → `grep -rn '<old>' tests/` and fix in the same commit.
- Every UI task ends with a 375px `pnpm verify:visual` shot.

## Review Focus

1. **Travel Day sharing** — a train on the shared boundary day must show as Tokyo's Out *and* Kanazawa's In; and a placement menu for Kanazawa must include that shared day. (Tests: Task 3 `phaseArrival/phaseDeparture` shared-day case; Task 3 `dayMenuRows` travel case.)
2. **Multi-day lodging & transport don't count as day items** — a lodging span starting on the phase's first day must appear in Staying, not In; a multi-day car rental (transportation with `end_date`) on day 1 *is* an Arrival only if its start day is the first day. (Test: Task 3 `phaseArrival excludes lodging`, `rental car counted on its start day`.)
3. **Undo after the day was edited elsewhere / double-tap** — Undo restores the idea's prior `day` and `sort_order` and status `unplanned`; a second Undo or a stale Undo after the item was deleted fails softly with an error toast, not a 500. (Test: Task 6 e2e `undo twice`, server returns `fail(404)` on missing item.)
4. **Viewer and non-creator traveler** — viewers can't save notes (403 surfaced in-context) and see no Edit affordance; a traveler sees Do this only on their own ideas. (Tests: Task 1 harness `viewer_notes deny`; Task 6 e2e traveler visibility.)
5. **Phase with zero days / dateless trip / single-day phase** — span reads `1 day` (no nights), Staying shows nothing to cover (no Add), In and Out are the same day. (Test: Task 3 `spanLabel single day`, `phaseStaying single-day phase has 0 nights`.)

---

## Wave 1 — Phase screens

### Task 1: Notes fields + hook gates

**Files:**
- Create: `backend/pb_migrations/0084_phase_trip_notes.js`
- Modify: `backend/pb_hooks/phases.pb.js` (update gate, ~line 54)
- Modify: `backend/pb_hooks/trips.pb.js` (update gate, ~line 21)
- Modify: `src/lib/itinerary/types.ts` (`Trip`, `Phase`)
- Test: `backend/test-rules.mjs` (new `runNotesGateCases`, modeled on `runDaysNotificationsGateCases` ~line 3123)

**Interfaces:**
- Produces: `Phase.notes: string`, `Trip.notes: string` (PB text field `notes`, max 5000, not required) on both collections.

- [ ] **Step 1: Write the failing harness cases** — `NOTES_OPS = ['phase_notes_traveler','phase_notes_viewer','phase_name_traveler','trip_notes_traveler','trip_notes_viewer']`. Expectations: traveler PATCH `phases/{phaseId}` `{notes:'x'}` → allow; viewer same → deny; traveler `{name:'y'}` → deny (unchanged rule); traveler PATCH `trips/{tripId}` `{notes:'x'}` → allow; viewer → deny. Wire into the main run + a `printNotesReport()`.
- [ ] **Step 2: Run** `pnpm test:rules` against a fresh PB → the five cases FAIL (field missing / gate).
- [ ] **Step 3: Migration 0084** — add `notes` text field (max 5000) to `phases` and `trips`; down removes both.
- [ ] **Step 4: `phases.pb.js` update gate** — mirror `days.pb.js` lines 12–53: viewer → `ForbiddenError("Viewers can't edit the plan.")`; traveler may change only `notes` (else `ForbiddenError('Only an owner or co-owner can edit phases.')`); owner/co_owner unchanged. Compare original vs new per field with `getString`.
- [ ] **Step 5: `trips.pb.js` update gate** — if `notes` changed and caller role is `viewer` → `ForbiddenError("Viewers can't edit the plan.")`. Inline the member lookup.
- [ ] **Step 6: Types** — add `notes: string` to `Trip` and `Phase`.
- [ ] **Step 7: Run** `pnpm test:rules` → all five PASS, no prior case regresses. `pnpm check` 0 errors.
- [ ] **Step 8: Commit** `feat(#401): phase and trip notes fields with day-notes edit gate`

### Task 2: Notes in portability and MCP

**Files:**
- Modify: `src/lib/portability/types.ts`, `export.ts` (~line 94), `import.ts` (phase + trip create)
- Modify: `src/lib/server/mcp/writes/registry.ts` (`trips.fields`, `phases.fields`)
- Modify: `src/lib/server/mcp/tools/get-trip.ts` (~line 81 phase card lines; trip heading)
- Test: `src/lib/portability/export.test.ts`, `import.test.ts`, the get-trip test beside the tool (create `get-trip.test.ts` if absent, following `audit.test.ts` style)

**Interfaces:**
- Consumes: `Phase.notes`, `Trip.notes` (Task 1).
- Produces: export JSON `phases[].notes: string`, `trip.notes: string`; import accepts them optional (older exports without notes import as `''`).

- [ ] **Step 1: Failing tests** — `export includes phase and trip notes` (asserts `out.phases[0].notes === 'Rail pass starts here.'`, `out.trip.notes === 'JR passes ordered.'`); `import restores notes` (round-trip equality); `import tolerates missing notes` (old fixture → `''`); `get_trip shows phase notes line` (phase card `lines` contains the notes text).
- [ ] **Step 2: Run** `pnpm test:unit --run src/lib/portability src/lib/server/mcp` → FAIL.
- [ ] **Step 3: Implement** — export/import fields; registry: `trips.fields.notes = 'free-text trip notes'`, `phases.fields.notes = 'free-text notes for the phase'`; get_trip: append phase notes as a line, trip notes as a card `{emoji:'📝', title:'Trip notes', lines:[notes]}` when non-empty.
- [ ] **Step 4: Run** same → PASS.
- [ ] **Step 5: Commit** `feat(#401): phase and trip notes in export/import and MCP`

### Task 3: Pure derivations

**Files:**
- Create: `src/lib/itinerary/phase-logistics.ts`, `src/lib/itinerary/phase-logistics.test.ts`
- Create: `src/lib/itinerary/span-label.ts`, `src/lib/itinerary/span-label.test.ts`
- Modify: `src/lib/itinerary/day-card.ts` (`DayCardSummary.plannedCount`), `day-card.test.ts`

**Interfaces:**
- Produces:
  - `spanLabel(start: string, end: string, phaseCount?: number): string` — `'5 days · 4 nights'`, `'1 day'`, with count `'10 days · 9 nights · 3 phases'` (`'1 phase'`). Dates are `YYYY-MM-DD…`; empty → `''`.
  - `phaseArrival(items: Item[], days: Day[], phase: Phase): Item[]` — transportation|flight items whose start day (`item.day`) is the phase's first day, any status except `considered`, sorted by `start_time`.
  - `phaseDeparture(items, days, phase): Item[]` — same on the phase's last day.
  - `interface StayLine { item: Item; nights: number }`; `interface PhaseStaying { lines: StayLine[]; coveredNights: number; totalNights: number }`; `phaseStaying(items, days, phase): PhaseStaying` — lodging items covering ≥1 phase night (night of date d covered when start ≤ d < end_date); `totalNights` = phase days − 1.
  - `interface DayMenuRow { dayId: string; label: string; fullness: string; travel: boolean }`; `dayMenuRows(phaseDays: Day[], summaries: Record<string, DayCardSummary>): DayMenuRow[]` — label `'Thu 18'`, fullness `'empty'` / `'1 item'` / `'3 items'` (from `itemCount`), `travel = day.phases.length > 1`.
  - `DayCardSummary.plannedCount: number` — own day items with `status === 'planned'`.

- [ ] **Step 1: Failing tests** (`phase-logistics.test.ts`, `span-label.test.ts`, `day-card.test.ts`), fixtures built from the Japan trip shape (Tokyo Nov 18–22, Kanazawa Nov 22–24):
  - `spanLabel('2027-11-18','2027-11-22') === '5 days · 4 nights'`; single day → `'1 day'`; `spanLabel('2027-11-18','2027-11-27',3) === '10 days · 9 nights · 3 phases'`.
  - shared-day train on Nov 22 ∈ `phaseDeparture(tokyo)` and ∈ `phaseArrival(kanazawa)`.
  - lodging starting Nov 18 not in `phaseArrival(tokyo)`; rental car (transportation, `end_date` Nov 20, day Nov 18) ∈ `phaseArrival(tokyo)`.
  - `phaseStaying(tokyo)`: hotel Nov 18→20 + ryokan Nov 20→22 → 2 lines, nights 2 and 2, `coveredNights 4`, `totalNights 4`; only the hotel → `coveredNights 2`; single-day phase → `totalNights 0`, `lines []`.
  - `dayMenuRows`: Nov 22 row `travel: true`; empty day `fullness 'empty'`.
  - `plannedCount` counts planned, excludes unplanned-with-day, done, considered.
- [ ] **Step 2: Run** `pnpm test:unit --run src/lib/itinerary` → FAIL.
- [ ] **Step 3: Implement** — reuse `toDateOnly`, `spanningItemsForDate`/`nightInfo` from the itinerary libs where they fit; weekday labels in the trip's calendar dates (UTC date math, as `daysNightsLabel` did).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(#401): span label, Arrival/Departure/Staying, day menu derivations`

### Task 4: LevelHeader + NotesEditor primitives; day page adopts them

**Files:**
- Create: `src/lib/itinerary/components/LevelHeader.svelte`
- Create: `src/lib/itinerary/components/NotesEditor.svelte`
- Modify: `src/routes/(app)/trips/[slug]/days/[dayId]/+page.svelte` (header ~lines 66–87, notes card ~91–135)
- Test: `tests/e2e/day-notes.spec.ts` (new; no existing spec covers day notes)

**Interfaces:**
- Produces:
  - `NotesEditor` props: `{ notes: string; action: string /* e.g. '?/updateNotes' */; canEdit: boolean; emptyPrompt: string /* 'Add phase notes' */; savedToast?: string /* default 'Notes saved' */ }`. Read mode shows the full text (`whitespace-pre-wrap`) with **no label** — no "Trip notes"/"Phase notes" heading — plus a small pencil icon button (`aria-label="Edit notes"`, ≥44px target) when `canEdit`; empty + `canEdit` shows only the prompt (`Add trip notes` / `Add phase notes` / `Add day notes`) as a button; editing = textarea + Save/Cancel via `use:enhance`; posts field `notes`. Hidden entirely when empty and `!canEdit`.
  - `interface LevelChip { label: string; href: string; sub?: string; filled?: boolean; travel?: boolean }`
  - `LevelHeader` props: `{ title: string; place?: string; span: string; meta?: string /* e.g. timezone */; href?: string /* whole identity block becomes one link */; chips?: LevelChip[]; notes?: Snippet; actions?: Snippet; size?: 'page' | 'card' }`. Chips render outside the `href` link (own targets); travel chips dashed with `⇄`; `filled` renders a dot.
- [ ] **Step 1: Failing e2e** — `day notes save from the header`: open a seeded day, click **Edit**, type, Save, reload → text persists; viewer sees no Edit.
- [ ] **Step 2: Run** `pnpm test:e2e:clean -- day-notes` → FAIL (new selectors).
- [ ] **Step 3: Build** both components; day page header becomes `LevelHeader` (title = day label, chips = day's phases linking to Phase Detail, Travel day pill via `actions`) with `NotesEditor` in `notes` (`canEdit` = role ≠ viewer). Remove the old notes Card. `DayNav` unchanged.
- [ ] **Step 4: Run** e2e → PASS; `pnpm check` 0 errors; grep `tests/` for the old `Notes` card selectors and fix.
- [ ] **Step 5: Visual** `pnpm verify:visual '/trips/{slug}/days/{day1}'` and `{day6}` @375.
- [ ] **Step 6: Commit** `feat(#401): LevelHeader and NotesEditor; day page header`

### Task 5: Toast action (Undo)

**Files:**
- Modify: `src/lib/shell/stores/toast.ts`, `src/lib/ui/Toast.svelte`
- Test: `src/lib/shell/stores/toast.test.ts`

**Interfaces:**
- Produces: `toast.show(message: string, variant?: ToastVariant, opts?: { action?: { label: string; run: () => void } })`; `Toast.action?: { label; run }`. A toast with an action lasts 6000 ms; running the action dismisses it.
- [ ] **Step 1: Failing test** — `show with action exposes it and run dismisses`; `action toast lasts 6000ms` (fake timers).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (button in `Toast.svelte`, ≥44px tap target). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(#401): toast action for Undo`

### Task 6: Phase Detail — header, notes, In/Staying/Out, Rate, Do this

**Files:**
- Create: `src/lib/server/plan-idea.ts` (+ `plan-idea.test.ts` if the codebase has a PB-mock pattern; otherwise covered by e2e)
- Create: `src/lib/itinerary/components/PhaseLogistics.svelte`, `PlanOnDayMenu.svelte`
- Modify: `src/routes/(app)/trips/[slug]/phases/[phaseId]/+page.server.ts` (load + actions `updateNotes`, `planIdea`, `unplanIdea`)
- Modify: `src/routes/(app)/trips/[slug]/phases/[phaseId]/+page.svelte`
- Modify: `src/routes/(app)/trips/[slug]/days/[dayId]/+page.server.ts` (`pullToPlan` tail branch → `planIdeaOnDay`)
- Modify: `src/routes/(app)/trips/[slug]/items/new/+page.server.ts` + `+page.svelte` (accept `type`, `end` query presets)
- Modify: `src/lib/itinerary/components/PhaseIdeas.svelte` (accept `planRows: DayMenuRow[]`, `canPlanIds: Set<string>`; render `PlanOnDayMenu` per non-ghost idea)
- Test: `tests/e2e/phase-detail.spec.ts`

**Interfaces:**
- Consumes: Task 3 (`phaseArrival`, `phaseDeparture`, `phaseStaying`, `dayMenuRows`, `spanLabel`), Task 4 (`LevelHeader`, `NotesEditor`), Task 5 (`toast.show` with action).
- Produces:
  - `planIdeaOnDay(pb: PocketBase, itemId: string, dayId: string): Promise<{ prevDay: string; prevSortOrder: number }>` — appends at the day's tail (`sort_order` = tail + GAP), sets `status: 'planned'`; returns prior values. Used by day `pullToPlan` (no-order branch) and phase `planIdea`.
  - Phase action `planIdea` (form: `item_id`, `day_id`) → `{ planned: { itemId, dayLabel, prevDay, prevSortOrder } }`; `unplanIdea` (form: `item_id`, `day`, `sort_order`) → restores `status: 'unplanned'`, prior `day`/`sort_order`; missing item → `fail(404, { error: 'That idea no longer exists.' })`. PB `items.pb.js` remains the permission authority.
  - Load adds: `arrival: Item[]`, `departure: Item[]`, `staying: PhaseStaying`, `planRows: DayMenuRow[]`, `canPlanIds: string[]`, `unratedCount: number` (viewer's unvoted planned+unplanned items in phase — same filter as `phases/+page.server.ts` lines 12–27), `canEditNotes: boolean`.
  - Item form presets: `?type=lodging|transportation|flight` sets initial type; `?end=YYYY-MM-DD` sets `end_date`. Existing `day`/`phase` presets unchanged.
- [ ] **Step 1: Failing e2e** (`phase-detail.spec.ts`, serial, API-seeded Tokyo/Kanazawa phases, a train on the shared day, one owner idea and one traveler-created idea):
  - header shows `5 days · 4 nights`; Out row shows the train and links to its item; Kanazawa's In row shows the same train.
  - empty Staying shows **Add**; its href has `type=lodging`, `day=<first day id>`, `end=<last date>`.
  - owner taps **Do this** → **On which day?** → `Fri 19`: idea leaves the parking lot, Fri 19 summary shows 1 item, toast `Planned on Fri 19`; **Undo** → idea back in parking lot; second Undo click absent (toast dismissed).
  - traveler: **Do this** visible on own idea only; viewer: none.
  - **Rate N** link → `/swipe/{phaseId}?from=/trips/{slug}/phases/{phaseId}`.
  - phase notes edit persists across reload.
- [ ] **Step 2: Run** `pnpm test:e2e:clean -- phase-detail` → FAIL.
- [ ] **Step 3: Implement** server: extract `planIdeaOnDay`, switch day `pullToPlan` to it (drag branch unchanged), add the three actions and load fields; `canPlanIds` = ideas where `created_by === membership.id` or role ∈ {owner, co_owner}.
- [ ] **Step 4: Implement** page: `LevelHeader` (size `page`, chips = phase days with `filled = plannedCount > 0`, `travel`), `NotesEditor` (`?/updateNotes`, prompt `Add phase notes`), `PhaseLogistics` rows (In/Staying/Out; filled → item links with `withOrigin`; empty + can-add → Add link to `items/new` presets; Staying partial → `2 of 4 nights covered` + Add), parking-lot header **Rate N** (hidden at 0), `PlanOnDayMenu` (button **Do this**, menu heading **On which day?**, rows from `planRows`; submits `?/planIdea` via `use:enhance`; on success `toast.show('Planned on ' + dayLabel, 'success', { action: { label: 'Undo', run } })` where `run` submits `?/unplanIdea`). Remove `daysNightsLabel` (replaced by `spanLabel`).
- [ ] **Step 5: Run** e2e → PASS; `pnpm test:e2e:clean -- desktop-day-plan` still PASS (pullToPlan refactor); `pnpm check` 0.
- [ ] **Step 6: Visual** `pnpm verify:visual '/trips/{slug}/phases/{phaseId}'` @375 + 768; open-menu state via `--click`.
- [ ] **Step 7: Commit** `feat(#401): Phase Detail answers in/staying/out, notes, rate, Do this`

### Task 7: Swipe returns to its origin

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/swipe/[phaseId]/+page.svelte` (~lines 16, 95–112, 171–175)
- Test: extend `tests/e2e/phase-detail.spec.ts`

**Interfaces:** Consumes `resolveBack(url, fallbackHref)` from `src/lib/shell/back-nav.ts`. "Next phase" links carry the same `from`.
- [ ] **Step 1: Failing e2e** — from Phase Detail, **Rate N** → close deck → URL is the Phase Detail.
- [ ] **Step 2: Run** → FAIL. **Step 3:** `phasesHref` → `resolveBack(page.url, '/trips/{slug}/phases')`; next-phase `goto` keeps `?from=`. Rename "Back to phases" → **Back** (grep `tests/` for the old text). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(#401): swipe deck returns to where it was opened`

### Task 8: Phase Overview (Phases tab) — closes #391

**Files:**
- Create: `src/lib/itinerary/components/PhaseOverviewCard.svelte`
- Modify: `src/routes/(app)/trips/[slug]/phases/+page.server.ts` (load), `+page.svelte`
- Modify: `src/lib/itinerary/components/PhaseCalendarEditor.svelte` (remove the `›` link ~line 375)
- Test: `tests/e2e/phase-overview.spec.ts`; fix `tests/e2e/phase-calendar-editor.spec.ts` if it uses the `›`/"Open {name}" link or the swipe banner

**Interfaces:**
- Consumes: `LevelHeader` (size `card`, `href` = Phase Detail), `spanLabel`, `summarizeDays` (`plannedCount`).
- Produces: load `cards: { phase: Phase; days: Day[]; plannedByDay: Record<string, number>; ideaCount: number; unratedCount: number }[]` (one query each for items/votes, bucketed by phase; drop `unratedTotal`/`launchPhaseId`). `orphans` unchanged.
- Card = LevelHeader (name, location, span, full notes read-only, day chips → day pages) + swipe row: one link wrapping label `N ideas · M to rate` and **Swipe** → `/swipe/{phaseId}?from=/trips/{slug}/phases`; `M = 0` → `N ideas · all rated`, not a link; `N = 0` → row hidden. Everything else on the card links to Phase Detail. No In/Staying/Out.
- Page order: orphans (unchanged, if any) → cards (`md-desktop:grid-cols-2`) → divider + **Edit phases** heading → `PhaseCalendarEditor`. Trip-wide swipe banner removed.
- [ ] **Step 1: Failing e2e** — card body → Phase Detail; day chip → that day; swipe row → deck with `from`; all-rated phase shows `all rated` and no Swipe link; no element with text `unrated` banner; editor has no `Open <name>` link.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `grep -rn "Swipe through\|Open " tests/` fixed.
- [ ] **Step 5: Visual** `pnpm verify:visual '/trips/{slug}/phases'` @375 + 768.
- [ ] **Step 6: Commit** `feat(#391 #401): Phase Overview cards; editor under Edit phases`

---

## Wave 2 — Trip Overview

### Task 9: Trip level header

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/+page.svelte` (stats card ~lines 356–400), `+page.server.ts` (action `updateTripNotes`; `canEditNotes`)
- Test: `tests/e2e/trip-overview.spec.ts`

**Interfaces:** Consumes `LevelHeader`, `NotesEditor`, `spanLabel(start, end, phases.length)`.
- Header (below unchanged NavBar + SubTabs): title, `location_summary`, span, timezone as `meta`, `NotesEditor` (`?/updateTripNotes`, prompt `Add trip notes`), phase chips (`label` = name, `sub` = `5d`, href Phase Detail), Trip Mode button in `actions` when active. Remove **Capture ideas**. Planning/active branch only.
- [ ] **Step 1: Failing e2e** — header shows `· 3 phases`; chip → Phase Detail; trip notes persist; no `Capture ideas`; viewer sees no notes Edit.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; grep `tests/` for `Capture ideas`.
- [ ] **Step 5: Commit** `feat(#401): trip level header with notes and phase chips`

### Task 10: Itinerary — Compact/Details, bordered phase cards; drop lists and Flights & stays

**Files:**
- Create: `src/lib/shell/stores/itinerary-density.ts` (persisted like `day-card-metric`)
- Create: `src/lib/itinerary/components/ItineraryDensityToggle.svelte`, `CompactDayRow.svelte`
- Modify: `src/routes/(app)/trips/[slug]/+page.svelte` (~lines 505–645), `+page.server.ts` (drop `keyItems`, trip lists loads if unused elsewhere)
- Test: `tests/e2e/trip-overview.spec.ts`

**Interfaces:**
- Produces: `itineraryDensity: Writable<'compact' | 'details'>` (default `'compact'`, `localStorage` key `wp.itineraryDensity`, try/catch).
- `CompactDayRow` props `{ day: Day; href: string; plannedCount: number; travel: boolean }` → `Thu 18 [⇄]` … `N planned` (0 muted).
- Each phase = bordered card: LevelHeader (`size 'card'`, `href` Phase Detail, full phase notes) + days (Compact rows, or existing `DayCard` in Details). No phase lists, no trip lists, no Flights & stays, no `DayMetricToggle` on Overview. No phases → flat CompactDayRow/DayCard list.
- [ ] **Step 1: Failing e2e** — default shows compact rows with `N planned`; toggle Details → DayCards; reload keeps Details; day row → day; phase card header → Phase Detail; no `Flights & stays` text; no MiniListCard; no-phase trip shows flat rows.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; grep `tests/` for `Flights & stays`, `MiniListCard`, `day-metric`, Overview list selectors — fix.
- [ ] **Step 5: Visual** `pnpm verify:visual '/trips/{slug}'` @375 + 768, both densities (`--click`).
- [ ] **Step 6: Commit** `feat(#401): Overview itinerary Compact/Details with bordered phase cards`

### Task 11: Release gate

- [ ] **Step 1:** `pnpm check` (0 errors), `pnpm test:unit --run`, all `pnpm test:*` harnesses, `pnpm test:e2e:clean` — record counts.
- [ ] **Step 2:** `pnpm verify:visual` sweep: Overview (both densities), Phases, Phase Detail (menu open), day 1 — 375 + 768; send Scott the shots for the visual sweep.
- [ ] **Step 3:** Fresh-eyes cross-task review (svw:requesting-code-review) against both grill records.
- [ ] **Step 4:** Bump `package.json` to `3.3.0`; commit `chore: v3.3.0`. Deploy only on Scott's word; close #401 #391 on ship.
