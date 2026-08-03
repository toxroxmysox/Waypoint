# v5 — "Feels Native" · Roadmap & Priority Sequence

> **Written 2026-08-03.** Milestone: [`v5 — Feels Native`](https://github.com/toxroxmysox/Waypoint/milestone/3) · 21 issues.
> Source: the #360 UX audit vs iOS conventions (code sweep + round 2 + adversarial review + live pass), plus #353.
> Sequencing = **shared-file batching × dependency × cheapness**. Waves are a queue, not a calendar.

## The thesis

v2–v4 built the app. Every capability the Map calls 🔴-gap has now shipped — Money Units (`0050`), Trip Memory (`0058`), Email Digest (`0060/0061`), soft-trip / optional dates (`0062`), Scenarios + Decisions (`0063–0066`), Availability (`0067`). The frontier is no longer *what the app does*. It's that a friend who installs it to their home screen can still tell it's a website: taps don't respond, sheets don't drag, navigation feels dead, a mis-tap eats a half-typed expense.

**v5 closes exactly that gap and nothing else.** No new capability. No schema. The one rule for scope creep here: if it needs a migration, it isn't v5.

---

## Wave 0 — Hotfix (ships alone, does not wait for the milestone)

| # | What | Mode |
|---|---|---|
| **#379** | **P1 — page goes tap-dead after closing any BottomSheet.** Ghost `fixed inset-0` overlay never unmounts (AppShell dual-render + WAAPI never firing `finished` in a `display:none` subtree). Every sheet flow in production is a trap. | afk |
| **#380** | FAB occludes the last scroll row (trip overview, day view). Trivial `pb-24`; rides along. | afk |

**Fix direction for #379 — decided:** ship **option 1** (hidden copy gets `duration: 0` via AppShell context) as the hotfix. It is targeted and low-risk for a same-day deploy. **Option 2 (portal overlays to a single body-level outlet) is not dropped** — it becomes the opening move of Wave 2, where the sheet is being rebuilt anyway and the refactor pays for itself across four issues instead of one.

**Regression guard is mandatory:** one Playwright spec at `reducedMotion: 'no-preference'` that closes a sheet and asserts a tap behind it lands. The entire E2E suite currently runs in the one configuration that cannot reproduce this class of bug.

**Also in this wave (not audit work):** confirm what is actually deployed. Last *recorded* deploy is `70d223a`; `main` is now `d081444` — the backend bug batch (#338/#339/#340/#354) and CI (#341/#342) may be unshipped. Verify, then deploy Wave 0 on top.

---

## Wave 1 — Touch & forms (two AFK PRs, run in parallel)

Cheapest work in the milestone, zero decisions, the highest felt-value-per-line in the set. This is what makes the app respond.

**1a · Press & hit targets** — one PR, one pass over the control layer
- **#369** — Tailwind v4 compiles `hover:` inside `@media (hover: hover)`, so **every hover style in the app is inert on iPhone**, and `Button`/`BottomNav`/NavBar-back have no `active:` state. Zero authored press feedback on the primary surface. Add `active:` states, manage `-webkit-tap-highlight-color`. (`Card`/`FAB` already do it right — copy them.)
- **#366** — sub-44pt targets: sheet/toast/banner dismiss X, `Button` sm/md, DayNav arrows, lightbox toolbar. Extend hit areas without changing visuals.

Same files (`Button`, `BottomSheet`, `Toast`, `DayNav`, `NavBar`) — batching them is what keeps Wave 2 and Wave 3 from fighting merge seams later.

**1b · Forms & keyboard** — one PR, independent files
- **#368** — `inputmode="decimal"` on 9 amount fields, `enterkeyhint` app-wide.
- **#374** — OTP auto-submit on the 6th digit (login, join, invite).
- **#375** — server-action failures: `scrollIntoView` + focus the `role=alert`; reuse the existing `validate-form.ts` focus path where the server names a field.

---

## Wave 2 — BottomSheet, rebuilt (serialized, ONE owner, one branch)

Four issues touch one file. Do not parallelize this — dispatch it as a single chained session.

1. **Portal refactor** (#379 option 2) — single body-level overlay outlet owned by the root layout. Kills the dual-render hang class for *all* overlays, and gives the drag work a sane mount.
2. **#373** — `overscroll-contain` on sheet content, body scroll-lock while any sheet/lightbox is open.
3. **#365** — grabber handle + drag-to-dismiss. **Decision needed** (see below): does an open sheet swallow popstate?
4. **#370** — dirty guard. A half-typed expense currently dies on one mis-tap above the sheet, while page-hosted forms got full `beforeNavigate` protection. The most daily-driven form in the app has the least.
5. **#367** — replace `confirm()` in the item-form unsaved-changes guards with the in-app dialog built in step 4. Ordered last because it *consumes* #370's pattern.

Sheets are the modal on mobile per house rule, so one component fix lifts every flow in the app.

---

## Wave 3 — Navigation model (afk, but verify as a set)

- **#361** — back chevron becomes hierarchical "up". Deletes `nav-depth.ts` + the #235 `markReplaceNavigation` machinery; `backHref` becomes mandatory on every NavBar `back` call site. Wide blast radius, but the audit verified `backHref` is already present everywhere — this is mostly a delete. **Closes the long-standing #349 complaint.**
- **#362** — skip `startViewTransition` on `navigation.type === 'popstate'`, ending the double animation on iOS swipe-back. Verify the drill-up pairing *after* #361 lands.
- **#378** — DayNav swipe needs the axis-dominance guard `SwipeDeck` already has; today a diagonal scroll jumps days.

---

## Wave 4 — Perceived performance (decision-gated)

- **#363** — *the single biggest "feels unpolished" gap in the sweep.* Blocking server `load` everywhere, `navigating` referenced nowhere, `Skeleton` on exactly one route despite it being the declared house pattern, and the VT wrapper freezes the screen for the whole round-trip. **Needs a remedy decision** (below).
- **#364** — optimistic checklist toggle. Highest-frequency interaction in the app; every tap is dead for the full tunnel latency. Sweep the other round-tripping toggles (votes, item status) in the same pass.
- **#372** — resume revalidation on `visibilitychange`. **Needs an in/out decision** (below).

---

## Wave 5 — Gesture & long tail

- **#371** — pinch-zoom + pan + double-tap in `DocumentLightbox`. P2 by impact (boarding pass at the gate, first touch, possibly offline) but the largest single build in the milestone — a real gesture engine, not a prop. Hence last.
- **#376** — SwipeDeck commits on distance only; a fast 60px flick snaps back and reads as "the app ignored me." Add velocity-or-distance.
- **#377** — PlacesAutocomplete stale-response race (no abort / latest-wins) + the literal `"..."` loading string.
- **#353** — whole-card drag + full-width cards. **hitl, decision-gated** (below).

---

## Not in v5 (parallel tracks, don't let them slip in)

| Track | Why separate |
|---|---|
| **#348** — can't assign on create (`Failed to fetch`) | Live bug, unrelated theme. PM statically narrowed it to the redirect-destination load, not the write. Needs a clean isolated :8097 repro — do it when nothing else is mid-flight. |
| **#359** — lint debt (439 prettier, 753 eslint) | Infra. Blocks promoting CI's `lint` job to a hard gate. ~500 of 753 are goja-runtime idioms in `pb_hooks` that need scoping, not fixing. Own PR, any time. |
| **#352** — invite a past co-traveler without their email | `feature` + a real **privacy** dimension (discoverability of past co-travelers). Needs a grill before any schema. Post-v5. |
| **SPEC_BACKLOG frontier** | Goal→"Plan this", tri-state booking pill, self-leave UI, receipt-on-expense, Weather, Calendar webcal, Maps deep-link, IA merges. Post-v5 — v5 explicitly ships no new capability. |

**Board hygiene:** three merged remote branches to prune — `chore/ci-and-docs-341-342`, `fix/backend-bug-batch-338-339-340`, `fix/355-day-card-headline`.

---

## Decisions needed from Scott (4)

Each blocks only its own wave; nothing before Wave 4 waits on these.

1. **#372 — is resume-freshness in or out?** "No realtime" (vision) ≠ "stale on resume." An installed PWA has no reload chrome and no pull-to-refresh; reopening after hours shows stale data until you happen to navigate.
   **Recommend: in.** `visibilitychange` → `invalidateAll()` when hidden longer than ~60s. Silent, keeps scroll, no gesture to teach. *Not* pull-to-refresh — custom gesture machinery that fights scroll and feels un-iOS in standalone.

2. **#363 — which remedy?** (a) streamed loads + skeletons on hot drill-downs, (b) global thin progress bar off `navigating` after a ~150ms delay, (c) both.
   **Recommend: (c), in that order — bar first.** The bar is one file and covers every route immediately; skeletons are per-route work best aimed at day/item/money once real tunnel latency is measured.

3. **#365 — with a sheet open, should iOS edge-swipe close the sheet instead of navigating the page away underneath it?** (Implementation: push a history entry on open, close on popstate.) Matches Android's back-button convention; on iOS it's genuinely debatable.
   **Recommend: yes.** Navigating the page away *underneath* an open sheet is the worse of the two surprises.

4. **#353 — interaction model for whole-card drag** (the card body is an `<a>`, so press-to-drag must be discriminated from tap-to-open): long-press (~200ms, iOS-home-screen familiar, adds latency to every drag) vs. movement-threshold (>6px arms drag, cancels navigation). Keyboard reorder must survive either.
   **No recommendation — this is a feel call.** Worth 10 minutes of grilling before anyone writes code.

---

## Sequencing principles applied here

1. **Ship the P1 alone and immediately.** A milestone is not a reason to leave a tap-dead trap in production.
2. **Batch by file, not by theme.** Four issues touch `BottomSheet`; five touch the control layer. Fighting merge seams costs more than the fixes.
3. **Cheap-and-decisionless first.** Wave 1 is the whole "the app responds to me" feeling for a fraction of the effort of Wave 5.
4. **Serialize the one-file waves, parallelize the rest.** Wave 1a‖1b, then 2‖3, then 4, then 5.
5. **Decisions are flagged, not blocking.** Waves 0–3 (15 of 21 issues) need nothing from Scott.
6. **No migration in v5.** That is the scope-creep tripwire.
