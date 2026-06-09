# PRD — Group-Input Cluster (Trip Goals + Swipe-Quiz)

> Status: **Draft / not ready-for-agent.** v4. Output of the 2026-06-07 grill-with-docs session.
> Scope: two sibling features that share a "minigame" substrate but have separate objectives.
> Source backlog: `SPEC_BACKLOG.md` → Itinerary "Trip Goal", Collaboration "Swipe-Quiz Voting Experience".
> Glossary terms touched: [[Trip Goal]], [[Swipe-Quiz]], [[Vote]], [[Public Archive]] in `CONTEXT.md`.
>
> **This PRD intentionally leaves UI/interaction design open** — Scott flagged it as input for future
> design prompts and brainstorming. Decided architecture/domain rules are firm; everything under
> "Open for Ideation" needs a design pass before this is ready-for-agent. Before promoting any of this
> into a milestone, amend `SPEC.md` per the CLAUDE.md scope-change protocol.

---

## Resolutions — design-handoff grill (2026-06-07)

The Trip-Goals + Swipe-Quiz design handoff (`design_handoff_trip_goals/`) was grilled against this PRD.
These decisions **supersede** any conflicting inline text below and close the open-ideation blockers
needed to slice into issues:

1. **Goal votes stay a separate `goal_votes` collection** (hold ADR-0004). The handoff's "one `votes`
   collection" line is a designer simplification — the deck **engine** is target-agnostic, but the
   **persistence loaders split**: goal cards write `goal_votes`, item cards write `votes`.
2. **Item↔goal link is the `trip_goals.items` relation field** — no `goal_links` join collection
   (the handoff's `goal_links` reference is a misread).
3. **Pass label.** The `dislike` option is surfaced as **"Pass"** (matches production
   `VoteButtons.svelte`); the value id stays `dislike`. Glossary corrected.
4. **Wish persistence: per-add.** A typed wish becomes a `trip_goal` immediately (optimistic), not on
   wizard completion. Rewind/undo **deletes** the just-created goal (allowed: creator + zero votes).
   Partial sessions survive app-close — no required completion.
5. **Swipe-Quiz is phase-scoped only (v4).** Whole-trip sweep is **deferred**. Entry = a launch card on
   the **Phases sub-tab** (not inside an individual phase's parking lot). Finishing a phase prompts the
   next phase if one exists; each phase is its own fresh phase-scoped deck.
6. **Closeout goal-review is deferred OUT of this milestone** — it rides with a future closeout
   deep-dive + design pass. (US13–15 and the "Closeout integration" decisions block below are deferred,
   not in scope for v4 slicing.) Goals still auto-derive status from linked items without it.
7. **Goal delete** lives as a rule-gated action on the **goal-detail** screen
   (`(creator AND zero goal_votes) OR owner/co_owner`), plus the wizard rewind-delete path. No
   swipe-to-delete on the Goals tab row.
8. **Card order (both decks):** sort by **vote quantity desc** (count of existing votes, not weighted
   score), ties + zero-vote items by **creation time, oldest first**. The capture deck additionally
   **alternates 1:1** reaction-card / prompt-card, degrading to all-prompts (new trip) or all-reactions
   (prompts spent). Deterministic given inputs → `buildDeck` stays unit-testable.

**Build resolutions (2026-06-08 — #76 SwipeDeck grill + build; closes the former "still open" items):**

1. **Pass label** locked (was flagged open in the engine handoff) — matches shipped `VoteButtons` + migration 0029.
2. **`buildDeck` vote-quantity** input comes from loader-decorated `voteCount` on each item (keeps the 3-arg signature pure/testable); `myVotes` only drives the unvoted filter.
3. **Eligible statuses = `planned` + `unplanned` only** — `done`/`considered` are closeout-only and never appear in the deck.
4. **No skeleton** — the deck mounts with the first card, or an "All caught up" empty state at zero unvoted items.
5. **Completion = the three agreed elements only** (rose spread + continue-to-next-phase + jump-to-parking-lot); no streaks/stats.
6. **Tablet+ = centered modal**, mobile = bottom sheet (`min-width: 900px` check); same compass.
7. **Next-phase hand-off skips empty phases** — the next phase in order that still has unvoted eligible cards (null if none).

Live HITL tweaks locked at the 375px checkpoint: fly-from-release-position; a commit-threshold cue (colored ring + ✓ chip past 88px); physics from the prototype (88px commit / ×0.8 up-bias / ×0.22 down rubber-band / `cubic-bezier(.16,1,.3,1)` / 400ms fly). Shipped: PR #96 (commit `0bdc4a1`). The capture-wizard deck (#79) inherits all of this; `trip_goals.created` was added (migration 0041) so the capture deck's oldest-first tiebreak works.

---

## Problem Statement

Trip planning starts with vague group wishes ("I want to try real paella," "we should do a wine
tasting") that today have nowhere to live — every Item requires a Phase, so a phase-less aspiration
can't be captured. Those wishes get lost in group chat and never get traced through to "did we
actually do it?"

Separately, once a Phase fills with ideas (unplanned items) and committed plans (planned items),
there's no low-friction way for the group to register preference at scale. The Vote model and
collection exist, but the only way to vote is to open each item individually and tap — nobody grinds
through 40 items that way, so the parking-lot vote-sort never gets enough signal to be useful.

Two halves of one gap: **capturing** loose group wishes early, and **harvesting** group preference
across many items efficiently.

## Solution

Two separate, minigame-flavored features sharing the existing Vote infrastructure:

1. **Trip Goals (capture).** A new trip-scoped, phase-less entity for aspirations. Lives in its own
   sub-tab under Itinerary (Overview · Phases · [Checklists] · [Goals]). Captured via a prompted
   brain-dump minigame that interleaves "add a wish" prompts with "do you like this one too?" cards
   on existing goals. Goals are votable (own `goal_votes` collection) and sort by aggregate score.
   Items can be linked to a goal; a goal's status is *derived* from its highest-maturity linked item,
   giving end-to-end traceability ("we wanted paella → Tapas at Bar Pinotxo → done ✓"). Reviewed in
   the closeout wizard.

2. **Swipe-Quiz (harvest).** A Tinder-style card stack that walks one member through the items they
   haven't voted on yet, casting a Vote per card. Independent and async per member — no coordination.
   Drains to empty. **Phase-scoped (v4)** — launched from the Phases sub-tab, finishing one phase
   offers the next. (Whole-trip sweep deferred — see Resolution 5.)

Both reuse `voting.ts` and the four-option Vote model (Love/Like/Flexible/Dislike). Votes never roll
up across the goal↔item link — goal votes and item votes are orthogonal signals.

---

## User Stories

### Trip Goals — capture

1. As a trip member, I want to jot a vague aspiration ("try paella") without picking a phase, day, or
   time, so that early wishes aren't lost just because they're not concrete yet.
2. As a trip member, I want a prompted brain-dump minigame ("a food you have to try?", "an experience
   you'd regret missing?") so that capturing goals feels fast and sparks ideas instead of staring at a
   blank form.
3. As a trip member, I want to see existing goals mixed into the capture flow as "do you like this
   too?" cards, so that I can react to the group's wishes in the same sitting.
4. As a trip member, I want to vote Love/Like/Flexible/Dislike on a goal, so that the goals the group
   actually cares about rise to the top.
5. As a trip member, I want each goal to show who created it, so that authorship signals intent
   without needing a separate vote.
6. As a goal creator, I want to delete a goal I made *as long as nobody else has voted on it*, so that
   I can clean up my own throwaway ideas but can't erase something the group has engaged with.
7. As an owner/co-owner, I want to delete any goal, so that I can prune the list regardless of
   authorship or votes.
8. As a trip member, I want to link one or more items to a goal, so that I can show how we plan to
   fulfill the aspiration.
9. As a trip member, I want a goal to automatically reflect the maturity of its linked items
   (unplanned → planned → done), so that I never have to hand-maintain its status.
10. As a trip member, I want a goal with no linked items to be manually settable (unplanned / planned
    / done / considered), so that aspirations without a concrete plan still have a state.
11. As a member viewing a goal, I want to see its linked items and each one's status, so that I can
    trace the aspiration down to the plans that address it.
12. As a member, I want to Love a goal yet Dislike a specific linked item, so that I can endorse the
    idea while rejecting a particular execution of it — without the two contaminating each other.
13. As an owner running closeout, I want a goal-review step after the per-phase unplanned review, so
    that I resolve any goals that didn't auto-resolve from their items.
14. As an owner in closeout, when something happened that wasn't planned, I want to quick-add the item
    and link it to the goal inline, so that the goal reads `done` honestly instead of following an
    abandoned (`considered`) item.
15. As an owner in closeout, I want already-resolved goals (auto-`done` or all-`considered`) to be
    hidden from the review prompts, so that I'm only asked about genuinely ambiguous ones.
16. As a viewer, I want to read goals but not create, vote, or link, so that the role model stays
    consistent (viewers are view/comment-only).

### Swipe-Quiz — harvest

17. As a trip member, I want a card stack of items I haven't voted on, so that I can register
    preference across many items quickly instead of opening each one.
18. As a trip member, I want a voted item to drop off my stack, so that I never re-see something I've
    already rated and the deck visibly drains toward done.
19. As a trip member, I want both planned and unplanned items in the deck, so that I can weigh in
    whether I'm planning early (mostly ideas) or late (mostly committed).
20. As a trip member, I want to swipe through one phase at a time, so that I can do a bounded sitting.
    *(v4: phase-scoped only; whole-trip sweep deferred — Resolution 5.)*
21. As a trip member finishing a phase, I want to be offered the next phase, so that I can keep going
    in a natural sequence without backing out to a menu.
22. As a trip member, I want to swipe right=Like, left=Dislike, up=Love, so that the common reactions
    are fast gestures (strongest preference = upward).
23. As a trip member, I want Flexible as a button (not a swipe), so that the low-energy "meh" is a tap
    and a stray down-swipe never fights page scroll.
24. As a desktop or keyboard/screen-reader user, I want all four options as real buttons, so that the
    minigame is fully usable without gestures (WCAG 2.1 AA).
25. As a trip member, I want blind voting by default, so that I rate my honest gut without being
    anchored by others' votes.
26. As a trip member, I want an optional "peek mode" toggle, so that I can see how others voted as I
    go when I'd rather react socially.
27. As a trip member, I want a personal completion screen when the deck empties, so that I get a sense
    of closure ("you rated 12 items").
28. As a trip member, I want a "jump to phase parking lot" link on the completion screen, so that I
    can immediately see how my swipes reordered the rankings.
29. As a trip member, I want my swipes to be the same Votes I'd cast on item detail, so that there's
    one source of truth and re-voting later (on item detail) just works.
30. As a trip member, I never want to wait on anyone else, so that I can do my pass whenever — the
    feature is independent and async, not a coordinated group session.

### Trip Goals — capture minigame flow

31. As a member, I want the Goals tab to list all goals ranked by vote with an "add / review wishes"
    wizard entry at the top, so that I browse what the group wants and jump into contributing from one
    place.
32. As a member, I want the wizard to mix "add a wish" prompt cards with "react to this goal" cards,
    so that capturing and reacting happen in one varied flow instead of two separate chores.
33. As a member, I want prompts personalized to where we're going ("a food you must try in Spain?"),
    so that they spark relevant ideas — and to fall back to generic prompts when the trip has no
    location yet.
34. As a member, I want to add several wishes to one prompt (or none) and tap "next", so that a good
    prompt can capture a burst without forcing exactly one.
35. As a member, I want to skip a prompt that doesn't inspire me, so that I'm never stuck on a blank.
36. As a member, I want reaction cards to show only goals I haven't voted on and didn't create, so
    that I never re-rate or vote my own.
37. As a member, I want the wizard to drain to a "you're all caught up" screen, so that I get the same
    satisfying completion as the Swipe-Quiz and can return later once others have added more.
38. As a member, I want to do this whenever — kickoff or weeks later — with no nudge or deadline, so
    that it fits naturally into how planning actually happens.

---

## Implementation Decisions

### Domain model — Trip Goal

- **New collection `trip_goals`** (Itinerary functional area). Trip-scoped, **phase-less,
  location-less, time-less** by definition. Sibling collection to `phases` — *not* a container and
  *not* an item (an item requires a phase; a goal cannot be one).
- Fields: `trip` (relation, required), `title` (required), `description` (optional), `created_by`
  (relation → trip_members, required), `manual_status` (enum: unplanned/planned/done/considered — only
  authoritative when the goal has zero linked items), `sort_order` (int), `items` (relation → items,
  multiple).
- **Link is stored goal-side** (`trip_goals.items`), deliberately: linking writes the *goal* record,
  not the item, so "anyone can link" doesn't violate "travelers can't edit items."
- The link is a **cross-cutting reference, not ownership** — a linked item still lives in its phase.

### Goal status derivation (deep module: `goal-status.ts`)

- Pure function `deriveGoalStatus(linkedItemStatuses, manualStatus) → status`.
- **Has ≥1 linked item:** status is the **highest-maturity** linked item status, by the total order
  **`done > planned > unplanned > considered`**. Consequence: a goal is `considered` **only when every
  linked item is considered** (all paths abandoned). Manual status is ignored while links exist —
  keeps the goal honest (no phantom achievement).
- **Zero linked items:** status = `manual_status` (default `unplanned`).
- Status flows **upward only** (item → goal). It is never written back down to items.

### Goal voting (collection `goal_votes`)

- **Separate collection**, parallel to `votes` (not polymorphic). Chosen over a single nullable-FK
  `votes` collection so PB rules stay simple and independently testable (a vote's trip-ownership path
  is single-parent: `goal → trip`). Candidate for a short ADR (see Further Notes).
- Fields mirror `votes`: `goal` (relation, required), `member` (relation → trip_members, required),
  `value` (enum: love/like/flexible/dislike). Unique `(goal, member)`.
- **Creation casts no vote.** Authorship is the implicit "I want this"; votes come only from *other*
  members. Therefore "has votes" in the delete rule = any `goal_votes` row exists.
- **A member cannot vote on a goal they created** (enforced in rules). Scoped to goals only — item
  votes unchanged.
- `voting.ts` is reused as-is for scoring and avatar-stack grouping (already target-agnostic); only
  the loader/collection differs. Goals sort by aggregate score exactly like unplanned items
  (`sortByVoteScore`).
- **No cross-layer rollup:** a goal's score is its `goal_votes` only; an item's is its `votes` only.

### Permissions — Trip Goal

- **Create / vote / link / edit:** open to owner, co_owner, traveler (no suggestion queue — gating
  brain-dump kills the minigame). **Viewers: read-only** (consistent with the rest of the role model).
- **Delete a goal:** `(creator AND zero goal_votes)` **OR** owner/co_owner.
- Traveler goals deliberately **skip the suggestion queue**, unlike traveler item contributions —
  goals are low-stakes wishes, not itinerary commitments.

### Closeout integration — DEFERRED out of v4 (see Resolution 6)

> Moved to a future closeout deep-dive + design pass. Retained here for that effort; not in scope for
> v4 issue-slicing. US13–15 are likewise deferred.

- New **goal-review step** runs *after* the per-phase unplanned-item review.
- Surfaces **only unresolved goals** — hides auto-`done` and all-`considered` goals to avoid
  double-asking (resolving items already cascades to their goals).
- Each surfaced goal prompts "Did this happen?" → **[Link existing item]** · **[+ Quick-add item]**
  (inline; marks done and auto-links) · **[Leave as considered]**. Reuses the existing closeout
  inline quick-add (`InlineQuickAdd.svelte`) and walk-the-list pattern.

### Item↔Goal linking surfaces

Same relation, three surfaces: (1) **item form** "Addresses goal(s)" multi-select; (2) **goal detail**
"Link an item" picker + traceability list (linked items with statuses, derived goal status on top);
(3) **closeout** goal-review.

### Capture minigame (Trip Goal) — resolved 2026-06-07 brainstorm

- **Goals sub-tab** = the goal list ranked by aggregate `goal_vote` score (avatar stacks, creator,
  derived-status badge), with an **"add / review wishes" wizard entry at the top**. The list is the
  home; the wizard launches from it. No separate dashboard.
- **The wizard is one `SwipeDeck`** with two interleaved card types (**mixed**; adaptive to what
  exists):
  - **Prompt card** — a context-injected prompt; member adds **0..n** wishes (each → a goal,
    `created_by` = them); **"next"** advances, **skip** allowed. Each prompt shown once per session,
    shuffled. (Prompt cards advance on "next" rather than a single decision — the one asymmetry vs.
    reaction/harvest cards, which auto-advance.)
  - **Reaction card** — an existing goal the member hasn't voted on and didn't create; casts a
    `goal_vote` via the same 3-swipes/4-buttons + blind-default/peek-toggle interaction as the harvest
    deck; auto-advances.
  - Adaptive deck: a new trip's first member sees mostly prompt cards; later members get prompts woven
    through others' goals.
  - **Drains** when prompts are exhausted and no unreacted goals remain → "you're all caught up"
    completion (wishes added + reactions given); resumable as others add goals.
- **Prompts:** a small curated core set (~6–8) with light context injection from `location_summary` /
  `countries`; degrades to generic when location is blank. **No category** stored on goals — vote
  score is the only grouping.
- **No owner nudge** in v4.
- **Timing-agnostic:** the same flow serves a trip-kickoff burst and a one-off "new idea" weeks later;
  never gated.

### Swipe-Quiz (harvest)

- **Deck contents:** items the current member has **no vote on yet**, **planned + unplanned**, within
  the chosen scope. A cast vote removes the card; deck drains to empty.
- **Scope:** user-chosen — single **phase** or **whole trip**. Finishing a phase offers the next phase
  (sequential walk).
- **Input model: 3 swipes + 4 buttons.** Swipe right=Like, left=Dislike, up=Love. Flexible is a button
  only (no down-swipe — avoids scroll conflict; "meh" = lowest-energy tap). All four available as
  buttons for desktop + WCAG-AA keyboard/SR path. Swipes are accelerators over the buttons, wrapping
  the existing `VoteButtons.svelte`.
- **Blind by default + "peek mode" toggle** (reveal others' votes / avatar stacks while swiping).
- **Writes the same `votes` records** as per-item voting (one vote per member per item). Re-voting
  happens on item detail, not in the deck.
- **Independent & async** — no group session, no waiting, no coordination. "Reconciliation" = the
  existing aggregate Vote model; nothing new.
- **Completion screen:** personal summary → optional "continue to next phase" → "jump to phase
  parking lot" (live rankings, reusing `VoteStacks`).

### Shared substrate

- The goal-capture reaction cards and the item Swipe-Quiz are the same interaction (card + vote +
  auto-advance). Extract a shared **`SwipeDeck.svelte`** + the pure **`swipe-deck.ts`**
  (`buildDeck(items, myVotes, scope)` → ordered queue + phase hand-off). Capture adds interleaved
  add-prompts on top of the same deck.

### Migrations

- Append-only (CLAUDE.md): new `trip_goals` migration, new `goal_votes` migration. No edits/deletes to
  existing collections. (Modifying a field's `required` flag would be allowed, but the separate-
  collection choice avoids touching `votes` at all.)

---

## Testing Decisions

Good tests assert **external behavior**, not implementation. Both target modules are pure functions
with no UI/IO — ideal for Vitest, mirroring existing `voting.test.ts`, `sort-order.test.ts`,
`multi-day.test.ts`.

- **`goal-status.ts`** (Vitest). Cover: highest-maturity selection across mixed statuses; the
  `done > planned > unplanned > considered` order; the "all-considered ⇒ considered, otherwise a live
  status wins" edge (the paella/flamenco scenarios); manual fallback when unlinked; that adding a link
  flips a manual goal to derived. Prior art: `voting.test.ts`.
- **`swipe-deck.ts`** (Vitest). Cover: unvoted-only filter; planned+unplanned inclusion; phase vs
  whole-trip scope; drain-to-empty; next-phase hand-off ordering. Prior art: `sort-order.test.ts`.

**`trip_goals` + `goal_votes` PB rules (`test:rules` matrix)** are now in-scope, built test-first with
their collections: `trip_goals` cells in #75, `goal_votes` cells + the can't-vote-own-goal negative
case + the tightened delete rule in #77 (extends `backend/test-rules.mjs`; prior art: the `votes`
block). Covers role permissions, can't-vote-own-goal, and the `(creator AND zero votes) OR owner`
delete rule.

Still not unit-targeted: a swipe-deck **E2E** (the `swipe-deck.ts` logic is covered by Vitest above;
a full gesture E2E is deferred).

---

## Out of Scope

- **Public-archive surface for goals** ("what we set out to do" summary) — deferred to the **Trip
  Memory grill**, which owns the archive-extension backlog item. Principle agreed (PII-stripped goal
  titles + derived status belong in the public record); the *surface* is built there, not here.
- **Goal voting on items / item voting on goals as one merged deck** — the two minigames stay separate
  features (separate objectives, separate UX).
- **Cross-layer vote rollup** — explicitly rejected.
- **Coordinated/synchronous group voting sessions** — rejected; independent async only.
- **Down-swipe gesture** — intentionally unused.
- **Retrofitting "can't vote your own" to item votes** — goals only, unless revisited.
- **Trip Goal as an item type / phase-scoped goal** — violates the data model.
- Multi-currency, push, realtime subscriptions, etc. — standing off-the-table list.

---

## Open for Ideation

(Design-prompt fuel — deliberately unresolved. Needs a design pass before ready-for-agent.)

- **Capture minigame flow & prompts:** *resolved 2026-06-07 — see Implementation Decisions →
  "Capture minigame (Trip Goal)".* Still open within it: the exact wording of the curated core prompt
  set and the context-injection templates.
- **Swipe deck visuals/animation:** card stack styling, swipe physics/affordances, how the up=Love
  gesture reads, the peek-mode visual treatment, progress indicator. (Applies to both minigames — they
  share `SwipeDeck`.)
- **Card order within a deck** (random? newest? unplanned-before-planned? by sort_order?).
- **Mis-swipe undo / rewind**, and whether "skip without voting" exists distinct from Flexible.
- **Entry points / nav launch** for both minigames (Goals sub-tab is settled for goals; where the
  Swipe-Quiz launches — Activity tab? phase view? — is open).
- **Goal detail / traceability view** layout.
- **Goals empty state** and onboarding into the capture minigame.
- **Completion-screen** content beyond the agreed elements (stats? streaks?).

## Design Prompts

Two self-contained prompts for a fresh Claude design-brainstorm session, split along the two features
(both built on the shared `SwipeDeck`). Each bakes in the firm constraints above and leaves only the
"Open for Ideation" items open. Ask for 2–3 distinct directions, mobile-first, 375px shown first.

### Prompt 1 — Swipe-Quiz (harvest) + the shared SwipeDeck interaction

```
You're designing the UI/UX for a mobile-first trip-planning web app (SvelteKit + PocketBase,
collaborative — multiple members plan one trip). I want 2–3 distinct design directions, not one
answer. Mobile-first; show me how each reads at 375px wide before anything else.

THE FEATURE — "Swipe-Quiz": a Tinder-style card stack that walks ONE member, async and solo, through
the trip items they haven't voted on yet, casting one vote per card. The deck drains to empty. This is
about harvesting preference across ~40 items fast, because tapping into each item one-by-one never gets
enough votes to be useful.

This card-deck is a SHARED SUBSTRATE — the same component is reused by a second feature (a goal-capture
wizard), so design the deck as a reusable interaction language, then show the Swipe-Quiz wrapped around it.

FIRM RULES (do not redesign these — design AROUND them):
- Vote has exactly 4 options: Love, Like, Flexible, Dislike.
- Gestures: swipe right = Like, left = Dislike, up = Love (strongest preference = upward).
  Flexible is a BUTTON only — never a down-swipe (down-swipe is intentionally unused to avoid
  fighting page scroll; "Flexible/meh" is the lowest-energy tap).
- All four options must ALSO be real buttons — the whole thing must be fully usable with no gestures
  at all (desktop + keyboard + screen reader, WCAG 2.1 AA). Swipes are accelerators over the buttons.
- Blind voting by DEFAULT (rate your honest gut, unanchored). Plus an optional "peek mode" toggle that
  reveals how others voted (avatar stacks) while you swipe.
- Scope is user-chosen: one phase OR the whole trip. Finishing a phase offers the next phase (a
  sequential walk) without backing out to a menu.
- Each card is a trip item (planned or unplanned).

OPEN QUESTIONS I WANT EXPLORED (this is the point of the exercise):
- Card-stack visuals & swipe physics: how does the up=Love gesture read and feel distinct from
  right=Like? What are the swipe affordances (color wash, edge labels, snap-back)?
- How the 4th option (Flexible button) coexists with the 3 swipe gestures without feeling bolted-on.
- Peek-mode visual treatment — how avatar stacks appear without anchoring/cluttering the card.
- Progress indicator — how does "the deck is draining" feel motivating without being a stress bar?
- Mis-swipe undo / rewind — is there one? how invoked?
- Completion screen when the deck empties: a personal summary ("you rated 12 items"), an offer to
  continue to the next phase, and a "jump to the phase parking lot" link to see how your swipes
  reordered the live rankings. What else earns its place — stats? streaks? Keep it tasteful.
- Entry point: where does a member launch the Swipe-Quiz from in the app? (open — propose options).

CONTEXT/STYLE: collaborative trip planner, warm and a little playful (it's a "minigame"), but it's a
real planning tool, not a game — restraint over gimmick. Bottom sheets on mobile, centered modals on
tablet+. Skeleton loading where layout is known.

Deliver: 2–3 directions, each with the card anatomy, the gesture/button layout, peek-mode treatment,
progress + completion, and a quick note on the accessibility/no-gesture path for that direction.
```

### Prompt 2 — Trip Goals capture minigame + Goals tab

```
You're designing the UI/UX for a mobile-first collaborative trip-planning web app (SvelteKit +
PocketBase). I want 2–3 distinct design directions, mobile-first; show me 375px first.

THE FEATURE — "Trip Goals": a place to capture vague group aspirations BEFORE they're concrete plans
("try real paella", "do a wine tasting"). Goals are phase-less, time-less wishes. They live in their
own sub-tab under Itinerary (tabs: Overview · Phases · Checklists · Goals). Goals are votable and rank
by aggregate vote score; later, real itinerary items get linked to a goal so you can trace
"we wanted paella → Tapas at Bar Pinotxo → done ✓".

THREE SURFACES TO DESIGN:

1. THE GOALS TAB (the home). A list of all goals ranked by aggregate vote score, each showing: title,
   who created it (authorship = implicit "I want this"), avatar stacks of who voted, and a derived
   STATUS badge (unplanned / planned / done / considered). At the top: an "add / review wishes" entry
   that launches the capture wizard. Design the list AND its empty state (a brand-new trip has zero
   goals — how do we onboard the first member into adding wishes?).

2. THE CAPTURE WIZARD (a card deck — REUSES a shared Tinder-style SwipeDeck component, see rules
   below). It interleaves two card types in one varied flow:
   - PROMPT card: a context-injected question ("a food you must try in Spain?", "an experience you'd
     regret missing?"). The member types 0..n wishes (each becomes a goal) then taps "next"; skip is
     allowed. (Prompt cards advance on "next" — the one asymmetry; the other card type auto-advances.)
   - REACTION card: an existing goal the member hasn't voted on and didn't create — they vote on it.
   The deck adapts: a new trip's first member sees mostly prompt cards; later members get prompts woven
   through other people's goals. It drains to a "you're all caught up" completion screen, resumable
   later as others add goals.

3. GOAL DETAIL / TRACEABILITY view: the goal, its derived status, and its list of linked items each
   with their own status — so you can trace the wish down to the plans addressing it. Plus a "link an
   item" picker.

FIRM RULES (design around, don't redesign):
- Voting is the same 4-option model as the rest of the app: Love / Like / Flexible / Dislike, via
  3 swipes (right=Like, left=Dislike, up=Love) + Flexible as a button, all four also real buttons for
  WCAG 2.1 AA keyboard/screen-reader use. Blind-by-default + optional peek toggle.
- A member can't vote on a goal they created (reaction cards only ever show others' goals).
- Status is mostly DERIVED from linked items, not hand-set — design the badge to read as automatic.
- Prompts are a small curated set (~6–8) with light location context injection, degrading to generic
  when the trip has no destination yet.

OPEN QUESTIONS I WANT EXPLORED:
- How a single wizard makes "add a wish" and "react to a goal" cards feel like one cohesive flow rather
  than two chores — the visual/interaction distinction between the two card types.
- The Goals-tab list density & how the derived-status badge + avatar stacks + authorship coexist
  without clutter at 375px.
- The empty state / first-run onboarding into the wizard.
- Traceability view layout — making the goal→items→status chain legible.
- Completion screen content beyond "you're all caught up".

CONTEXT/STYLE: collaborative, warm, lightly playful (it's a "minigame") but a real planning tool —
restraint over gimmick. Bottom sheets on mobile, centered modals tablet+, skeleton loading.

Deliver 2–3 directions covering all three surfaces, each starting from the 375px mobile view.
```

## Further Notes

- **ADR candidate:** "Goal votes use a separate `goal_votes` collection rather than a polymorphic
  `votes` table." Hard to reverse (migration), surprising to a future reader ("why two vote
  collections?"), and a real trade-off (rule simplicity vs. collection duplication). Recommend writing
  it when this work is promoted into a milestone.
- **Backlog hygiene:** `SPEC_BACKLOG.md` still lists "Item Voting UI (#30)" as backlog, but it shipped
  (commits `fdd2d69`/PR #47). Prune on the next backlog audit.
- This PRD pairs the Itinerary "Trip Goal" and Collaboration "Swipe-Quiz" backlog entries, which the
  backlog itself flagged should be grilled together (capture vs. harvest halves).
