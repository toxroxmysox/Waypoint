# ADR-0012: Historical back navigation with logical fallback

Status: Accepted (2026-06-15)
Issue: #214

## Context

The global `NavBar` back arrow hard-codes one static destination per screen via a `backHref` prop — the screen's *logical home*. Item-detail, for example, computes it as `?from=trip ? Today : itemDay ? day : itemPhase ? phase : Overview` (#197 made it mode-aware). But many screens are reachable from several entry points, and a single static target can't be right for all of them.

Concretely (#214): opening a multi-day item from the trip Overview and tapping back sent the user to the item's **day view** (its logical home — a multi-day item has a start day), not the **Overview** they came from. The back arrow answered "what is this screen's parent?" when the user expected "where was I?"

Only 7 links app-wide tag their origin (`?from=…`), so the existing mechanism cannot generally reconstruct the entry point.

## Decision

`NavBar` back is **historical** when in-app history exists and **logical** as a deep-link fallback:

- If the user has navigated within the app (in-app history depth > 0), back = `history.back()` — the actual previous screen.
- On a cold load or deep link (no in-app history — notification, shared URL, refresh), back = the screen's existing `backHref` (the logical, mode-aware target).
- In-app history depth is tracked client-side via SvelteKit `afterNavigate`: push navigations (`link`/`goto`/`form`) increment, `popstate` applies `navigation.delta`, `enter` (cold load) resets to 0. Wired in `(app)/+layout.svelte`.
- Edit and wizard **completion** navigations use `replaceState`, so back never returns into a transient form or a finished wizard step.
- The change is confined to `NavBar` plus the depth store; per-screen `backHref` props are retained and demoted to fallbacks. No per-screen plumbing.

## Consequences

- Back means "the previous screen you were on" across every multi-entry screen at once — the #214 Overview→item→back case and all others.
- Back is now strictly one-step-historical in-app; there is no always-jump-to-logical-home. Reaching a section root from deep in a chain uses the nav tabs (standard mobile behavior). Accepted deliberately.
- The deep-link fallback keeps a sane back for shared/notification entries; #197's mode-aware target survives there.
- `NavBar`'s back affordance changes from `<a href>` to a `<button>` (loses right-click-to-open; acceptable for a back control). E2E selectors that target it as a link must move to button/label.

## Alternatives considered

- **Pure `history.back()`** — simplest, but exits the app on a cold load / deep link (no in-app history to pop).
- **`?from=` entry-point tagging on every link** — deterministic and cold-load-safe, but requires stamping every entry link (~9 for items alone; only 7 exist app-wide) and silently degrades wherever a link forgets the tag.
- **Hybrid (chosen)** — historical for the common case (zero plumbing), logical for the deep-link edge (reuses the `backHref` each screen already declares).
