# #433 Rows, part 1: plan

Refs #418 (D11). Scope: one two-line Row, adopted on the booking Smart List, the flights Smart List, money's Still planned, and the overview's Flights & stays. Rows part 2 (#434) adopts it elsewhere.

## Derivations (pure, `src/lib/itinerary/row.ts`, Vitest red-first)
- `rowSub(item, {dayDate, phaseName})`: the sub-line text for non-flights. Single day: `Thu Oct 1 · 6:30p · Place` (date prefix, `formatTimeText` grammar, place = location else phase name). Multi-day (lodging with `end_date`): `Thu Oct 1–Sat Oct 3 · 2 nights · Place`. Omits empty parts.
- `flightSub({departure, arrival, from, to})` -> `{date, dep, arr, route}`. `route` is `MKE → DEN` from airport codes, else the labels. A later-day arrival reads `4:20p +1`; a clock-less red-eye shows the arrival date.
- `fitFlightSub(sub, available, measure)`: drop order **arrival time -> departure time -> date**; the route never drops (CSS truncates it last). Returns the text and what dropped.
- `rowTrailing({chip, cost, people})`: which single trailing value shows. Priority: chip (Booked confirmation, Needs booking) > cost > people > chevron.

## UI
- `src/lib/ui/Row.svelte`: optional leading snippet (left of the icon), 16px `MonoTypeIcon`, title, sub-line (string or snippet), trailing snippet, hairline divider. Whole body is a 44px link.
- `FlightSubLine.svelte`: measures its width, runs `fitFlightSub`.
- `NeedsBookingChip.svelte`: the #420 / #426 gold chip, extracted for new code (CardStrip / DayCard keep their inline copies; swap later).
- Surfaces: booking list (leading checkbox, `Booked` chip when pending, else chevron), flights list (people bubbles else chevron), money Still planned (`$cost` trailing), overview Flights & stays (Needs booking chip else chevron; separate small flight+lodging query for the sub-line fields, sorted by date).

## Verification
Vitest at the `row.ts` seam; `pnpm check`; `E2E_SLOT=2 pnpm test:e2e:clean`; `verify:visual` 375/768 with a seeded flight whose sub-line overflows; `grep tests/` for removed labels (`Open`).
