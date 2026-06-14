# Audit Charter — Issue #116

> App-wide UX / feature architecture map + navigation dead-end audit.
> Agreed between Scott and the audit session, 2026-06-11. This document gates Phase 2.
> Research label: deliverables are this charter, the HTML report, PRDs/issues — **no PR**.

---

## 1. Vision (refined in this grill — supersedes SPEC.md §1 phrasing)

**Waypoint is the one home for a group trip.** It replaces the Doc/Sheet/Splitwise/group-text
stack with a single place where a small circle of friends and family **plans** the itinerary,
**decides** together, **executes** the trip live, and **keeps the record** after. Built by Scott
for Scott & Abby's trips — but it only works if the non-technical people in the group actually
use it.

**The one job:** nothing about the trip should ever force anyone back to the old stack. Every
time a member opens a Google Doc, checks Splitwise, or scrolls the group text for a confirmation
number, Waypoint has failed at its job.

**Four pillars, one lifecycle:** Plan → Collaborate → Execute → Remember. Collaboration isn't a
phase — it runs through the other three.

**Quality bar:** polished enough that a non-technical friend contributes without being taught;
structured enough that nothing is lost across the seams (planning→trip day, trip day→record).

**Scale invariant:** works for a solo trip and for a group of 12+. No feature may assume a group.

### Explicitly NOT the job
- **Not a discovery/inspiration tool** — finding what to do in a city is TripAdvisor's job.
- **Not a photo album** — Memory is one photo + one thought per member per day, a curated
  highlight, never a dump.
- **Not a messaging platform** — iMessage/WhatsApp keep group chat; Waypoint holds the artifacts.
- **People-first, not AI-forward** — no AI-generated itineraries (also in CLAUDE.md off-the-table).
- **Not real-time** — no live-sync UX; a vision stance, not just a tech constraint. Findings
  proposing realtime are dead on arrival.
- Plus CLAUDE.md off-the-table: multi-currency, push notifications, embedded maps, native apps.

---

## 2. Decisions made in this grill (audit must respect; CONTEXT.md updated where noted)

| # | Decision | Consequence for findings |
|---|----------|--------------------------|
| D1 | **No collaboration home — intentional.** Contribution surfaces (goals, swipe, votes, suggestions) stay contextual, scattered by design. Solo↔12+ range demands it. | Discoverability of each surface judged individually; ceiling P2/P3. The *absence of a hub* is not a finding. |
| D2 | **First five minutes is a known gap** (open issue exists). Post-join landing experience is unspecified in any doc. | Treat "contributor's first five minutes" as a first-class task-path; findings here are real, likely P1/P2. |
| D3 | **Light Replanning boundary is temporal: today vs. any other day.** Quick-add for today, parking-lot promote, reorder/skip/swap today → must work inside Trip Mode. Touching tomorrow → Planning Mode; the mode pill is a working door there. Captured as CONTEXT.md glossary term. | Trip-Mode findings where the answer is "switch modes": dead end if the task is today-scoped, working door if future-scoped. |
| D4 | **Doors open proactively.** Free-time Focus and skipped/cancelled items are THE replanning entry states; they should surface parking-lot ideas unprompted. Promotes backlog's "Ideas from Free Time" to charter requirement. | Absence of these doors = seam gap (test V3), not polish. |
| D5 | **Wrap-up is a missing third derived state.** `end_date < today && status == active` should render a closing sequence (settle → closeout incl. memory review → archive decision), flipped automatically but **quiet** — findable when sought, leading once found, never nagging. Group moment (per-member settle + memory review); closeout wizard itself may stay owner-gated. | Today's silent revert to Planning Mode is a pre-agreed P1 vision gap. **Feature-sized: Phase 3 routes this to grill→PRD, not a quick issue.** |
| D6 | **Doc taxonomy: live vs record.** Live docs must track code (CONTEXT.md, SPEC.md nav/permissions, design-system.md, anatomy); records are point-in-time (PRDs, ADRs, plans). | Report gets a doc-hygiene appendix; every mismatch captured; live-doc lies get fixed, records stay history. |

---

## 3. Dual lens + falsifiable tests

Every finding carries an axis and must pass its test:

**Mechanical** (code-verified, never vibes):
- M1 orphan route (no inbound link) · M2 one-way street (no way back/out) ·
  M3 shipped-but-unreachable feature · M4 expected-but-missing link.

**Vision** (fails ≥1 of three tests):
- V1 **forces someone back to the old stack** (email for the PDF, Splitwise for debts, group text for opinions)
- V2 **silences a contributor** who had something to add
- V3 **drops something at a seam** (planning→trip day, trip day→record)

**Intentional (not a finding):** documented in SPEC_BACKLOG, a PRD deferred-list, an ADR,
CLAUDE.md off-the-table, the NOT-list above, or decisions D1–D6. Cited, not flagged.

## 4. Panel lenses

Findings generation runs all four; each finding records which lens caught it:
- **novice** — Scott's mother. No hidden gestures, no hover-only affordances, nothing
  learned-by-exploring. If it isn't visibly a button, it doesn't exist. This lens answers the
  quality bar.
- **power** — expert who expects deep links, keyboard, minimal taps, efficiency.
- **code** — route/graph mechanics: orphans, dead actions, unreachable states.
- **designer** — IA coherence, hierarchy, consistency vs design-system.md and the domain model.

## 5. Severity

- **P1** — breaks the one job on a critical path: mid-trip dead end, front-door
  (invite/join/archive) failure, contributor-silencing gap, seam drop.
- **P2** — feature shipped but buried/undiscoverable; workaround exists but it's the old stack.
- **P3** — friction, inconsistency, polish.
- No composite scores anywhere. Decisions per finding, not grades.

## 6. Scope

- **Whole app, both modes**, organized by **lifecycle phase**: `planning` | `trip` | `post-trip`
  | `cross-phase` (seams, mode switching, account/avatars, shell). Bounded context
  (CONTEXT.md names) is a tag, not the spine.
- **Graph includes, findings exclude:** `/api/*`, dev-login, auth plumbing — edges in the graph,
  never UX findings. Public surfaces (`/invite/[code]`, `/join/*`, `/archive/[token]`) ARE
  findings-eligible — they're the non-technical friend's front door.
- **Backlog-aware:** before flagging "missing," check SPEC_BACKLOG + PRD deferred lists. Deferred
  ≠ gap. Shipped-but-unreachable = exactly the point.
- Depth varies by maturity: stable contexts get full dual-lens; fresh v4 surfaces (Documents,
  Goals, Swipe, Avatars/account, lists, join) audited as-shipped with extra backlog care.

## 7. Doc precedence (when sources disagree)

1. **Code** (`src/routes/`, nav chrome) — what exists. 2. **CONTEXT.md** — terms.
3. **ADRs 0001–0008** — locked decisions. 4. **SPEC_BACKLOG + PRD deferred-lists** — sequencing.
5. **PRDs** — intent (*why*), point-in-time. 6. **SPEC.md** — v1 foundation, stale on nav/Vault.
7. **CLAUDE.md / .wolf** — operating rules.

Known stale (capture in doc-hygiene appendix): SPEC.md nav + Vault permission rows;
CONTEXT.md "not yet built" annotations vs existing routes (verify each in code first);
OpenWolf anatomy.md predates v4 routes.

## 8. Output contract

**Primary deliverable:** self-contained HTML report at `docs/app-audit/index.html`
(Mermaid + styles inline/CDN; opens locally).

Report structure, in order:
1. **Charter** (this document, condensed) — the reader sees what's being judged.
2. **Nav graph** — Mermaid, interactive (pan/zoom or expand-per-phase), code-derived:
   every page, every server action, every edge (`<a href>`, `goto()`, `redirect()`, form
   actions, nav chrome: `nav-tabs.ts`, `BottomNav`, `SideRail`, `ContextRail`, `SubTabs`).
3. **Task-Path walkthroughs** — the scenario suite (§9): intent → expected path → actual
   shortest path → tap count → wrong-guess points → verdict (clean / findable-but-slow / lost).
4. **Findings** — filterable cards (phase, axis, severity, context, lens). Each: what/where
   (route + file:line), why (which test failed), proposed fix.
5. **Doc-hygiene appendix** — mismatch table + live/record classification per doc.
6. **Machine-readable block** — `<script type="application/json" id="findings-data">` with the
   full findings array. Phase 3 files issues from this data, not re-derived prose.

**Findings schema:** `id` (WP-A-###, stable) · `phase` · `context` · `axis` · `severity` ·
`lens` · `where` (route + file:line) · `what` · `why` (test id) · `fix` ·
`disposition` (empty until Phase 3: issue | prd | intentional | wontfix).

**Persistence rule:** working state lives on disk from the start — this charter, then
`routes.json` (inventory), `edges.json` (nav graph), `findings.json`, screenshots under
`docs/app-audit/`. The HTML is *generated from* those files. Any fresh session resumes from the
directory; losing the conversation loses nothing.

## 9. Task-path scenario suite (panel walks each through the real graph)

Personas: N = novice, P = power. Each scenario records taps, wrong-guess points, verdict.
(Expanded post-sign-off 2026-06-11 with Scott's seven scenarios + seven gap-fillers; numbering final.)

**Planning**
1. (N) When is our flight? — fastest path to flight details from trip home
2. (N) Add an idea I'm not sure about yet — parking-lot capture
3. (N) Invite Jake — traveler-initiated invite
4. (N) Say what I'm excited about — newly joined member contributes (goals / swipe / votes)
5. (N) **First five minutes** — invite link → authed → oriented (D2)
6. (P) What still needs booking? — booking Smart List
7. (N) Attach the hotel confirmation PDF — Documents upload, item-scoped
8. (P) Can we afford this? — budget status vs plan
9. (P) Plan day 3 of the Paris phase — day view, phase nav
10. (N) What does everyone else want to do? — browse goals + votes
11. (N) Heard about a restaurant from a friend — add several meal options to ONE city's
    parking lot (phase-scoped capture, multiple items in a row)
12. (N) How busy is that day? — glanceable day density ("are we walking a lot, what's the
    pace") without opening every item
13. (N) Pre-departure sweep — is anything unbooked that *should* be booked before we go?
    (novice phrasing of the Booking Readiness projection; overlaps #6 deliberately — different
    persona, different entry point)
14. (P) Add MY flight details and see how they line up with other people's flights
    (per-member flights on a shared itinerary — comparison view)
15. (P) Booked the rental car — add one booking whose details span DIFFERENT phases
    (transportation bridging phases, CONTEXT.md says it can)
16. (N) Discuss an idea before committing — comment on an item, see the reply
17. (P) Trip dates changed — extend/shift the trip; what happens to days and planned items?

**Trip (active, phone, one-handed)**
18. (N) What's next right now? — Now view
19. (N) Find the boarding pass — Documents, offline path
20. (N) Add dinner expense and split it — from Trip Mode
21. (N) Tonight fell through — replan from parking lot (D3/D4: must not leave Trip Mode)
22. (N) Quick-add a coffee stop for today (D3: must not leave Trip Mode)
23. (N) Where's the hotel address? — ongoing multi-day item detail
24. (P) Check tomorrow's plan — read-only future view from Trip Mode (boundary check)
25. (N) Check off a packing-list task
26. (N) Save my favorite photo from today as a Memory — mid-day capture, not waiting for
    Note Before Bed
27. (N) Find the hotel confirmation CODE — text code on the item (`confirmation_codes`),
    not the PDF
28. (N) I'm offline on the plane — what can I actually see? (PWA offline surface)
29. (P) I want a paper copy of today — print path (print.css exists; is it reachable?)
30. (N) How are we doing on budget so far? — mid-trip money glance without leaving Trip Mode

**Post-trip**
31. (N) Who owes whom — settle up
32. (P) Mark what we actually did — closeout entry + wizard
33. (P) Did we do what we set out to? — goals review at closeout
34. (N) Add my memory of day 2 retroactively
35. (N) Share the trip with grandma — archive publish + link
36. (P) Start next year's trip from this one — clone
37. (P) Export my data
38. (N) **The morning after end_date** — what does the app show? (D5)
39. (N) Share the recap with family **so they can do the trip themselves** — archive as a
    replicable itinerary for non-members (does any path lead from archive → their own trip?)

**Cross-phase**
40. (N) Switch modes and back — pill discoverability
41. (N) Change my name/avatar — /account reachability from where you'd expect
42. (N) Catch up on what changed since I last looked — Activity/inbox
43. (P) Leave a trip / remove someone — membership lifecycle surfaces
44. (N) I'm on several trips — land in the app and find the right one (trips list orientation)

## 10. Phase 3 protocol (HITL)

Walk findings with Scott; per finding, disposition ∈ issue | prd | intentional | wontfix.
Small/clear → file issue directly (`to-issues`, labels per docs/agents/triage-labels.md).
Feature-sized (D5 wrap-up state is pre-flagged) → grill→PRD before slicing. Scott confirms
every disposition before anything is filed. Also carry: process candidate — add task-path
checks to feature verification workflow.
