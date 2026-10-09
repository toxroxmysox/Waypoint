# #430 — several Heroes on Now

Refs #430 (spec #418, CARD_SYSTEM D11 "several Heroes"). Single session, inline.

## Seam
`now-state.ts`: `findCurrentItem` -> `findOngoingItems(items, now, viewerMemberId)`.
- Ongoing = timed, start <= now < end, not multi-day.
- Order: viewer in `assigned_to` first, then the rest; each group by start time (ties: end time).
- `NowFocus` mid-event gains `heroes: Item[]`; `currentItem` (= heroes[0]) and `minutesRemaining` (of heroes[0]) stay for compat.
- `getNowViewState` / `getNowFeed` take optional `viewerMemberId` (default ''), so no caller breaks.
- All ongoing items excluded from `restItems` (forward list already excludes started items).
- Free-time only when no ongoing item (already true; pinned by test).

## Page
`now/+page.svelte`: `{#each focus.heroes}` Hero, one Skip menu per Hero. Viewer id = `data.membership.id`. No conflict note on Heroes (verify).

## Tests (red first)
1. Unit: several ongoing -> all heroes; mine-first then start; multi-day excluded; free-time only when none ongoing; rest excludes all heroes; no viewer id -> start order.
2. E2E `trip-mode-heroes.spec.ts`: seed `now:'multi'`; two Heroes (mine first), multi-day banner not a Hero, no free-time card, no overlap text.
3. Visual: 375 + 768.

## Seed
`now:'multi'`: viewer-going ongoing item (starts later), someone else's ongoing item (starts earlier), ongoing multi-day item.

## Docs
CONTEXT.md [[Focus]]; CARD_CONTENT_SPEC 2b; CARD_SYSTEM D11 already decided.

## Left for #431
Buckets (start-only/deadline), `NOW · since`, free-time `until {next}`.
