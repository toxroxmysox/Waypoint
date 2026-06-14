# ADR-0009: Pending suggestions are votable via a separate `suggestion_votes` collection, with votes copied onto the item on approval

**Status:** Accepted
**Date:** 2026-06-13
**Deciders:** Scott
**Context:** `docs/TRIP_CONTRIBUTION_PRD.md` (Contribution loop); audit #116 (WP-B-001, WP-A-009). Builds directly on **ADR-0004** (goal votes use a separate collection, not polymorphic votes).

## Decision

A pending [[Suggestion]] is visible to all members as a votable [[Ghost Card]] in the [[Parking Lot]]. Votes cast on a pending suggestion are stored in a **new `suggestion_votes` collection** that parallels `votes` and `goal_votes` — `suggestion` (relation) + `member` + `value`, unique `(suggestion, member)` — **not** by making the existing `votes` collection polymorphic. On approval, the approve hook **copies each `suggestion_vote` onto the newly-created [[Item]] as a `votes` row** (same member + value); the suggestion and its `suggestion_votes` then freeze as history. The shared `voting.ts` scoring/avatar-stack logic is reused as-is.

## Why

ADR-0004 already settled that votes are non-polymorphic: each votable type gets a single-parent collection whose PB ownership rule is branch-free and independently testable. `suggestion_votes` is the symmetric application of that decision — its ownership path is `suggestion → trip`, a clean single-parent rule, and `voting.ts` (target-agnostic over `{value}`) is reused for free.

A pending suggestion and the item it may become are **different records**: the suggestion is a proposal/audit row that can also be rejected; the item is the real, planned-or-parked thing. The votes gathered while pending belong to the proposal, but must persist onto the item if it's approved. Copying them at the approve transition is a one-time transfer that keeps each collection single-parent. Re-pointing votes across collections (or reading an item's votes from two sources) would break the clean rule/display model.

## Considered and rejected

- **Polymorphic `votes`** (nullable `suggestion` on the existing collection, enforce exactly-one-of). Rejected for exactly ADR-0004's reasons — every rule and index becomes conditional on which FK is set. Net complexity up.
- **Don't migrate; read an approved item's votes from `suggestion_votes`.** Two vote sources per item, branching display and rules forever. Rejected.
- **Inert (non-votable) ghosts** — show pending suggestions but no voting. Simpler (no collection, no migration), but throws away the "the group rallies behind an idea before the owner decides" signal, which is the point of making pending visible. Rejected in the grill.
- **Pending = an `items` row with a `pending` status** (votes attach natively, approval just flips status, no migration). Rejected: it pollutes every existing `items` query with unapproved content, expands the item status enum, and collapses the suggestions/items separation — large blast radius for a narrow win.

## Consequences

- **Three parallel vote collections** now exist (`votes`, `goal_votes`, `suggestion_votes`) that look alike. This ADR exists so a future reader doesn't "consolidate" them and reintroduce the rule-branching the separation avoids — same caution as ADR-0004.
- A **copy-on-promote** step lives in the suggestion-approve hook — the one place votes cross a collection boundary. This is distinct from ADR-0004's "votes do not roll up a link": that forbids *continuous* cross-layer flow; this is a *one-time* transfer at the approve transition.
- `suggestion_votes` carries the goal-style rule that **a member cannot vote on a suggestion they authored** (authorship is the implicit endorsement); scoped to this collection.
- **Append-only**: a new migration adds `suggestion_votes`; `votes` and `goal_votes` are never touched. Reversing to inert ghosts or a polymorphic table later is a data migration — non-trivial but not catastrophic.
- Pending suggestions become visible to the whole group, which **redefines SPEC §6's Gate 1**: approval now gates whether a suggestion becomes a *real, votable item*, not whether the group can *see* it. Recorded in the PRD.
