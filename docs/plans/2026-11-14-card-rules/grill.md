# Card rules: grill record

Source: https://github.com/toxroxmysox/Waypoint/issues/582 · Date: 2026-11-15

Order in the wave: #585 → #584 → #581 → **#582**. Uses #581's type and label tokens.

## Problem Statement

"Card soup": rows that navigate or set something are drawn as separate bordered cards (six on the More page), cards sit inside cards (Overview phase card with shadowed day rows), and note-type or untimed cards show an empty lower half ("Pack the clubs", "Night walk"). Item detail scatters its actions over an outlined block, a collapsed card and a dashed box.

## Intent & Success Criteria

A card means "this is one thing". Navigation and settings look like a list.

- A `ListGroup` primitive exists in `src/lib/ui`, and the offenders below use it.
- No bordered card sits inside another bordered card on any swept screen.
- No card shows an empty line.
- Scott has swept 375, 457 and 669 screenshots of More, Overview, Day, Now, Item, Settings, Members and Account.

## User Stories

1. As any member, I want navigation and settings rows grouped into one rounded surface with hairline dividers and a section label above, so that I can tell them apart from things.
2. As any member on More, I want three groups (This trip: Docs, Members, Lists, Inbox with its count; Manage: Settings, Export, Clone, Archive; Help), so that I can find what moved out of the bottom nav.
3. As a planner on Overview, I want a phase's days as plain divided rows inside the phase card, each with its "N planned" count.
4. As any member on Day or Now, I want a note or untimed item card only as tall as its content.
5. As any member on Item detail, I want Log payment, + Document and + Checklist as one grouped action list.
6. As any member on Item detail, I want Plan details as a plain group that's open by default.
7. As any member on Settings, Members and Account, I want the same grouped-list treatment wherever rows navigate or set something.

## Decisions

- **A card is one object** (Item, Trip, Scenario). Rows that navigate or set something go in a `ListGroup`: inset grouped (one rounded surface on the paper background, hairline dividers, optional trailing value or chevron, #581 section label above).
- **No bordered card inside a bordered card.**
- **Card height comes from content.** No minimum height that leaves an empty second line.
- **More:** This trip (Docs, Members, Lists, Inbox with its count as the trailing value) · Manage (Settings, Export, Clone, Archive) · Help. Lists here is a second way in, alongside the Overview sub-tab. Closeout moves to the Stage Slot during wrap-up (ADR-0026).
- **Overview:** day rows inside the phase card become plain divided rows.
- **Item detail:** one grouped action list. Plan details is open by default for now.
- **Settings, Members and Account** get an audit for the same pattern, and offenders move to `ListGroup`.

## Testing Decisions

- No unit tests (presentational).
- E2E: keep the existing specs green. Grep `tests/` for the Card selectors and labels each surface drops, and fix them in the same commit. Re-check the More navigation specs, since #584 adds Docs, Members and Lists there.
- `verify:visual` at 375, 457 and 669 for each migrated surface. Scott sweeps.

## Out of Scope

- Item card content or layout beyond removing the empty line.
- New More-page entries other than Docs, Members and Lists.
- Dark mode.

## Assumptions & Open Questions

- **Assumption:** the exact list of Manage entries is whatever More shows today minus Closeout. The plan should confirm it against `more/+page.svelte`.
