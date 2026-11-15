# Weather on day headers: grill record

Source: https://github.com/toxroxmysox/Waypoint/issues/589 · Date: 2026-11-15

Builds on the header from `2026-11-14-shell-nav` (#584: large-title collapse, date strip, Phase chip under the title). Glossary: **Forecast**, **Typical**, **Travel Day** in `CONTEXT.md`.

## Problem Statement

Planning the last two weeks before a trip and living it day to day both depend on the weather (what to pack, which day takes the hike), and Waypoint shows none. Members check a separate weather app and translate dates and cities in their heads.

## Intent & Success Criteria

A glance, not a weather app: each day says what to expect where you'll be.

- A Day page inside the forecast window shows the Forecast beside the Phase chip without any tap.
- A Day page beyond the window shows a muted Typical in the same place; it cannot be mistaken for a forecast (no glyph, "Typically" label).
- A Travel Day shows both phases' weather, in phase order.
- Now shows today's Forecast with the city name under the large title; Next 3 days shows each day's Forecast on its section header.
- A day with no resolvable place, a past day, or a failed lookup shows nothing, and the header looks complete without it.
- Temperatures follow the member's unit setting; a new member sees °F.
- Offline, the last loaded weather still shows (follows the existing snapshot rules).

## User Stories

1. As a planner within ~16 days of a trip, I want each Day page to show that day's forecast high/low and condition, so that I can schedule outdoor plans around the weather.
2. As a planner further out, I want a muted "Typically 57° / 43°" on each Day page, so that I know what to pack before forecasts exist.
3. As a planner, I want a typical to switch to a forecast automatically once the day enters the forecast window, so that I never see both or a stale guess.
4. As a traveler, I want the Now page to show today's forecast with the city name under the title, so that I see it the moment I open the trip.
5. As a traveler, I want each day in Next 3 days to show its forecast, so that I can plan the next few days.
6. As a member, I want the rain chance shown only when it is 40% or higher, so that dry days stay clean and wet days stand out.
7. As a member on a Travel Day, I want both cities' weather ("Tokyo 66°/52° → Kyoto 61°/47°"), so that I know what to expect at both ends.
8. As a planner, I want the phase location field to be a place picker (cities and regions), so that the weather is for the right place.
9. As a planner who types a location without picking a suggestion, or who has phases from before this change, I still want weather, so that nothing needs re-entering.
10. As a member, I want to choose °F or °C in Account, defaulting to °F, so that temperatures read naturally to me.
11. As a member, I want past days and phases with no place (e.g. a theme-only phase) to show no weather and no error, so that the header never looks broken.
12. As a member, I want the weather to be display-only (no tap target), so that it never competes with the Phase chip.
13. As a member, I want an Open-Meteo credit in Account, so that the data licence is honoured without cluttering headers.

## Decisions

- **Source:** Open-Meteo, server-side. Forecast API inside the window; historical archive (ERA5) for Typicals. Free non-commercial tier (<10k calls/day), CC BY 4.0 — credit line in Account. No key.
- **Place per phase:** the phase location field becomes the existing Places autocomplete (same as items), restricted to cities and regions. A pick fills location text, country code and coordinates. Coordinates are stored on the phase (migration adds them).
- **Fallback geocode:** a phase with location text but no coordinates (typed free text, or every existing phase) is geocoded lazily with Open-Meteo geocoding, filtered by its country code, on its first weather request, and the result stored. Changing the location clears stored coordinates. No backfill migration that makes network calls. Geocode failure → no weather, silently.
- **Granularity:** city/region-level weather is enough ("generic Tokyo"). No per-item or per-address weather.
- **What shows (Forecast):** condition glyph, high / low, and rain chance only when ≥40%.
- **What shows (Typical):** "Typically H° / L°", muted, no glyph, no rain chance. Basis: 10-year mean of the date ±3 days. Shown only beyond the forecast window, Day header only.
- **Travel Day:** both phases, in phase order, "City H°/L° → City H°/L°", each with its own glyph and gated rain chance (or both Typicals). No "where am I most of the day" logic.
- **Placement, Day header:** option B, in the row beside the Phase chip, under the large title. A Travel Day's two-city line wraps under the chip row. Header looks complete without it.
- **Placement, Now:** a line under the large "Now" title, above the Today / Next 3 days sub-tabs, always with the city name.
- **Placement, Next 3 days:** compact line right-aligned on each day's section header.
- **Not shown:** Overview day rows, the date strip, past days, any day without a resolvable place.
- **Units:** per-user °F/°C in Account beside "Open links in"; default °F for everyone (not locale).
- **Display-only:** no tap, no link out, no detail sheet.
- **Caching:** server-side per place + date (TTL is the plan's call; forecasts change a few times a day, Typicals effectively never). The weather ships in the SSR payload so offline snapshots carry it.
- **Offline / staleness:** a stale snapshot shows its weather as is; the existing offline banner is the only staleness signal.
- **Must not block the page:** a slow or failed weather fetch never delays or breaks the Day / Now render.

## Testing Decisions

- **Unit (Vitest), the pure seam:** given (day date, today, the day's phases with coordinates, forecast/typical data, unit) → what to display: forecast vs typical vs nothing, rain gate at 40%, travel-day pair ordering, past-day suppression, °F/°C conversion and rounding. Typical computation (10-year mean of date ±3 days) from a fixture series.
- **Unit:** geocode-fallback decision (has coords → use; has text, no coords → geocode; no text → none; location changed → coords cleared).
- **No live Open-Meteo calls in tests.** Fixture the HTTP boundary.
- **E2E (`pnpm test:e2e:clean`):** one spec, weather stubbed at the server boundary: Day header shows forecast beside the chip; a far-future day shows "Typically"; units toggle in Account changes the reading. `goto` + `networkidle` before clicks.
- **Grep `tests/`** if the phase location field's selector or label changes with the picker swap.
- **Visual:** `pnpm verify:visual` at 375 and 457 for Day (normal, travel day, typical, none) and Now. Scott sweeps.

## Out of Scope

- Hourly forecasts, weather alerts, maps or radar (embedded maps are off the table).
- Weather on Overview, the date strip, Item detail, or the Overview day rows.
- Recording actual past weather for Memories or Closeout.
- Inferring which city a Travel Day "mostly" happens in.
- Per-trip or locale-derived unit defaults.
- Rain chance or glyphs for Typicals.

## Assumptions & Open Questions

- Assumed: Places Autocomplete (New) can restrict suggestions to cities and regions, and Place Details can return a country code alongside coordinates. The plan verifies the exact parameters.
- Assumed: one archive request covering 10 years of daily highs/lows per place is within Open-Meteo's free limits; the plan confirms call weighting and picks a cache that keeps total calls well under 10k/day.
- Assumed: the forecast window is 16 days from today in the phase's timezone; the exact cutoff and timezone handling are the plan's call.
