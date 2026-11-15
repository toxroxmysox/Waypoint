# AppShell single render: grill record

Source: https://github.com/toxroxmysox/Waypoint/issues/585 · Date: 2026-11-15

Lands first in the 2026-11-14 design-review wave: #585 → #584 → #581 → #582.

## Problem Statement

`AppShell.svelte` renders every page twice (a mobile copy and a desktop copy, one hidden by CSS). Every page pays double the work, ids are duplicated, each copy keeps its own state, and Playwright and Browser refs silently drive the hidden copy. The breakpoints (900px / 1280px) don't line up with the Duo's real viewports. The shell nav work (#584) also needs one place for the bottom nav, the bar and the large-title collapse.

## Intent & Success Criteria

One render of the page, with chrome positioned by breakpoint.

- The page's content renders once outside the immersive branch.
- E2E is green on `pnpm test:e2e:clean`, and the workarounds for the hidden copy are deleted from `tests/`.
- `verify:visual` at 375, 457, 669 and 951 is unchanged or better.
- The dual-render warning comes out of `CLAUDE.md`.

## User Stories

1. As any member on a phone (<600), I want the bottom nav and the top bar, as today.
2. As a member on the unfolded Duo in portrait (600–819, e.g. 669), I want the same phone layout with a wider content column.
3. As a member at ≥820 (unfolded landscape 951, desktop), I want the side rail instead of the bottom nav.
4. As a member at ≥1280, I want the context rail as well, as today.
5. As a developer, I want one copy of each page in the DOM, so that tests and browser tools act on what the user sees.
6. As a developer building #584, I want the shell to own the scroll observation for the large-title collapse, so that pages only declare their title.

## Decisions

- **Breakpoint tiers:** <600 and 600–819 both use the phone layout (top bar + bottom nav), and 600–819 only widens the content. ≥820 uses the side rail. ≥1280 adds the context rail. This replaces the 900 tier.
- **The shell is one grid** with named areas (rail, top bar, main, context rail, bottom nav). Breakpoints only move or hide chrome areas, never the page.
- **The large-title collapse is a shell feature:** the shell watches the page's title element and swaps the short title into the bar. Pages pass a title and a short title. #584 relies on this.
- **Unfolded portrait gets no special layout yet.** #553 owns per-tier layouts and builds on this grid.

## Testing Decisions

- E2E is the seam: run the full suite on `pnpm test:e2e:clean`. Grep `tests/` for `:visible` filters, `.first()`/`.nth()` workarounds for the duplicate, and `md-desktop:hidden` references, then delete the ones that are no longer needed.
- `verify:visual` at 375, 457, 669 and 951, compared with the current output. Scott sweeps.
- No unit tests: layout only.

## Out of Scope

- The new nav contents, date strip and titles (#584).
- Per-tier tuning for the Duo inner display (#553).
- Any visual restyling.

## Assumptions & Open Questions

- **Assumption:** the immersive branch (swipe minigames) stays a separate full-screen render. That's allowed, because it's never shown at the same time as the normal one.
