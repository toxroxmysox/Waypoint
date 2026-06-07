# ADR-0004: Goal votes use a separate `goal_votes` collection, not a polymorphic `votes` table

**Status:** Accepted
**Date:** 2026-06-07
**Deciders:** Scott
**Context:** `docs/V4_GROUP_INPUT_PRD.md` (Group-Input Cluster); `SPEC_BACKLOG.md` → Trip Goal / Swipe-Quiz

## Decision

Votes on a [[Trip Goal]] are stored in a **new `goal_votes` collection** that parallels the existing
`votes` collection — `goal` (relation) + `member` + `value`, unique `(goal, member)` — rather than
making the existing `votes` collection polymorphic over item-or-goal targets. The shared scoring and
avatar-stack logic in `voting.ts` is reused as-is; only the collection and its loader differ.

## Why

`voting.ts` is already target-agnostic (it operates on `{value}` and arrays), so the reusable part is
free **regardless** of storage. The only real question is the collection shape, and there the
single-parent design wins on PB rules. A vote's trip-ownership path for a goal is `goal → trip`; for an
item it is `item → phase → trip`. Two clean single-parent rule sets are trivially expressible and
independently testable in the `test:rules` matrix. This matches CLAUDE.md's "PB rules first, hooks for
complex logic only" — the collection whose rules need no branching is the right one.

## Considered and rejected

- **One polymorphic `votes` collection** (make `item` nullable, add nullable `goal`, enforce
  exactly-one-of). Every rule would branch on which FK is set, ownership resolution would differ per
  branch, and uniqueness would need two partial indexes `(item,member)` and `(goal,member)`. It
  collapses two collections into one at the cost of making every rule and index conditional — net
  complexity up, not down.
- **`target_type` + `target_id` text polymorphism.** PocketBase relations are typed; faking
  polymorphism with a bare text id throws away referential integrity and cascade-delete. Rejected
  outright.

## Consequences

- Two vote collections that look alike — this ADR exists so a future reader doesn't "consolidate" them
  and reintroduce the rule-branching the separation avoids.
- A goal-specific rule lives here that item votes do not have: **a member cannot vote on a goal they
  created** (authorship is the implicit endorsement). Scoped to `goal_votes` only.
- **No cross-layer rollup**: a goal's score is its `goal_votes` only; an item's its `votes` only.
  Status flows up the goal↔item link; votes do not.
- Append-only: a new migration adds `goal_votes`; `votes` is never touched. Reversing to a polymorphic
  table later would be a data migration — non-trivial but not catastrophic.
