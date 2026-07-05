# Design — Candidate Scenarios (Ideation: scenario building)

> Status: **Designed 2026-07-03** (visual-companion brainstorm with Scott; board mockups in
> `.superpowers/brainstorm/81190-1783130738/content/`, final = `board-v3.html`).
> Capability: **Ideation** (`docs/CAPABILITY_MAP.md` §1) — realizes the 🔵 concepts *Proposal*,
> *Candidate Scenario*, *pros/cons* for the **Where** wedge.
> Depends on: **#270 forming state (ADR-0022)** — scenarios live on forming trips only.
> Siblings: #271 availability wedge (NOT built here; feeds the board later).

## Concept

A **scenario** is a pitch for what the trip could be — "going here, doing this" — weighed by the
group on a forming trip, with the winner promoting the trip out of forming. Champion-authored,
forkable, compared on a vertical board of rich cards.

## Data model

New `scenarios` collection (forming-trip children):

| Field | Type | Notes |
|---|---|---|
| `trip` | relation → trips | required, cascadeDelete |
| `title` | text | required — the pitch name |
| `pitch` | text ≤200 | optional one-liner |
| `champion` | relation → trip_members | required; author-owned (only champion edits) |
| `date_start` / `date_end` | date | **optional at create; both required to promote** |
| `budget_per_person` | number | **optional** (USD, rough). ⚠ PB numbers can't be null — unset stores as `0`; ALL reads must treat `0`/falsy as "no budget" (the #332/#335 scar), never render "$0" |
| `phase_sketch` | json | ordered `[{name, days}]` — durations, NOT real phase records (forming trips have no days) |
| `keystones` | relation → items, multi | anchor ideas; composer quick-create makes an unplanned item + attaches — one idea pool, no duplicate storage |
| `fork_of` | relation → scenarios | optional; lineage badge "⑂ fork of X" |
| `status` | select `candidate\|won\|archived` | archived = lost at promotion |

`scenario_votes` — mirrors `votes` (scenario / member / value select love·like·flexible·dislike,
unique `(scenario, member)`, weighted map reused from `src/lib/collaboration/voting.ts`).

`scenario_points` — pros/cons as comment-like entries: scenario / member / `kind: pro|con` /
`text ≤200`. Author-deletable only.

`decisions` — small append-only collection minted at promotion: trip / `payload` json (immutable
snapshot: every scenario incl. sketch + keystone labels, vote tallies, pros/cons, chooser, date).
Losing scenarios stay readable here forever.

**Permissions** (PB rules first): all trip members incl. viewers read everything; create scenario /
vote / add points = owner·co_owner·traveler as themselves (viewers read-only); edit/delete scenario
= champion only (fork instead of edit-war); votes/points self-only; decisions created by hook at
promotion, never client-written. Active-member checks append `&& removed_at = ""`.

## Comparability — converge over time

No up-front config. Dates, budget, phase sketch, keystones are all optional at authoring; once ANY
scenario fills a dimension, sibling cards render that section with a quiet empty slot ("no dates
yet" / "no sketch yet") — social pressure to flesh out a pitch, never a form to complete. Fixed
dimension set in v1 (no custom dimensions).

## Surface

**The scenario board IS the forming trip's home.** Rich cards, vertical scroll (chosen over aligned
grid + pitch deck + conversation-first in brainstorm). Card sections with quiet uppercase hairline
headers (per `board-v3.html`):

1. Title + champion + fork lineage
2. **When & how much** — date window + duration · budget/person (empty slots when unset)
3. **The shape of it** — the phase sketch as a miniature tiled strip (visual language of the #330
   day-strip editor, read-only, duration-labeled segments)
4. **Going here, doing this** — keystone idea chips
5. **The group** — vote avatar stacks (never numeric) + pro/con counts; #271 availability overlap
   joins this row when it ships

Tap card → detail sheet: vote buttons (4-option, "Pass" label for dislike), pros/cons list + add,
fork button (anyone), edit (champion). Composer: title first; dates, budget, sketch, keystones all
optional. Sketch editor keeps segment-days summing to the window when dates exist (auto-stretch
last segment); a fork that changes the window re-flags the sketch for the new champion.
Empty state: "Pitch the first scenario." Promotion flips home to the normal trip overview;
"How we decided" lives under More (reads the decision record).

## Promotion

Owner/co-owner taps **"Go with this one"** (votes inform, humans decide — no consensus math).
**Gate: the chosen scenario must have both dates.** Confirm sheet → cascade, server-side:

1. Trip dates set → ADR-0022 forming→dated promotion fires (days + Phase 1 seed).
2. `phase_sketch` (if present) becomes real dated phases via the existing tiling engine
   (`retilePhases` / `applyRetile`) — durations laid out from trip start.
3. Keystone items remain in the idea pool, flagged as chosen anchors.
4. `budget_per_person` (if present) seeds the trip budget.
5. Decision record minted; all other scenarios → `archived`.

One-way, like forming→dated itself.

## Out of scope (v1)

Availability polling (#271) · scenario chat/threading · custom/extra dimensions (lodging etc.) ·
consensus thresholds · AI anything · editing another champion's scenario · un-promoting.

## Testing

Vitest: sketch↔window normalization, promotion cascade planner (pure), converge slot derivation.
Rules harness: 3 new collections + decisions hook-only write. E2E: pitch → fork → vote+pros/cons →
promote → trip dated, phases match sketch, decision record readable, board retired.

## Decisions log (brainstorm 2026-07-03)

| Q | Decision |
|---|---|
| Bundle | Flexible bundle; fixed v1 dimension set; dates+budget optional at create, **dates required to promote** |
| Comparability | Converge over time — filled dimension grows empty slots on siblings |
| Authorship | Champion + fork with lineage |
| Surface | Comparison board, rich cards, vertical scroll, quiet section headers (not aligned grid / pitch deck / conversation-first) |
| Weighing | 4-option vote + pros/cons-as-comments; availability deferred to #271 |
| Promotion | Full cascade + immutable decision record; initiator (owner/co_owner) decides, informed |
| Placement | Board IS the forming home |
