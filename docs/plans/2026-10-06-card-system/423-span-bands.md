# #423 Span bands — plan

Source: spec #418 §Span, CARD_SYSTEM D10/D11. Replaces `MultiDayBanner` (solid accent + `Ongoing` pill).

## Tasks
1. **Seam (red first).** `spanBandText(item, days, date)` in `src/lib/itinerary/multi-day.ts` returns `{ phase: 'first'|'middle'|'last', text }`. Vitest in `multi-day.test.ts`: stay first/middle/last and rental pick-up/middle/return, with and without times. Wording is the spec's, clock via `formatClock`, weekday via `formatCalendarDate` (UTC, no local Date math). Lodging = stay; transportation = rental (Pick up / Day N of M / Return); other types = neutral (Starts / Ends).
2. **Component.** `SpanBand.svelte` replaces `MultiDayBanner`. Full-width `bg-surface-2` link (min 44px), `MonoTypeIcon` 24 absolutely centred in the 48px rail column, title left-padded to `RAIL.column + RAIL.gap + 12` (card padding) so it lines up with card titles. Sub-line ink-soft. Outside the dnd zone (rendered above `DragDropTimeline`, as today).
3. **Wire** day page + Now (top of `<main>`); drop `ongoing` prop and Pill.
4. **Seed** `{span:true}` in dev-auth: timed stay (day3 to day6) + car rental (day2 to day5).
5. **E2E** fix `multi-day.spec.ts` (`a.bg-accent` and `night X of N` locators).
6. **Docs** CARD_CONTENT_SPEC §2a/2c amended.
7. **Verify** check, unit, e2e clean slot 1, 375 + 768 screenshots.
