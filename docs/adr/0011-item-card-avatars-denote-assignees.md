# ADR-0011: Item-card avatars denote assignees, not voters

**Status:** Accepted
**Date:** 2026-06-13
**Deciders:** Scott
**Context:** `docs/ITEM_ASSIGNMENT_PRD.md` (Item Assignment, issue #210); audit #116 (WP-A-017). `CARD_CONTENT_SPEC.md` (grilled 2026-06-10) fixed the item card's avatars to a single meaning — **reactors/voters** ("Card avatars stay votes-only … never assignees — *one avatar meaning per card*"), with assignees (`assigned_to`) rendered **detail-only**. The Item Assignment work needs "who's doing this item" legible on the card itself (the day view's whole job), and chose [[Assignment]] (`assigned_to`) as the primitive.

## Decision

Item-card avatars denote **assignees** (`assigned_to`) on every item-card surface — the planning itinerary timeline card, the trip-mode Today card, and the parking-lot card. **Votes relocate** on cards to a compact **icon + count pill**; the who-voted-what avatar stacks remain on item **detail**. "One avatar meaning per card" is preserved — inverted from voters to assignees. No change to the `votes`/`goal_votes` data model or `voting.ts` scoring.

## Why

- **On a committed card, "who's doing this" beats "who reacted."** The day view exists to read and execute the plan, not to vote on it. Assignment is the higher-value at-a-glance signal there; voting is a planning-decision signal, best read where it's cast (detail, the swipe deck) and as a tally on the card.
- **It keeps the spec's load-bearing principle — one avatar meaning per card — rather than stacking two.** We pick assignees and give votes a non-avatar (count) form. Nothing is lost: votes retreat from avatars to a number on the card and keep their faces on detail.
- **Assignment is the primitive WP-A-017 needs.** "Whose flight is this" is `assigned_to`; surfacing it on cards is the point, and the freed avatar slot doubles as the one-tap self-assign ("+ Me") target.

## Considered and rejected

- **Status quo — votes-only on cards, assignees detail-only** (CARD_CONTENT_SPEC as written). Rejected: defeats the day-view "who's doing what" goal that motivates the whole feature.
- **Coexist — assignee avatars *and* vote avatars in separate slots on the card.** Rejected: two avatar meanings on one card is the exact ambiguity the original spec eliminated, and it's clutter at 375px.
- **Lifecycle-keyed — parking-lot cards keep vote avatars, planned cards show assignee avatars.** Considered (it preserves "one meaning per card" *per context*); rejected for a single global rule — a meaning that flips by card type is harder to learn than "card avatars are always assignees."

## Consequences

- **CARD_CONTENT_SPEC is partially superseded** — decision #5, the timeline "Reactor avatars (votes only — never assignees)" row, and the parking-lot card's reactor-avatars line are annotated to point here.
- **Vote display on cards becomes an icon + count pill** across parking-lot and planned surfaces — a contained change in the reactor/vote-stack rendering. Item **detail** keeps the avatar stacks.
- **`assigned_to` graduates from detail-only to card-rendered.** Card loaders that lack the roster must expand assignees and attach avatars (the existing `member-avatar` helper). Assignee avatars appear only when the trip has **>1 member**, mirroring the existing capture rule.
- **Purely a rendering reassignment** — `votes`/`goal_votes` and `voting.ts` are untouched; **ADR-0004 stands**. No schema change.
- Doesn't preclude a future richer treatment (e.g. a combined affordance) — it only fixes the card avatar's *meaning* to assignment now.

## Amendment (2026-07-10, #350)

The card vote pill's **single-glyph count** (`VoteCountPill`, a thumbs-up + total) miscommunicated a mixed tally as unanimous approval — a lone "3" read as "3 approvals" regardless of whether those were loves or passes. **The pill now shows per-sentiment glyph+count groups** (`VoteSentimentPill`), non-zero only, using the same vocabulary as `VoteStacks` — ♥ love / + like / ~ flexible / – pass. A card with one love reads `♥ 1`, not a thumbs-up. This **amends, not reverses, the decision above**: votes stay *off* the card avatars (avatars still mean assignees), and no numeric weighted score is ever shown. Component renamed `VoteCountPill.svelte` → `VoteSentimentPill.svelte`.
