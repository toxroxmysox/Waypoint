# App Audit #116 — Summary

> The app-wide UX / feature-architecture map + navigation dead-end audit. Closes task #4.
> Full state lives beside this file: `charter.md` (what was judged), `progress.md` (resume ledger),
> `findings.json` + `v2/findings-v2.json` (every finding + disposition), `v2/explorations/` (6 deep
> dives), `index.html` + `v2/index.html` (reports). Research deliverable — **no PR**.

## Scope

Whole app, both modes (Planning + Trip), organized by lifecycle phase (planning / trip / post-trip /
cross-phase). Judged against a signed **charter**: Waypoint is the one home for a group trip
(Plan → Collaborate → Execute → Remember); the **one job** is that nothing about the trip ever forces
a member back to the Doc / Sheet / Splitwise / group-text stack. Public front doors
(invite / join / archive) in scope; `/api/*` + auth plumbing are in the graph but not findings-eligible.

## Method

- **Dual lens, falsifiable.** Every finding carries a **mechanical** axis (orphan route / one-way
  street / shipped-but-unreachable / missing link — code-verified) or a **vision** axis (fails ≥1 of
  V1 forces-old-stack, V2 silences-contributor, V3 drops-at-a-seam). No vibes, no composite scores —
  a decision per finding.
- **Four panel lenses:** novice (Scott's mother — no hidden gestures), power, code (route/graph
  mechanics), designer (IA coherence).
- **Code is source of truth.** `routes.json` (37 pages + 7 endpoints) + `edges.json` (full nav graph)
  + 4 Mermaid diagrams + a **44-scenario task-path suite** walked through the real graph + 12 dogfood
  screenshots (375px, live active-trip states).
- **Two passes:** a descriptive map (WP-A), then a blind multi-agent **fleet deep-review** (WP-B) that
  re-verified every WP-A finding and ran 6 architectural explorations.

## What was found

- **WP-A (descriptive):** 25 findings — 5 P1, 11 P2, 9 P3. Task-path suite: 17 clean / 10 findable /
  6 slow / 5 lost / 4 gap / 2 cite-unbuilt.
- **WP-B (fleet re-verify):** of the 25 WP-A, **16 confirmed / 8 amended / 1 refuted**; **27 new
  findings** (15 fleet-verified). New P1s: suggestion fire-and-forget, quick-add ejects to Planning
  (3 blind witnesses), offline = doc-bytes only, `isTripActive` UTC-vs-trip-tz, no mode pill at
  900–1279px.
- **6 explorations** (`v2/explorations/`): **landing-map** (74 post-actions, 4 sound conventions +
  the traveler-suggestion black hole), **layers** ("the middle layer is the excess"), **pathways**
  (10 unowned-seam proposals), **empty-states** (the trip-home teaching state is unreachable dead
  code), **terminology** (2 avoid-list violations), **desktop** (2 of ~24 routes have purpose-built
  rail; no mode toggle at iPad-landscape).
- **Doc hygiene:** live-doc lies fixed inline — CONTEXT.md (trip status is *derived*, not a stored
  field (D6); nav roster; mode-switch labels; new Assignment + Ghost Card terms), SPEC §Offline
  corrected, CARD_CONTENT_SPEC card-avatar reversal.

## Where it all landed

Every WP-A + WP-B finding carries a disposition — **0 open in both findings files.**

**6 PRDs (feature/planned)** + 3 ADRs:

| PRD | Issue | Doc | ADR |
|---|---|---|---|
| Replanning doors + weighted Now | #166 | `TRIP_REPLANNING_PRD.md` | — |
| Trip Wrap-up + closeout/publish | #195 | `TRIP_WRAPUP_PRD.md` | — |
| Contribution loop (votable Ghost Cards) | #202 | `TRIP_CONTRIBUTION_PRD.md` | 0009 |
| Offline (read-only active trip) | #203 | `OFFLINE_PRD.md` | 0010 |
| Item Assignment (card avatars) | #210 | `ITEM_ASSIGNMENT_PRD.md` | 0011 |
| Trip-Mode Money + booked-moment capture | #211 | `TRIP_MONEY_PRD.md` | — |

**25 direct issues** (bug / enhancement / refactor + afk):
- **#167–180** (14) — activation tz, mode toggle (900–1279px), quick-add eject, `+error.svelte`,
  moveItem desync, clone, export round-trip, role matrix, settings-by-role, inbox edit-and-approve,
  nav paper-cuts, auth gaps, account/bell.
- **#196–200** (5) — phase-delete orphans, trip-mode nav coherence, plan-vs-budget, done-counter,
  item-findability lens.
- **#204–209** (6) — overview chip, codes in Docs, leave-trip, swipe mirror, archive→import, remove
  Print.

**Exploration appetite → SPEC_BACKLOG** (`Exploration backlog (#116 app audit)` section): Plan-merge IA
refactor + Money/Today IA + 9 pathway seam-closers + landing / empty-state / desktop / terminology
polish batches. **ES-1** (unreachable first-run hero) → commented onto **#111**.

## Outcome

The one-job lens held. The audit's heaviest findings all trace to a moment the app would hand a member
back to the old stack — a suggestion that vanishes (group text), an offline boarding pass that isn't
there (email folder), a money story that never closes (the Sheet). Those became the six PRDs.
Everything mechanical became a labeled afk issue; everything speculative became a backlog entry that
persists. Nothing was filed twice (a double-file was caught and consolidated), and a silent
`aggregate-v2.mjs` disposition-wipe bug was found and patched mid-audit.

**#116 complete** — every finding dispositioned, all 6 explorations appetite-walked.
