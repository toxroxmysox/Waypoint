# PRD — Trip Mode Replanning Doors + Weighted Now View

> Owner: Scott Vanden Warsen
> Created: 2026-06-12 (from the #116 audit grill, charter decisions D3/D4, finding WP-A-005)
> Status: Approved (modules confirmed 2026-06-12)
> Supersedes: #121 (Now shows the whole day) and #154 (Now Slice B — weighted Focus view) — both closed into this PRD. Slice A (#153, state machine + loader) shipped and is the foundation.
> Glossary: [[Now]], [[Today]], [[Focus]], [[Parking Lot]], [[Light Replanning]], [[Item Status]] in CONTEXT.md.

## Problem Statement

Mid-trip plans break — a restaurant is closed, weather kills the hike, the group is tired. Today the app cannot answer "tonight fell through, what else could we do?" without leaving Trip Mode: the [[Parking Lot]] (the exact answer — the group's captured ideas, phase-scoped) is unreachable from Now, Today, and the Add sheet. The free-time Focus shows only a countdown to the next planned item. The result is a six-step mode-switching detour on a phone, mid-trip — or the group falls back to the group text, which is the failure mode Waypoint exists to eliminate.

Separately, the Now view is an interim layout (Slice A shipped the state machine; the view that renders it was #154): it shows only the immediate state, not the whole day. Scott's framing: **Now should show the whole day, with different weights than Today** — Today is the flat, equal-weight timeline; Now is the editorial, prioritized glance.

These are one surface: the weighted Now view is *where* the replanning doors live.

## Solution

Rebuild Now as the weighted whole-day view (#154's composition), and cut two proactive replanning doors into Trip Mode, honoring the [[Light Replanning]] boundary (today only — touching any other day stays Planning Mode's job, reached via the mode pill):

- **Door 1 — Ideas for now.** When the Focus is *free time* or *nothing else planned* — the two states where the need arises — the view surfaces the current phase's parking-lot ideas with one-tap promote-to-today. The system opens the door; nobody hunts for it.
- **Door 2 — Skip → replace.** A planned item on today can be *skipped*: it returns to the parking lot (status back to unplanned, day cleared — reversible, "maybe later in the trip"; the unhappened-forever verdict stays [[Closeout]]'s job). Skipping offers a replacement from the same phase's ideas; accepting one promotes it into the gap. Skip works without picking a replacement.

## User Stories

1. As a traveler whose evening plan fell through, I want to see our backup ideas right on the Now screen, so that we pick a replacement in seconds instead of re-planning from scratch.
2. As a trip owner during free time, I want the free-time card to show what we *could* do right now, so that idle gaps become the trip's best spontaneous moments.
3. As a trip owner, I want to promote a parking-lot idea onto today with one tap, so that committing to a spontaneous plan costs nothing.
4. As a trip owner, I want to skip tonight's planned item when it's not happening, so that the timeline reflects reality without me editing forms mid-trip.
5. As a trip owner skipping an item, I want to be offered a replacement from our ideas, so that the evening isn't just cancelled — it's re-planned.
6. As a trip owner, I want a skipped item to return to the ideas list rather than vanish, so that we can still do it later in the trip.
7. As a traveler opening Now, I want to see the whole remaining day at a glance — current thing large, next thing normal, later things muted — so that I know what's happening without reading a flat list.
8. As a traveler mid-activity, I want the Focus card to show the ongoing item with time remaining, so that I know how long we have.
9. As a traveler between activities, I want a countdown to the next item with ideas below it, so that free time is informed time.
10. As a traveler at day's end, I want a wrapped summary of what we did, so that the day closes with a sense of completion.
11. As a traveler on a day with an ongoing hotel stay, I want multi-day context as a slim banner (never the Focus), so that the persistent background doesn't bury what's happening now.
12. As a traveler, I want past items hidden on Now (they live on Today), so that Now is purely forward-looking.
13. As a traveler, I want to check off checklist tasks in place on Now, so that errands don't require a page change.
14. As a traveler, I want to tap any card to open the item detail, so that depth is one tap away while the glance stays clean.
15. As a viewer (read-only member), I want to see the same weighted view and ideas without promote/skip controls, so that I stay informed without being able to change the plan.
16. As a traveler (suggest-only role), I want to see the ideas strip and my votes on it, so that I can advocate for an idea even though committing it is the owner's call.
17. As a trip owner, I want promote and skip to respect the today-only boundary, so that Trip Mode never silently edits future days (that's Planning Mode, one pill-tap away).
18. As a group member, I want a just-promoted idea to appear on Today immediately and in everyone's next load, so that the plan change is the new shared truth.
19. As a trip owner who skipped an item by mistake, I want to promote it right back from the ideas strip, so that the action is fully reversible.
20. As a phone user, I want all of this one-handed at 375px — taps, no drags required — so that it works on a street corner.

## Implementation Decisions

- **One PRD, one surface.** The weighted Now layout (#154's composition, absorbed verbatim below) and the doors ship against the Slice-A state machine (`getNowViewState`). No changes to Today's layout beyond the skip affordance on its cards.
- **Now composition (top → bottom):** slim ongoing multi-day banner(s) (context only, never the Focus) → Focus card per state (ongoing + time remaining / free-time countdown / nothing-else-planned / wrapped summary) → next item at normal weight → remaining items in a new muted "later today" tier → "nothing else planned" tail row when empty ahead → checklists block (in-place check-off only). Past items hidden. Items read-only (tap → detail); the doors are the only mutating affordances.
- **`replan` module (new, deep, pure).** The testable core, no I/O: `ideasForToday(items, dayPhases)` (phase-scoped unplanned items); `promotePatch(item, todayDayId, dayItems, now)` (computes `{status: 'planned', day, sort_order}` placing the promotion after the current moment, reusing gap-based sort-order math); `skipPatch(item)` (planned → unplanned, day cleared). Door semantics = the day view's existing pull/push semantics, so drag (Planning) and doors (Trip Mode) can never disagree.
- **Skip returns to the parking lot, never to `considered`.** Reversible mid-trip; the "we never did it" verdict is assigned at Closeout, not in the moment.
- **Server actions** `?/promoteIdea` and `?/skipItem` on the Trip Mode routes — thin wrappers applying `replan` patches via PB. Progressive-enhancement forms, not client fetch.
- **Roles unchanged (SPEC §4):** promote/skip = item edits = owner/co-owner. Travelers see the ideas strip read-only with vote stacks; viewers see everything, mutate nothing.
- **Ideas strip ordering:** by aggregate vote score (the parking lot's existing sort), so the group's preference is the default suggestion order.
- **Skip entry points:** overflow action on the Today item card and on item detail. Skipping opens a bottom sheet (mobile pattern per project rules) listing same-phase ideas; "Just skip" requires no replacement.
- **Boundary enforcement:** doors operate exclusively on today (the [[Light Replanning]] temporal boundary). No future-day pickers anywhere in Trip Mode.
- **Tiers are a first-pass visual design** (Focus / next / muted later) — explicitly adjustable post-build at PR review, per #154.

## Testing Decisions

- Good tests assert external behavior (state in → patch/render out), never implementation details.
- **Vitest, dense:** the `replan` module — phase scoping of ideas (multi-phase boundary days), promote placement math (between anchored items, empty day, end of day), skip patch correctness, role-independence of the pure layer. Extended `now-state` selectors if they grow. Prior art: `now-state.test.ts`, `sort-order.test.ts`, `trip-mode.test.ts`.
- **Playwright, one critical path:** free-time state → ideas strip visible → promote → item renders on Today. Prior art: `trip-mode-views.spec.ts`. Run `pnpm test:e2e` after the DOM changes; visual verify at 375px.
- **Not tested:** tier styling, sheet open/close, skip-without-replace (trivial CRUD).

## Out of Scope

- Tab convergence Now ⇄ Today (deferred from #154; reconsider after this ships).
- Changes to Today's layout (only the skip affordance is added to its cards).
- Whole-trip or future-day replanning from Trip Mode (violates the Light Replanning boundary — Planning Mode's job).
- Quick-create of *new* items from the doors (the Add sheet already covers quick-add-for-today).
- Weather/context-aware idea ranking (vote score only for now).
- Memory/Note Before Bed touchpoints (separate context, TRIP_MEMORY_PRD).

## Further Notes

- Origin: audit #116, finding WP-A-005 (P1) — "Light Replanning has no doors in Trip Mode"; charter decisions D3 (temporal boundary) + D4 (doors open proactively). Audit report: `docs/app-audit/index.html`.
- SPEC_BACKLOG's "Ideas from Free Time" and "Inline contextual parking lot" entries are absorbed by this PRD and should be cut from the backlog when this is promoted into a milestone (per the backlog's own protocol).
- Slicing into issues happens at milestone promotion via `to-issues` (the TRIP_MEMORY_PRD precedent: firm PRD on the shelf, issues are perishable).
