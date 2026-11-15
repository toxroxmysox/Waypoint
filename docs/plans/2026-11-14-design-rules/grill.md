# Design rules: grill record

Source: https://github.com/toxroxmysox/Waypoint/issues/581 · Date: 2026-11-15

Order in the wave: #585 → #584 → **#581** → #582.

## Problem Statement

The UI has drifted. `src/**/*.svelte` uses 19 distinct arbitrary font sizes (`text-[11px]` ×97, `12px` ×51, `10px` ×27, `9.5px` ×23, `7px` ×5). It has 97 uppercase labels (Fable's count). Of those whose colour is in the same class string, 51 are muted, 17 soft ink, 15 moss, 5 ink and 1 clay. `SectionH` itself is hard-coded moss, so it stays moss in clay Trip Mode. Mono is used for times and dates, not just codes. Italic means two unrelated things (Fraunces "voice" lines and Inter metadata). Emoji stand in for icons. The trip Overview has four filled primary buttons.

## Intent & Success Criteria

Every screen looks like it belongs to the same app, and colour carries meaning: moss = Planning, clay = Trip, and the accent draws your eye somewhere specific. Borders and dividers do the structural work.

- A CI check in the lint job fails on new arbitrary font sizes, arbitrary tracking and hex literals in `.svelte`, and its allowlist is empty when this is done.
- `docs/design-system.md` documents the scale, the label style, the mono rule, the voice rule and the primary-action rule.
- Scott has swept 375, 457 and 669 screenshots of trips list, Overview, Day, Item, Now and Money.

## User Stories

1. As any member, I want text in six consistent sizes with nothing below 11px, so that it's readable on the folded Duo.
2. As any member, I want section labels in one style, coloured by the current mode with a hairline running out to the right, so that each section stands out and the mode is visible.
3. As any member, I want "Parking lot", "Coming up" and similar headers in that same label style.
4. As any member, I want times and dates in the body font with aligned digits, and mono only for confirmation codes and money columns, so that the code is the one thing that looks typed.
5. As any member, I want Fraunces italic only when the app is talking to me (welcome lines, empty-state invitations, closeout, Note Before Bed), so that the voice is recognisable.
6. As any member, I want metadata such as "1h free · 11:30a–12:30p" and "Drag here to unschedule" in plain muted text, not italic.
7. As any member on an empty section, I want a short line in the voice ("Nothing yet. How was today?") instead of grey filler.
8. As any member, I want at most one filled button of the screen's own per screen, so that I know the main action.
9. As any member, I want SVG icons in the TypeGlyph style instead of 👍 👎 📅 💰.
10. As a developer, I want CI to stop new arbitrary values while old ones are migrated surface by surface.

## Decisions

- **Type scale:** six `@theme` tokens: caption 11 · small 13 · body 15 · title-s 17 · title 22 · display 28. Sizes under 11 move to 11. 12 and 12.5 merge into 13. 14.5 merges into 15. The 7px and 8px glyph badges need a layout check, not just a token swap.
- **Section label:** one component (`SectionH`), one tracking value, uppercase, colour = the mode accent (`--color-accent`, moss in Planning, clay in Trip), with a hairline divider running out to the right. The muted, centred "Parking lot" and "Coming up" styles join it.
- **Mono:** confirmation codes and money columns that must align, nothing else. Times (including the Day timeline rail) and dates use Inter with tabular numbers.
- **Voice:** Fraunces italic means the app is talking to you. Inter italic is removed. Empty states get a voice line.
- **Primary action:** the nav + (#584) is chrome and doesn't count. Each screen has at most one filled button of its own, used for the main action of a form or flow. Everything else is outline or ghost. The Overview's "Trip Mode" button goes away with #584. "Weigh in" stays the primary on the welcome card.
- **Icons:** replace the emoji in ScenarioCard and the scenario page with SVGs in the TypeGlyph style. No new icon dependency.
- **CI check: ratchet.** A grep script or eslint rule in the lint job fails on new arbitrary font sizes, arbitrary tracking and hex literals in `.svelte`. A per-file allowlist shrinks as surfaces migrate. Done = the allowlist is empty.
- **Order:** land the tokens and the check first, then migrate surface by surface.

## Testing Decisions

- The CI check is the test for the rules. Its own test is a fixture `.svelte` with a violation that the script must flag.
- No unit tests for styling.
- Each migration commit greps `tests/` for any removed label text or class and fixes the assertions in the same commit.
- `verify:visual` at 375, 457 and 669 for each migrated surface. Scott sweeps.

## Out of Scope

- Dark mode (#583). The tokens should make it easier later, but they don't add it.
- Card and grouped-list structure (#582).
- Nav and title layout (#584).

## Assumptions & Open Questions

- **Assumption:** the exact tracking value and the per-step weights and line heights are Fable's call in the plan, checked at Scott's sweep.
