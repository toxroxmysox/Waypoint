# #432 Ideas for now (Trip Mode) as grouped idea cards with vote pills

> svw:executing-plans, inline. Approved by Scott 2026-10-06 (CARD_SYSTEM §4 item 11); no open question.

**Goal:** `IdeasStrip` on Now renders the current phase's ideas under type headings (`IdeaGroupHeading`), each as an `IdeaCard` (no icon, `place · cost` sub-line, tap-to-vote pills), sorted by votes within a group. "Do this" (owner/co_owner) stays the primary action.

## Decisions
- Reuse `ideaGroups` / `IdeaGroupHeading` / `IdeaCard` / `VotePills` as-is; no fork. The grouping + sort are already unit-tested (`idea-groups.test.ts`, `voting.test.ts`), so no new Vitest seam.
- Layout mirrors the day page's pull-up: card `flex-1`, "Do this" button beside it, 44px hit area, clay.
- Loader: strip needs the viewer's member id and `canVote` (role != viewer). Add `myMemberId` + `canVote` to the Now load. Votes still come from the existing `ideas[].votes`.
- Old read-only `VoteStacks` / `VoteSentimentPill` and the "Voting is NOT cast here" comment are replaced (voting is now cast here).
- Ghost cards (pending suggestions) are not in this strip today; unchanged.

## Steps
- [ ] Loader: `myMemberId`, `canVote`.
- [ ] Rewrite `IdeasStrip.svelte`; wire the Now page.
- [ ] e2e: extend `trip-mode-ideas-door.spec.ts` (heading present, pills present, Do this still promotes).
- [ ] `docs/CARD_CONTENT_SPEC.md`: add 2e.
- [ ] check, unit, e2e:clean, verify:visual (seed ideas on Now if needed).
