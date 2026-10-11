# v3.3 Trip Overview: grill record

Source: conversation, the follow-on to the [v3.3 phase planning grill](../2026-10-11-phase-planning/grill.md) ([#401](https://github.com/toxroxmysox/waypoint/issues/401), [#391](https://github.com/toxroxmysox/waypoint/issues/391)) · Date: 2026-10-11

## Problem Statement

The trip Overview doesn't show the trip → phase → day hierarchy. A stats card, a welcome card and whole-trip lists come before the itinerary, so the phases sit below the fold. Each phase section also mixes in lists, and flights & stays trail below. Getting into a phase takes scrolling plus a small text link. After v3.3's Phase Overview, the Overview's itinerary would also duplicate that tab unless it gets its own job.

## Intent & Success Criteria

The Overview's job is to show the hierarchy and let you jump to anything fast.

- At 375px, every phase can be opened in **one tap without scrolling**, via the trip header's phase chips.
- The page reads top-down as trip → phases → days: the header, then one bordered card per phase with its days inside.
- Each level is a large tap target: phase card header → Phase Detail, day row → day.
- Compact by default (days as small rows), with Details one toggle away (full day cards).

## User Stories

1. As a member, I want the sub-tabs to stay directly under the nav bar on every tab, so that navigation doesn't move.
2. As a member, I want a trip level header on the Overview with title, places, dates · days · nights · phases, and timezone, so that I know the trip's shape at a glance.
3. As a member, I want trip notes in the header, edited in place with the same editor as day and phase notes, so that trip-wide context ("JR passes ordered") has a home.
4. As a member, I want phase chips in the header that each open Phase Detail, so that any phase is one tap away without scrolling.
5. As a member on an active trip, I want the Trip Mode button kept in the header, so that I can switch to the live view.
6. As a member, I want no Capture ideas link in the header, so that the header stays about the trip; the FAB covers capture.
7. As a member, I want the trip header only on the Overview, so that Phases, Lists and Goals lead with their own content.
8. As a member, I want an Itinerary section with a Compact / Details toggle in place of Booked / Budget, remembered per viewer and defaulting to Compact, so that I choose how much detail I see.
9. As a member, I want each phase shown as a bordered card holding its days, so that the grouping reads visually.
10. As a member, I want the phase card's header area (name, location, dates · days · nights, phase notes) to be one large tap target into Phase Detail, so that getting in is easy.
11. As a member in Compact mode, I want each day as a small row showing the date, a Travel day ⇄ marker when shared, and "N planned", so that the whole trip fits on screen.
12. As a member in Details mode, I want each day as today's full day card, so that I can see each day's contents without opening it.
13. As a member, I want every day row or card to open that day, so that one tap reaches the day.
14. As a member, I want no lists (trip or phase) and no Flights & stays section on the Overview, so that it stays a hierarchy; the Lists tab and Phase Detail's Staying row cover them.
15. As a member of a trip with no phases, I want the header without phase chips followed by a flat list of compact day rows, with the welcome card's existing doors, so that a new trip still teaches the next step.
16. As a member, I want trip notes included in export/import and the MCP trip read, and editable through the AI write path, so that they behave like phase notes.

## Decisions

- **Release:** v3.3, as a second wave after the phase screens. It shares the Level Header with them.
- **Scope:** the planning-state Overview, including the active-trip Trip Mode button. Forming (scenario board), wrap-up (banner) and closed (record) are unchanged.
- **Trip Notes are a stored field on trips**, appended by migration. Same editor as day notes. Included in portability, the MCP read, and the AI generic update op (extend the trips allowlist if needed). Added to the glossary.
- **The guarantee of one tap without scrolling is the header's phase chips**, not the itinerary list, so it holds for any number of phases and with the welcome card shown.
- **Compact / Details** replaces the Booked / Budget toggle *on the Overview only*. Phase Detail keeps Booked / Budget, and Details-mode day cards follow that shared preference.
- **The Overview drops** whole-trip lists, per-phase lists, Flights & stays, and the Capture ideas link. This reverses the 2026-10-10 placement of Flights & stays below the itinerary.
- **The sub-tabs stay** under the nav bar, above the trip header (as today).
- **Phase notes show on the Overview's phase cards**, in full.

## Testing Decisions

- **Vitest:** the days · nights · phases span label, and a compact day row's "N planned" count (planned items only, Travel Day counted in both phases). Prior art: `src/lib/itinerary/day-card.test.ts`.
- **Playwright (`pnpm test:e2e:clean`):**
  - A header phase chip opens Phase Detail.
  - A phase card header opens Phase Detail.
  - A compact day row opens its day.
  - Compact/Details persists across a reload.
  - Editing trip notes persists.
  - No lists or Flights & stays render on the Overview.
  - Use `waitUntil: 'networkidle'` before clicking.
- **Removed sections:** grep `tests/` for Flights & stays, MiniListCard, Capture ideas and DayMetricToggle selectors on the Overview, and fix them in the same commit.
- **Migration:** trip notes are verified on a fresh PB.
- **Visual:** `pnpm verify:visual` at 375px and 768px in both modes, plus a no-phase trip.

## Out of Scope

- Forming, wrap-up and closed Overviews.
- A trip-wide swipe launcher (may come back on the Overview later; not now).
- Trip-level In/Out.
- Moving lists anywhere new (the Lists tab already has them).

## Assumptions & Open Questions

- **Assumed:** trip notes use the same edit permission as day notes. Planning confirms the rule.
- **Assumed:** "N planned" counts items with status planned on that day, not done or considered. During an active trip it still counts planned.
