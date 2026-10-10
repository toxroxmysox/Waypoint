# #442 Votes on the item page: plan

Stories 66, 67. Spec: Item page, Votes.

- Pure rule `votesView` (`item-page.ts`, Vitest): idea (no day) -> `pills` face, Add to a day for `canMove`, no Going; planned -> `row` face (non-viewers), Going stays.
- `VotePills` (#425) gains an optional `labels` prop; the item page mounts it. No second pill. `VoteButtons` leaves the page.
- Idea face: `What do you think?`, pills, who voted what, `Add to a day` (opens the Move sheet, titled via new `title` / `moveTitle` props).
- Planned face: `Your vote: X · change` row in Details; `change` toggles the pills in place.
- Going control hidden on ideas (votes and Going never share a face).
- E2E: new `item-votes.spec.ts`; `item-role-gating` and `m4-execution` selectors move from the old `Vote on this item` group to `item-your-vote` (their items are planned).
- Visual: idea + planned at 375 and 768. Amend `docs/CARD_CONTENT_SPEC.md` item-detail Votes row and layout line.
