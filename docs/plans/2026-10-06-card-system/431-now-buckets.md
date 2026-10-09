# #431 — Now feed: every item in exactly one bucket

Refs #431, #392 (spec #418, CARD_SYSTEM D11 + #392 calls 2026-10-06). Bug-flavoured; single session, inline.

## Rules (decided)
Bucket by time shape (`timeShape`), against trip-local `now`:
| Shape | before | during | after |
|---|---|---|---|
| untimed | Coming up | - | - (never past) |
| range | Coming up | ongoing (Hero), start <= now < end | Earlier today |
| end-only (deadline) | Coming up | - | Earlier today (no overdue state) |
| start-only | Coming up | ongoing (Hero `NOW · since 1:00p`) from start until the next timed item starts | Earlier today |
| multi-day (`end_date`) | none | none (banners/Spans) | none |

"Next timed item" = another non-multi-day item with a `start_time` strictly later than the start-only item's start and <= now. Deadlines (no start) never supersede. Two start-only items sharing a start are both ongoing. With no later timed item, a start-only item stays ongoing for the rest of the day.

Countdown (free-time) = earliest of: not-yet-started starts and not-yet-passed deadlines. Free-time only when nothing is ongoing.

## Seam
`now-state.ts`: one `bucketNowItems(items, now)` -> `{ earlier, ongoing, coming }` (disjoint, multi-day excluded). `getNowViewState` + `getNowFeed` derive from it.
- `forwardItems` = anchored (timed or deadline) items in Coming up, earliest first (so `nextItem === forwardItems[0]`).
- `restItems` = coming (forward anchored + untimed, `orderDayItems`).
- `pastItems` = earlier, ordered by anchor time.
- `NowFocus.mid-event.minutesRemaining` becomes `number | null` (null when heroes[0] is start-only: no end to count to).
- `heroStatus`: start-only -> `NOW · since 1:00p` (null before start / end-only).

## Page
`now/+page.svelte` free-time card: `FREE TIME` / large countdown / `until {nextItem.title}`; drop `until next activity`.

## Tests (red first)
Unit (`now-state.test.ts`): table over every shape x before/after, exactly-one-bucket invariant; start-only with/without later timed item, with a later deadline (does not supersede); end-only before/after; untimed; multi-day; countdown target incl. deadline; hero `since` in `hero.test.ts`.
E2E: new spec `trip-mode-buckets.spec.ts` with seed flag `now:'buckets'` (start-only ongoing, past + future deadline, nothing duplicated) and `now:'free'` free-time text.

## Docs
CARD_CONTENT_SPEC 2b/2c; CONTEXT.md Focus/Ongoing if wording needs it.
