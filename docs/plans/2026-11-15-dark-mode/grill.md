# Dark mode: grill record

Source: https://github.com/toxroxmysox/Waypoint/issues/583 · Date: 2026-11-15

Lands after `2026-11-14-design-rules` (#581: tokens, no hex literals or arbitrary values). Shares Account's new Display section with `2026-11-15-day-weather` (#589, temperature units). Glossary: **Appearance** in `CONTEXT.md`.

## Problem Statement

Waypoint is light-only. Trip Mode is used in hotel rooms at night and dark plane cabins, where a cream screen is glaring. The app has no `dark:` styles. Its colours are already semantic tokens, but a few surfaces bypass them (`bg-white`, `text-white`, black overlays, `rgba(...)`, a hard-coded `theme-color`).

## Intent & Success Criteria

Reading Waypoint in the dark is comfortable, and it still feels like Waypoint (warm and paper-like, not generic). Moss still means Planning and clay still means Trip.

- With the system set to dark (or Appearance = Dark), every screen renders the warm dark palette, with no light-only surface left over.
- Text/background token pairs pass WCAG AA in both schemes. Dividers and card borders are about 1.7:1 or better against their surface, and input/control borders are ≥3:1, in both schemes. All of this is enforced by a test.
- A member can choose System / Light / Dark in Account. System is the default, and the choice shows on first paint with no flash of the other scheme.
- The browser/OS chrome (theme colour, native controls) matches the scheme.
- Scott has swept dark screenshots of trips list, Overview, Day, Item, Now and Money at 375 and 457, plus the light screens affected by the border change.

## User Stories

1. As a traveler in a dark room, I want the app to go dark when my phone is in dark mode, so that it doesn't glare.
2. As a member, I want to set Appearance to System, Light or Dark in Account, so that I can override my phone when I want.
3. As a new member, I want Appearance to default to System, so that it just matches my phone.
4. As a member, I want my Appearance choice to follow me to my other devices, so that I set it once.
5. As a member, I want the chosen scheme on the very first paint, so that the screen never flashes white at night.
6. As a member on the login or join page (not signed in yet), I want it to follow my system setting.
7. As a member in dark, I want warm near-black paper with cream text, so that it still feels like Waypoint.
8. As a member in dark, I want section labels, the active tab, the stage slot, today in the date strip, the Trip Mode hero and links in moss (Planning) or clay (Trip), so that the mode is as visible as in light.
9. As a member in dark, I want the main button of a form or flow filled cream, so that it's clearly the primary action without competing with the accent.
10. As a member in dark, I want cards and sheets to stand off the page with lighter surfaces and clear hairline borders instead of shadows, so that structure stays readable.
11. As a member in either scheme, I want dividers and card borders clearly visible, and input borders strong enough to find, so that the layout is easy to scan.
12. As a member in dark, I want status chips ("To reserve", info, errors) as dark tints with light text, so that they keep their meaning without glowing.
13. As a member, I want memory photos and avatars shown unaltered in dark.
14. As a member, I want native controls (date pickers, selects, scrollbars) and the status bar / browser chrome to match the scheme.
15. As a developer, I want `verify:visual` to capture dark screenshots and a test to fail when a token pair drops below its contrast target, so that dark mode doesn't rot.

## Decisions

- **Mechanism:** a second value set for every `--color-*` token, chosen by an Appearance attribute on `<html>`. When Appearance is System, `prefers-color-scheme` decides. There's no per-component `dark:` pass, and components keep consuming the same tokens.
- **Palette: warm dark.** Paper is a warm near-black (≈#1b1914), cards a step lighter (≈#25221c), sheets and modals a step lighter again. Ink is cream (≈#ece6da), with soft and muted steps below it. The exact values are the plan's call, within the contrast targets.
- **Accents:** moss and clay are retuned lighter for dark (≈#a3bd95 / ≈#e3967a, ≥7:1 on paper). They keep exactly the same placements as in light, and nothing gains accent in dark that doesn't have it in light. The mode wrapper still sets `--color-accent`.
- **Filled primary:** the automatic ink↔paper swap gives cream fill with dark text. The `bg-ink`/`text-paper` call sites are not changed. This follows #581's one-primary rule.
- **Depth:** in dark there are no shadows. Elevation comes from a lighter surface step plus the hairline border. Scrims darken.
- **Borders, both schemes:** two tokens. The line token (dividers, card borders) is about 1.7:1 or better against the surface it sits on. The strong line token (input and control boundaries) is ≥3:1. Light's line token is raised to meet the same target, so the light look changes slightly.
- **Status tints:** gold, sky and error get dark tint backgrounds with light text of the same hue.
- **Media:** photos and avatars are not dimmed or filtered.
- **Appearance setting:** a per-user field with System (default) / Light / Dark, applied server-side on `<html>` so first paint is right. Signed-out pages follow System. Offline snapshots carry the attribute they were rendered with.
- **Account layout:** a new **Display** section holds Appearance (segmented System · Light · Dark) and Temperature (°F · °C, from #589). "Open links in" stays separate.
- **Naming:** the setting is "Appearance", never "mode". Mode means Planning/Trip.
- **Chrome:** `color-scheme` follows the active scheme, `theme-color` is set per scheme (in the meta tag, the manifest and the offline shell), and the bypassing literals (`bg-white`, `text-white`, black overlays, `rgba`) move to tokens.

## Testing Decisions

- **Contrast test (Vitest):** read the token values for both schemes and assert WCAG AA (4.5:1 body, 3:1 large) for every defined text/background pair. Assert ~1.7:1 for line on paper/card and ≥3:1 for the strong line token. That makes the success criterion a test.
- **Unit:** the Appearance resolution (stored value + signed-in or not → the attribute rendered), including the default and signed-out cases.
- **E2E (`pnpm test:e2e:clean`):** set Appearance to Dark in Account, reload, and check `<html>` carries dark. With System and a dark `colorScheme` emulated, check the dark tokens apply. `goto` then `networkidle` before clicks.
- **Visual:** add a `--scheme dark` flag to `pnpm verify:visual` (Playwright `colorScheme`). Sweep at 375 and 457 in dark, plus light at the same sizes for the border change.
- **Grep `tests/`** for any selectors tied to removed literals (`bg-white` and so on).

## Out of Scope

- Dark styling for the email digests.
- A per-device Appearance override.
- Scheduled or sunset-based switching.
- Any change to where accents appear, beyond retuning them.
- New components or layout changes (#581 / #582 / #584 own those).

## Assumptions & Open Questions

- Unverified: whether the iOS standalone status-bar style (`apple-mobile-web-app-status-bar-style`) can follow the scheme. It's one static value, so the plan picks one that works in both schemes. Also unverified: how Android Chrome uses the manifest's `theme_color` versus a `media`-scoped `theme-color` meta. The plan verifies both on the Duo.
- Assumed: #581 has removed the hex literals and arbitrary colour values from `.svelte` before this lands, so the token swap reaches every surface.
