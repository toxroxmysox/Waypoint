# #426 Overview day cards: plan

Refs #418 (D10). Scope: the shared `DayCard` (trip overview + Phase Detail).

## Derivations (pure, `src/lib/itinerary/day-card.ts`)
- `needsBookingCount` on `DayCardSummary` = `bookableCount - bookedCount`.
- `StayChip` gains `text`: `Night N of M · Name` (check-in and middle days, via `nightInfo`), `Check-out · Name` on the check-out day. Middle days now emit a line (were blank since #221): the example in the issue is a middle day.
- `todayTreatment(dayDate, today, mode)` -> `'outline'` (Planning Mode) | `'pill'` (Trip Mode) | `'none'`. Date compare on calendar-date strings only.
- `today` on both pages becomes the trip-local date (`tripToday(tripTz(trip))`), not `toISOString()`.

## UI (`DayCard.svelte`)
- Date block centred vertically (self-center in the row).
- Today in Planning Mode: `outline-accent` (AppShell sets accent = moss in Planning); Trip Mode keeps the TODAY pill.
- Stay line: ink-soft text, 16px MonoTypeIcon `lodging`, no moss.
- Gold pill `N needs booking` replaces `x/y booked`, styled like the #420 strip chip. Shown in the booked-metric view only; nothing when nothing needs booking.

## Verification
Vitest at the day-card seam (red first); `pnpm verify:visual` 375/768; `E2E_SLOT=2 pnpm test:e2e:clean`; `grep tests/` for removed labels.
