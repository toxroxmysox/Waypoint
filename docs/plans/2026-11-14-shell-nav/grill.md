# Shell and navigation: grill record

Source: https://github.com/toxroxmysox/Waypoint/issues/584 · Date: 2026-11-15 · ADR: [0026](../../adr/0026-navigation-follows-trip-stage.md)

Sibling records, same review: `2026-11-14-appshell-single-render` (#585, lands first), `2026-11-14-design-rules` (#581), `2026-11-14-card-rules` (#582).

## Problem Statement

On a phone, the app's chrome crowds out the trip. At the 457px folded Duo width, the Day page stacks a mode pill, a NavBar, a "1 / 6" pager, an H1 and a Phase chip, and the first item starts about 365px down a 657px viewport (measured on `.visual/review-457/trips_slug_days_day1_@457.png`). Titles are said twice ("Fri, Nov 13" in the bar, "Friday, November 13" below it; trip name in the bar and as the Overview H1). The way between Planning and Trip Mode is a pill on every screen plus a second button on the Overview, and Trip Mode's add button sits in slot 3 of 4, off centre.

## Intent & Success Criteria

Less chrome, one way to do each thing, the same bar in both modes.

- On the Day page at 457 × 657, the first item starts above the halfway line.
- Every screen states its title once at a time: large in the content at rest, in the bar after scrolling.
- Opening an active trip lands on Now. From any screen in either mode, the other mode is one tap away in the same place (bottom nav, rightmost slot).
- The + is centred in the bottom nav in both modes.
- The trips list has no account actions in its body or bar beyond an avatar link to Account.

## User Stories

1. As a traveler opening an active trip, I want to land on Now, so that what's happening is the first thing I see.
2. As a traveler mid-trip, I want a "Plan" tab in the rightmost nav slot, so that I can reach the full plan in one tap.
3. As a planner on an active trip, I want a "Trip" tab in the same rightmost slot, so that going back to Trip Mode works the same way as leaving it.
4. As a traveler, I want my manual switch to reset when the app cold-launches, so that each fresh open defaults to Now.
5. As a planner before the trip, I want the rightmost slot to take me to Ideas, so that voting on ideas is one tap away.
6. As a member after the trip, I want the rightmost slot to take me to Closeout during wrap-up and to Memories once closed.
7. As any member, I want the bottom nav to have the same shape in both modes (home · Money · + · More · stage slot), so that I don't relearn it when the mode changes.
8. As any member, I want the + centred in the bottom nav in both modes, so that adding is always in the same place and no floating button covers content.
9. As any member, I want Docs, Members and Lists under More, so that the bar holds only what I use most.
10. As a planner on the Day page, I want a horizontal date strip instead of "1 / 6", so that I can see the trip's days and jump to any of them.
11. As a planner on a long trip, I want the strip to scroll sideways with the selected day in view.
12. As a planner, I want today marked in clay in the strip and a thin divider where phases change, so that I can see where I am.
13. As a planner, I want the Phase chip to stay under the day title, so that the phase stays one tap away.
14. As any member, I want a screen's title shown large at rest and moved into the bar when I scroll, so that it appears once at a time and stays visible.
15. As any member on Item detail, I want the item's name as the title (and in the bar after scrolling), not the trip name.
16. As any member, I want Sign out and Import from JSON on the Account page, reached from an avatar in the trips list bar.
17. As a planner, I want section labels in the mode colour (moss Planning, clay Trip), so that the mode is visible without a pill.

## Decisions

- **Bottom nav, both modes:** home (Itinerary / Now) · Money · + · More · Stage Slot. ADR-0026.
- **Stage Slot:** planning → Ideas (voting); active → "Plan" (in Trip Mode) / "Trip" (in Planning Mode); wrap-up → Closeout; closed → Memories. Forming trips keep their current tab set. ADR-0026.
- **The + replaces the floating action button** in both modes. It opens the existing add sheet, tinted by mode.
- **More holds Docs, Members and Lists** (Lists also stays an Overview sub-tab). Its groups are set in the card-rules record.
- **Mode by date:** opening an active trip routes to Now. The manual switch stays in-memory, as today, and resets on a cold launch.
- **Removed:** the floating mode pill and the Overview "Trip Mode" button.
- **Trip Mode icon:** the navigation arrow, used for both the Now tab and the "Trip" switch. "Plan" uses the Itinerary calendar icon. The clock is no longer used for the mode.
- **The page-decides-chrome rule stays:** Overview and Day pages render Planning chrome. Item and Docs pages keep the mode you came from. Now and Money summary render Trip chrome.
- **Date strip (Day page):** replaces the pager. Each chip (weekday over day number) is a link to that day; there is no swipe between days, because swiping would clash with drag-to-reschedule. The selected day is filled, today's number is clay, a hairline divider marks phase changes, and there are no fullness dots. It scrolls sideways and keeps the selected chip in view. The Phase chip stays under the title.
- **Titles: large-title collapse.** At rest, the screen's title is large (Fraunces) in the content, and the bar shows only back, small context and actions. Once the large title scrolls out, the bar shows the short title. Applies to Overview, Day and Item detail. Day: large "Friday, Nov 13", bar after scroll "Fri, Nov 13". Item: the item name.
- **The collapse is built once in the shell** (from #585's grid), not per page.
- **Trips list:** Sign out and Import from JSON move to `/account`. The bar's right slot gets an avatar linking to Account.
- **Breakpoints follow #585:** unfolded portrait (669) is a wider phone with the same bottom nav. The side rail starts at ≥820.

## Testing Decisions

- **Unit (Vitest):** the nav config as a pure function of (lifecycle stage, mode) → tab list. That's where the Stage Slot logic lives, and there's prior art in `src/lib/shell/nav-tabs.test.ts`. Also the landing rule (active trip → Now).
- **E2E (Playwright, `pnpm test:e2e:clean`):**
  - mid-trip open lands on Now;
  - "Plan" ↔ "Trip" round trip from the rightmost slot;
  - the date strip navigates to another day;
  - the + opens the add sheet in both modes;
  - Docs and Members are reachable through More.
  - `goto` then `waitUntil: 'networkidle'` before clicks.
- **Grep `tests/` in the same commit** for: "To Trip Mode", "To Planning Mode", "Trip Mode" button, FAB selectors, the Members and Docs tab labels, "1 / 6"-style pager text, Sign out and Import on `/trips`.
- **Visual:** `pnpm verify:visual` at 375, 457, 669 and 951 for trips list, Overview, Day, Item, Now and Money. Scott sweeps them.

## Out of Scope

- Swiping between days.
- Fullness dots or any other day-load indicator in the strip.
- Changing the forming-trip tab set.
- Per-tier layouts for the unfolded inner display (#553).
- Dark mode (#583) and weather on day headers (#589).
- Type tokens and label styling details (#581). Grouped-list visuals for More (#582).

## Assumptions & Open Questions

- **Assumption:** the planning Stage Slot links to the existing `/trips/[slug]/ideas` page, labelled "Ideas". Scott said "voting". If he wants it to open the Swipe-Quiz or be labelled "Vote", that's a copy or link change at the sweep.
- **Assumption:** the wrap-up Stage Slot links to `/closeout` and the closed one to `/memories`, both existing routes. Neither was looked at in this grill.
- **Assumption (inference, not verified):** the trips list currently links active trips to Overview, not Now. A grep found no `/now` link.
