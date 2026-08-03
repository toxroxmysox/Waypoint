# v5 — "Feels Native" · Roadmap & Priority Sequence

> **Written 2026-08-03** (decisions locked same day). Milestone: [`v5 — Feels Native`](https://github.com/toxroxmysox/Waypoint/milestone/3) · 21 issues.
> Source: the #360 UX audit vs iOS conventions (code sweep + round 2 + adversarial review + live pass), plus #353.
> Sequencing = **shared-file batching × dependency × cheapness**. Waves are a queue, not a calendar.

## The thesis

v2–v4 built the app. Every capability the Map calls 🔴-gap has now shipped — Money Units (`0050`), Trip Memory (`0058`), Email Digest (`0060/0061`), soft-trip / optional dates (`0062`), Scenarios + Decisions (`0063–0066`), Availability (`0067`). The frontier is no longer *what the app does*. It's that a friend who installs it to their home screen can still tell it's a website: taps don't respond, sheets don't drag, navigation feels dead, a mis-tap eats a half-typed expense.

**v5 closes exactly that gap and nothing else.** No new capability. No schema. The one rule for scope creep here: if it needs a migration, it isn't v5.

---

## Wave 0 — Hotfix (ships alone, does not wait for the milestone)

| # | What | Mode |
|---|---|---|
| **#379** | ~~P1 — page goes tap-dead after closing any BottomSheet.~~ **NOT A DEFECT — closed 2026-08-03.** The ghost overlay only appears in a hidden tab: Svelte 5 completes transitions from a `requestAnimationFrame` loop, and the browser pane runs at `visibilityState: hidden` with **0 rAF ticks/s**, so the outro never completes while the WAAPI animations still reach their end state off the document timeline. Foreground users were never affected. Shipped a regression guard instead. | done |
| **#380** | ✅ **SHIPPED 2026-08-03.** FAB occluded the last scroll row. Measured at 375px: 40×56px overlap with the last day card. `FAB.svelte` now emits its own 4.5rem inset in normal flow — one component fix covering all six consumers. Re-measured: 32px clear gap. | done |

**#379 outcome:** no app change. Every load-bearing claim in the issue was disproved — only ONE sheet instance mounts (each dual-render copy has its own `$state`, so the hidden copy never opens), the ghost wrapper is in the *visible* tree, and all animations reported `playState: 'finished'`. A guard spec written at `reducedMotion: 'no-preference'` against a production build **passed on unfixed code**. The real variable is tab visibility. Full evidence on the issue.

**Consequence for Wave 2:** the portal refactor is no longer a bug fix, so judge it on its own merits when the sheet work starts — it is still the better mount for drag-to-dismiss (#365) and the dirty guard (#370), just not urgent.

**Method scar (recorded in `.wolf/cerebrum.md`):** the browser pane reports `visibilityState: hidden`. Any finding about animation, transition, timer, or lifecycle behaviour observed there must be re-confirmed somewhere with a live rAF loop before being filed as a defect.

**Also in this wave (not audit work): production is 20 commits / 3 weeks stale — VERIFIED 2026-08-03.** The box has no `README.md`, no `scripts/verify-visual.mjs`, no `#340` places fix, and no `src` file newer than 07-12; container uptime 3 weeks. So prod is still `70d223a` and the backend bug batch (**#338** members TOCTOU, **#339** DST parity, **#340** places error laundering — `security`, **#354**) plus CI has never shipped. Deploy those together with Wave 0 rather than in a separate push.

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
3. **#365** — grabber handle + drag-to-dismiss. An open sheet swallows back/edge-swipe (decision 3 below).
4. **#370** — dirty guard. A half-typed expense currently dies on one mis-tap above the sheet, while page-hosted forms got full `beforeNavigate` protection. The most daily-driven form in the app has the least.
5. **#367** — replace `confirm()` in the item-form unsaved-changes guards with the in-app dialog built in step 4. Ordered last because it *consumes* #370's pattern.

Sheets are the modal on mobile per house rule, so one component fix lifts every flow in the app.

---

## Wave 3 — Navigation model (afk, but verify as a set)

- **#361** — back chevron becomes hierarchical "up". Deletes `nav-depth.ts` + the #235 `markReplaceNavigation` machinery; `backHref` becomes mandatory on every NavBar `back` call site. Wide blast radius, but the audit verified `backHref` is already present everywhere — this is mostly a delete. **Closes the long-standing #349 complaint.**
- **#362** — skip `startViewTransition` on `navigation.type === 'popstate'`, ending the double animation on iOS swipe-back. Verify the drill-up pairing *after* #361 lands.
- **#378** — DayNav swipe needs the axis-dominance guard `SwipeDeck` already has; today a diagonal scroll jumps days.

---

## Wave 4 — Perceived performance

- **#363** — *the single biggest "feels unpolished" gap in the sweep.* Blocking server `load` everywhere, `navigating` referenced nowhere, and the VT wrapper freezes the screen for the whole round-trip. **Scoped to the global bar only** (decision 2 below); skeletons deferred to a future issue.
- **#364** — optimistic checklist toggle. Highest-frequency interaction in the app; every tap is dead for the full tunnel latency. Sweep the other round-tripping toggles (votes, item status) in the same pass.
- **#372** — resume revalidation on `visibilitychange` after >60s hidden. Decided in (decision 1 below).

---

## Wave 5 — Gesture & long tail

- **#371** — pinch-zoom + pan + double-tap in `DocumentLightbox`. P2 by impact (boarding pass at the gate, first touch, possibly offline) but the largest single build in the milestone — a real gesture engine, not a prop. Hence last.
- **#376** — SwipeDeck commits on distance only; a fast 60px flick snaps back and reads as "the app ignored me." Add velocity-or-distance.
- **#377** — PlacesAutocomplete stale-response race (no abort / latest-wins) + the literal `"..."` loading string.
- **#353** — whole-card drag + full-width cards, **long-press (~200ms)** (decision 4 below).

---

## Not in v5 (parallel tracks, don't let them slip in)

| Track | Why separate |
|---|---|
| **#348** — can't assign on create (`Failed to fetch`) | Live bug, unrelated theme. PM statically narrowed it to the redirect-destination load, not the write. Needs a clean isolated :8097 repro — do it when nothing else is mid-flight. |
| **#359** — lint debt (439 prettier, 753 eslint) | Infra. Blocks promoting CI's `lint` job to a hard gate. ~500 of 753 are goja-runtime idioms in `pb_hooks` that need scoping, not fixing. Own PR, any time. |
| **#352** — invite a past co-traveler without their email | `feature` + a real **privacy** dimension (discoverability of past co-travelers). Needs a grill before any schema. Post-v5. |
| **SPEC_BACKLOG frontier** | Goal→"Plan this", tri-state booking pill, self-leave UI, receipt-on-expense, Weather, Calendar webcal, Maps deep-link, IA merges. Post-v5 — v5 explicitly ships no new capability. |

**Board hygiene:** ✅ done 2026-08-03 — three merged branches pruned local + remote; `main` is the only branch.

---

## Decisions — ALL FOUR LOCKED (Scott, 2026-08-03)

Full contracts are on each issue as a comment; these are the one-liners.

1. **#372 — resume-freshness is IN.** `visibilitychange` → `invalidateAll()` when the document was hidden longer than **60s**. Silent, keeps scroll, no gesture. Under 60s (app-switch blink) do nothing. Pull-to-refresh explicitly rejected.

2. **#363 — the global bar ONLY; skeletons deferred.** 2px top bar off `navigating`, ~150ms delay, above the view-transition snapshot. A plain 2px moss (`--color-accent`) bar — **no logo, no brand mark** (considered and rejected: nav feedback fires on every tap and should stay near-subliminal). Streamed loads + per-route skeletons are a *future* issue, not this one.

3. **#365 — yes, an open sheet swallows back/edge-swipe.** Push a history entry on open, close on popstate, pop it on any other dismissal. Must not trigger a page view transition (see #362).

4. **#353 — long-press (~200ms) to drag.** Grip retires, cards go full-width, **keyboard reorder must survive**. Accepted cost: ~200ms on every intentional drag; fallback if it reads sluggish is the movement-threshold variant — do not build both. Verify by real touch-drag at 375px (#201/#234 scar).

**Zero decisions outstanding in the milestone.** Every one of the 21 issues is `afk` and dispatchable.

---

## Sequencing principles applied here

1. **Ship the P1 alone and immediately.** A milestone is not a reason to leave a tap-dead trap in production.
2. **Batch by file, not by theme.** Four issues touch `BottomSheet`; five touch the control layer. Fighting merge seams costs more than the fixes.
3. **Cheap-and-decisionless first.** Wave 1 is the whole "the app responds to me" feeling for a fraction of the effort of Wave 5.
4. **Serialize the one-file waves, parallelize the rest.** Wave 1a‖1b, then 2‖3, then 4, then 5.
5. **Decisions are locked up front.** All four were resolved 2026-08-03; nothing in the milestone waits on Scott.
6. **No migration in v5.** That is the scope-creep tripwire.
