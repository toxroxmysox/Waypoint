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
   Drains to empty. Scope is user-chosen (one Phase or whole trip), with a phase-by-phase walk.

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
20. As a trip member, I want to choose whether I'm swiping one phase or the whole trip, so that I can
    do a bounded sitting or a full sweep depending on my energy.
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

### Closeout integration

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

Not unit-targeted for now (per session decision): `goal_votes` PB rules and a swipe E2E. The rules
*will* still need coverage in the `test:rules` matrix before ship (can't-vote-own-goal, role
permissions, the delete rule) — noted as a pre-ship task, not a v4-now test deliverable.

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

## Further Notes

- **ADR candidate:** "Goal votes use a separate `goal_votes` collection rather than a polymorphic
  `votes` table." Hard to reverse (migration), surprising to a future reader ("why two vote
  collections?"), and a real trade-off (rule simplicity vs. collection duplication). Recommend writing
  it when this work is promoted into a milestone.
- **Backlog hygiene:** `SPEC_BACKLOG.md` still lists "Item Voting UI (#30)" as backlog, but it shipped
  (commits `fdd2d69`/PR #47). Prune on the next backlog audit.
- This PRD pairs the Itinerary "Trip Goal" and Collaboration "Swipe-Quiz" backlog entries, which the
  backlog itself flagged should be grilled together (capture vs. harvest halves).
