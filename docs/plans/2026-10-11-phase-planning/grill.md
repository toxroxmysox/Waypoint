# v3.3 Phase planning: grill record

Source: [#401](https://github.com/toxroxmysox/waypoint/issues/401) (rescoped here) and [#391](https://github.com/toxroxmysox/waypoint/issues/391) · Date: 2026-10-11

## Problem Statement

Phases exist, but the app doesn't make clear what they're for. The Phases tab is only a calendar editor. Tapping a phase name there renames it, and the only way into a phase is a tiny `›` per row. Phase Detail is a good screen (days plus parking lot), but it's hard to reach. It doesn't say how you get in or out of the leg, or where you sleep. It can't place an idea onto a day, and you can't rate only this phase's ideas from it. Explanatory copy won't fix this. The screens have to *do* what a phase is for.

## Intent & Success Criteria

A phase answers, through function rather than text, five questions about a leg of the trip:

1. **What are we doing here?** Its days and their plans, plus its notes.
2. **For how long?** Dates · N days · N nights.
3. **How do we get in and out, and where do we sleep?** The Arrival, Staying and Departure rows.
4. **What are the options?** The parking lot, ranked by votes.
5. **Do we want any of them?** A per-phase swipe quiz, and a two-tap placement onto a day.

Observable outcomes:
- From the Phases tab, one tap on a phase card opens its Phase Detail.
- Every phase card shows its span in days *and* nights, its full notes, day chips, and a swipe row.
- On Phase Detail, In / Staying / Out each show either the item(s) or an open state with Add.
- An idea can be planned onto any day of its phase in two taps without leaving Phase Detail, and the move can be undone.
- Trip, phase and day pages share one level-header shape.

## User Stories

1. As a member, I want the Phases tab to list every phase as a card, so that I can see the legs of the trip at a glance.
2. As a member, I want each phase card to show name, location, dates, days and nights, so that I know how long we're in each place.
3. As a member, I want each phase card to show the phase's full notes, so that I can read leg-level context without opening it.
4. As a member, I want day chips on each phase card that open that day, so that I can jump straight to a day.
5. As a member, I want a swipe row on each phase card ("N ideas · M to rate · Swipe") where the whole row opens that phase's swipe quiz, so that I can rate one leg's ideas.
6. As a member, I want a phase with nothing left to rate to show "all rated" with no swipe button, and a phase with no ideas to hide the row, so that I'm not offered an empty deck.
7. As a member, I want tapping anywhere else on a phase card to open Phase Detail, so that the phase is easy to get into (#391).
8. As an owner, I want the calendar editor below the phase cards under "Edit phases", so that restructuring is still available but secondary.
9. As an owner, I want the editor's `›` link removed, so that the cards are the only way into a phase and the editor is only for editing.
10. As a member on desktop, I want phase cards in a two-column grid, so that the extra width is used.
11. As a member, I want no trip-wide swipe launcher on the Phases tab, so that rating stays phase-scoped.
12. As a member, I want Phase Detail's header to show name, location, dates · days · nights, notes and day chips, so that the phase identity matches its card.
13. As a member who can edit day notes, I want to edit phase notes in place on Phase Detail with the same editor, so that adding leg context feels familiar.
14. As a member, I want an **In** row listing the transportation/flight items on the phase's first day, so that I know how we arrive.
15. As a member, I want an **Out** row listing the transportation/flight items on the phase's last day, so that I know how we leave, e.g. Tokyo → Osaka.
16. As a member, I want a **Staying** row listing every lodging that covers at least one of the phase's nights, split stays as separate lines and partial coverage shown as "N of M nights", so that I know where we sleep and where the gaps are.
17. As a member, I want a filled In / Staying / Out entry to open its item, so that I can see details and bookings.
18. As a member allowed to add items, I want an empty In / Out row to offer Add, which opens the item form with the day preset and a transportation-or-flight choice, so that I can fill the gap in place.
19. As a member allowed to add items, I want an empty Staying row to offer Add, which opens the item form as lodging with check-in and check-out preset to the phase's first and last day, so that I can fill the gap in place.
20. As a member, I want the same train on a shared Travel Day to show as one phase's Out and the next phase's In, so that the hand-off reads consistently.
21. As a member, I want a "Rate N" action in Phase Detail's parking lot header that opens this phase's swipe quiz, so that I can decide on this leg's ideas.
22. As an idea's creator, or an owner/co-owner, I want a "Do this" button on each idea card that opens a menu of the phase's days (date plus how full, with the Travel day marked), so that I can place the idea in two taps.
23. As that member, I want the placed idea to land untimed at the end of the day, leave the parking lot, update that day's summary in place, and show a "Planned on <day>" toast with Undo, so that I can keep sorting without leaving.
24. As a member not allowed to plan an idea, or viewing a pending ghost card, I want no "Do this" button, so that I'm not offered something that will be refused.
25. As a member on desktop, I want the same "Do this" button rather than drag, so that there is one gesture everywhere.
26. As a member, I want the swipe quiz to return me to wherever I launched it from (Phase Overview or Phase Detail), so that rating doesn't strand me.
27. As a member, I want the trip Overview's stats card rebuilt as the trip level header (dates · days · nights · phases, timezone, phase chips that open Phase Detail; Capture ideas and Trip Mode kept), so that the trip → phase → day ladder is consistent.
28. As a member, I want the day page's header to be the day level header (date, phase chip(s), Travel day pill, day notes edited in place), so that the day matches the ladder.
29. As a member, I want phase notes included in trip export and import, so that they survive a round trip.
30. As a member using Claude, I want phase notes in the MCP trip read, and editable through the existing AI write path, so that the AI sees and can maintain leg context.

## Decisions

- **Scope:** v3.3 = the Phase Overview, Phase Detail, phase notes and the level header (#401 rescoped, #391). #506, #508 and #516 ship separately as v3.2.1.
- **#401 rescoped:** votes on Phase Detail's parking lot already shipped in #424. The workspace is now "Phase Detail answers five questions", not a new surface or mode.
- **Surface:** Phase Detail is rebuilt in place at the same route. The Phases tab becomes the Phase Overview.
- **Placement gesture:** a two-tap "Do this → day" menu on mobile and desktop alike. Drag-to-scroll on a stacked phone layout misfires, so there's no drag on Phase Detail. It reuses the day page's existing tap-to-plan rule and behavior: untimed, appended to the day's tail, allowed for the creator or an owner/co-owner.
- **Arrival / Departure are derived by day, never stored:** transportation and flight items on the phase's first / last day. Arrival and Departure go in the glossary; the UI labels are **In** / **Out**.
- **Staying is derived:** lodging covering at least one phase night.
- **Phase notes are a stored field on phases**, appended by migration (never edit existing ones). Same editors and editor as day notes. Included in portability and the MCP read, and writable by AI through the generic update op (ADR-0025; if the phases allowlist doesn't cover the field, extend it).
- **Level header:** one shared component for trip, phase and day. Span always reads days · nights. Chips step one level down.
- **Phase Overview card tap targets:** day chips → day; swipe row (the label and the button as one target) → phase swipe quiz; everything else → Phase Detail. In/Staying/Out are not on the card.
- **Trip-wide swipe launcher removed** from the Phases tab. It may come back on the trip Overview later.
- **No trip notes in v3.3.** Expected to be revisited in the trip Overview grill that follows.
- **Glossary:** added Arrival, Departure, Phase Notes, Phase Overview, Phase Detail and Level Header to `CONTEXT.md`.

## Testing Decisions

- **Vitest (pure derivation)** for Arrival/Departure/Staying from a phase's days and items: first/last day, Travel Day sharing, split and partial lodging coverage, and none. Also the days · nights label and the "Do this" day-menu rows (fullness, Travel day). Prior art: `src/lib/itinerary/drag-to-plan.test.ts`, `day-card.test.ts`, `item-span.test.ts`, `phase-tiling.test.ts`.
- **Playwright (critical path, `pnpm test:e2e:clean`):**
  - Phase Overview card opens Phase Detail, a day chip opens the day, and the swipe row opens that phase's deck and returns.
  - "Do this → day" places an idea, and Undo restores it.
  - The "Do this" button is hidden for a traveler who isn't the idea's creator.
  - Editing phase notes persists.
  - Prior art: `tests/e2e/phase-calendar-editor.spec.ts`, `desktop-day-plan.spec.ts`. Use `waitUntil: 'networkidle'` before clicking. Seed through the API, not the UI.
- **Migration:** phase notes are verified on a fresh PB (`e2e:clean`), never :8090.
- **Portability:** the export/import round-trip test asserts that phase notes survive.
- **Visual:** 375px and 768px `pnpm verify:visual` shots of the Phase Overview, Phase Detail, the trip Overview header and the day header.
- **Selectors:** removing the editor's `›` and changing the Phases tab's structure means grepping `tests/` for the old selectors and copy, and fixing them in the same commit.

## Out of Scope

- Drag-to-place on Phase Detail.
- Trip notes.
- A trip-wide swipe launcher.
- In/Out on the day header.
- Merging the Phases tab into the Overview (SPEC_BACKLOG IA idea).
- Desktop card variants (#417).
- #506, #508 and #516 (v3.2.1).

## Assumptions & Open Questions

- **Assumed:** phase notes use the same edit permission as day notes. Planning confirms the current day-notes rule and mirrors it in PB rules.
- **Assumed:** "N to rate" counts the viewer's unvoted ideas in the phase, the same count the swipe deck drains.
- **Resolved by the [trip Overview grill](../2026-10-11-trip-overview/grill.md):** the trip header gains Trip Notes and drops Capture ideas. The Overview itself is redesigned there. That record supersedes story 27 and the "No trip notes" decision above.
