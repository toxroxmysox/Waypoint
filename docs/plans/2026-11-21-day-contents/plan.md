# #546 — Day contents: actionable slice

Refactor, no behaviour change. No full "day contents" module (issue: build only if day surfaces get busy again).

## Audit (2026-11-21, by grep on main @ 0adc312)

| Issue item                                      | State                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `days/[dayId]` hand-rolled span filters         | Already uses `DISCRETE_FILTER`/`SPANNING_FILTER` (#498). Nothing to do.                                                                                                                                                                                                                                                                                                                                              |
| `isMultiDay = isSpanning` aliases               | Present in `now-state.ts`, `current-phase.ts`, `plan-idea.ts`. `promote.ts` no longer exists.                                                                                                                                                                                                                                                                                                                        |
| Lodging-for-night ×4                            | `audit.ts`, `get-trip.ts`, `trip-brief.ts`, `phase-logistics.ts` all use `lodging-nights.ts`. `day-card.ts` legitimately differs: it uses `spanningItemsForDate` to include the check-out day (a "Check-out" chip is not a night). The digest (now `backend/pb_hooks/digest-core.js`, #542) lists stays by check-in date for the pre-trip brief and runs in a PB sandbox (cannot import TS). Neither is a duplicate. |
| Parking Lot `status = "unplanned"` hand-written | 5 filters in 4 loaders: `now`, `days/[dayId]`, `phases`, `phases/[phaseId]` (×2). `(status = "planned" \|\| status = "unplanned")` (swipe deck eligibility) and `status != "unplanned"` are not the Parking Lot; left alone. `backend/pb_hooks/phases.pb.js` has its own copy: PB sandbox, cannot import TS, left.                                                                                                   |
| `isTravelTransition`                            | Already gone.                                                                                                                                                                                                                                                                                                                                                                                                        |

## Changes

1. `trip-mode/spanning.ts`: `isSpanning` → `showsAsSpan` (glossary: _shows as a Span_ = Card Shape; **Multi-day Item** = data). Update callers (`mcp/day-data.ts`, `mcp/tools/trip-brief.ts`). Delete the three aliases; callers use `showsAsSpan` directly. `multi-day.ts` `isMultiDay` keeps its data meaning.
2. New `itinerary/parking-lot.ts`: `PARKING_LOT_FILTER = 'status = "unplanned"'`. Swap into the 5 filters; one-token diff per site (parallel #543 touches the same loaders).
3. `grep tests/` for renamed identifiers. Selectors unchanged (no UI change → no `verify:visual`).

## Verify

`pnpm check`, `pnpm test`, `pnpm test:e2e:clean`.
