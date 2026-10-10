# #425 Tap-to-vote pills on ideas Implementation Plan

> **For agentic workers:** svw:executing-plans, inline.

**Goal:** Every unplanned idea card (day page parking lot, desktop Ideas panel, Phase Detail) shows four tap-to-vote pills (Love / Like / Flexible / Pass) with counts; your vote is filled, tap toggles; ideas re-sort by weighted score in their group.

**Architecture:** Pure pill model in `src/lib/collaboration/voting.ts` (`votePills`, `votePillsLabel`, `withMyVote`), unit-tested first. One target-agnostic `VotePills.svelte` (props: `votes`, `members`, `myMemberId`, `canVote`, `voteAction`, `unvoteAction`, `subject`) posting to the existing item `?/vote` / `?/unvote` form actions via `use:enhance` + `optimisticSubmit` (same path as `VoteButtons`). `IdeaCard` renders it above the stretched link (z-10), stopping mousedown/touchstart so taps neither navigate nor start a drag. Viewers get the same four pills as non-interactive counts.

## Decisions
- Hit area: real `min-h/min-w-[44px]` buttons, no pseudo-element overlays (they steal each other's clicks, #437). Negative top margin lets the 44px box overlap the sub-line text, not a sibling control.
- Pills show glyph + count (label in the accessible name and tooltip); four labelled pills do not fit at 375px beside the pull-up.
- Tooltip: CSS-only, on hover/focus where hover exists; lists names per sentiment.
- Drag: same-zone drop already `reseed()`s with no write (#424); verified by e2e, not rebuilt.
- Loaders: day page and Phase Detail already ship `votesByItem`; the rail reads the day page's. Plumbing added: `myMemberId` + `canVote` props through `ParkingLotSection` / `ParkingDivider` / `PhaseIdeas` / `ContextRail`.

## Steps
- [ ] Red: `voting.test.ts` pill model, label, toggle semantics; `idea-groups.test.ts` tie order.
- [ ] Green: `voting.ts` helpers.
- [ ] `VotePills.svelte`; wire `IdeaCard`, plumbing.
- [ ] Extend `parking-idea-votes` e2e; `docs/CARD_CONTENT_SPEC.md` 2d.
- [ ] check, unit, e2e:clean, screenshots at 375 / 768 / 1280.
