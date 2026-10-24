# Visual verification: grill record

Source: https://github.com/toxroxmysox/Waypoint/issues/540 · Date: 2026-10-21 · Revised 2026-10-21 after a fresh-eyes review (see "Revision" at the end)

## Problem Statement

Visual checking is expensive and still misses bugs. `pnpm verify:visual` and browser-pane screenshots land in the main session as images that every later turn re-reads. By default `verify:visual` takes full-page shots at 375 and 768, and the 768 shot alone costs about 1.2k tokens. Measured across Waypoint transcripts: 199 images in 35 sessions, with the worst sessions holding 54, 33 and 22. Images are about 4–6% of cache-read tokens even in those, so the token problem is real but small. The stronger problem is coverage. A green suite plus screenshots missed all of these:

- DayNav's ~30px hit area under the sticky header
- Escape never closing any BottomSheet
- the off-by-one calendar-day bug (#393), hidden because every run used UTC
- `.count()` races turning a failing acceptance spec into a skip that read as a pass
- the false P1 #379, produced by the browser pane running as a hidden tab

## Intent & Success Criteria

Catch more than a screenshot does, in text. Make the looks that remain small. Keep images out of the main session when there is more than a single small crop to look at. Scott's visual sweep stays the judge of taste.

Success, observable:

- `pnpm test:visual` and `pnpm test:e2e:clean` report pass/fail in text; a pass produces no image for the agent.
- `pnpm verify:visual` defaults to a single 375px viewport shot (~400 tokens instead of ~1.2k+ per width) and can crop to one element.
- The DayNav hit area has a spec that fails when its fix is reverted.
- Every BottomSheet host is statically checked to dismiss through BottomSheet's own close path. Three representative hosts are driven through X, Escape and back.
- A run with a skipped test exits non-zero. Flaky tests are named in text.
- The e2e and unit suites run under `America/Detroit` by default.
- A static before/after token estimate, built from real transcripts, is posted on #540.

## User Stories

1. As an agent doing UI work, I want `pnpm test:visual` to report pass/fail per surface in text, so that a pass costs no image tokens.
2. As an agent, I want ARIA snapshots of trip overview, day page, phase detail, item page and Trip Mode at 375px, seeded by `seed-visual-trip` with the "now" seed. That way structure and order (headings, labels, which controls exist) are checked in text.
3. As an agent, I want a geometry helper asserting a hit target ≥ 44px measured by `elementFromPoint` at the extended edge, so that invisible hit-area failures under sticky chrome are caught.
4. As an agent, I want a geometry helper asserting no horizontal overflow, so that layout breakage at 375px is caught without looking.
5. As an agent, I want a geometry helper asserting no overlap with fixed chrome (BottomNav, FAB, sticky header), so that covered content is caught without looking.
6. As an agent, I want every helper to target only the visible copy under AppShell's dual render, so that assertions never pass against the hidden copy.
7. As an agent, I want each geometry helper to fail with a text message naming the element, the measured value and what covered it, so that failures are diagnosable without a screenshot.
8. As an agent, I want the five surfaces swept with those geometry helpers, so that layout regressions on the main screens are caught in text.
9. As Scott, I want the DayNav arrows pinned by a geometry spec. It must fail if DayNav's direct sizing fix is reverted to the `::after` overlay, so that the hit-area regression cannot return.
10. As Scott, I want a static check that no BottomSheet host handles Escape or its own backdrop outside BottomSheet, so that one shared dismissal path covers every sheet.
11. As Scott, I want three representative BottomSheet hosts driven through X, Escape and back, so that the shared path is proven end to end beyond the existing single-sheet spec.
12. As Scott, I want the e2e and unit suites to run under `TZ=America/Detroit` (process and browser), so that UTC no longer hides calendar-day bugs.
13. As Scott, I want Detroit reds that are test-side assumptions fixed, and real app bugs filed as issues, so that scope holds and CI's unit gate stays green honestly.
14. As Scott, I want a strict reporter that fails the run on any skip unless the skip carries an `allowed-skip` annotation linking an open issue, so that a skip can never read as a pass.
15. As an agent, I want the strict reporter to list flaky (retried-then-passed) tests in text without failing the run, so that flakes are visible without random reds from known multi-context races.
16. As an agent, I want the `toHaveScreenshot()` config in place with zero baselines and a documented rule for adding one, so that the first stable surface can be baselined cheaply later.
17. As an agent, I want `verify:visual` to default to one width (375) and viewport-only, with an element-crop mode (`--crop SELECTOR`) and full-page / multi-width opt-in, so that a look, when needed, is as small as possible.
18. As an agent, I want `verify:visual` to print shot paths and dimensions as text, so that I choose deliberately whether to read a shot or delegate it.
19. As an agent, I want a `visual-reviewer` subagent that reads several images (or a diff set) and returns a text verdict, so that batch looks never land in the main session.
20. As an agent, I want CLAUDE.md "Visual verification" to describe the flow, so that every session follows it. The order is: assert first; look small; one small crop inline is fine; more than two images or any diff set goes to `visual-reviewer`; the sweep judges taste.
21. As an agent, I want CLAUDE.md to state the browser-pane rule, so that #379-style false findings stop. The rule: use `read_page` / `get_page_text` first, take a screenshot only when appearance is the question, and never trust timing or animation observations from the pane without checking `document.visibilityState` and an rAF tick count or rerunning in Playwright.
22. As an agent, I want `.wolf/cerebrum.md` updated with the new flow, so that the scar tissue points at the fix.
23. As Scott, I want a static token estimate from real transcripts (historic image count × tokens per shot at old vs new defaults), so that the savings claim is grounded without paying for a full rerun.
24. As Scott, I want only me to regenerate pixel baselines, via `pnpm test:visual:update` run from my own terminal, so that an agent can never "fix" a failing image diff by re-approving whatever it now shows.
25. As an agent, I want to update ARIA snapshots myself via `pnpm test:aria:update` when my task intentionally changes a surface's structure, so that Scott has no manual step; the text diff in the PR, the final reviewer's intent check and Scott's sweep are the protection.
26. As an agent, I want new snapshots written on first run without any update flag, so that adding a check never needs the guarded command.
27. As Scott, I want axe-core accessibility checks on the five surfaces, failing on serious and critical violations with text output, so that accessibility regressions are caught alongside layout and structure.

## Decisions

- **Pixel baselines are deferred.** The config and update command land, with zero baselines. A surface gets a baseline only after it has gone at least two waves without a redesign, and baselines are added one surface at a time, each in its own PR. Why: 128 `.svelte` commits in 30 days means constant churn and constant approvals, and a failed diff produces three images, about what the look it replaces costs. Follow-up: #550.
- When baselines land, they are generated on the Mac. See [ADR-0003](../../adr/0003-visual-baselines-macos-local.md); container baselines are in #547. Approval flow: an agent may propose an update after a `visual-reviewer` verdict of `intended`, but only Scott regenerates; changed baselines are listed in the PR body and need his sweep sign-off before merge.
- **ARIA snapshots and geometry sweeps** cover trip overview, day page, phase detail, item page and Trip Mode at 375px. These are text and cheap to review.
- The visual, ARIA and geometry specs are a separate `visual` Playwright project at 375px. It runs under the `test:e2e:clean` harness against the preview build and is exposed as `pnpm test:visual`. The default `test:e2e` run and CI exclude it.
- `@playwright/test` is exact-pinned.
- **Detroit default:** `America/Detroit` for e2e (process `TZ` and browser `timezoneId`) and unit runs, locally and in CI. Detroit reds that come from test-side UTC assumptions get fixed. Real app bugs get filed. For a unit test hitting a filed app bug, the test is pinned to UTC with a comment linking the issue; vitest has no allowance annotation, and the unit run is CI's only hard gate.
- **Strict reporter:** skips fail the run unless annotated `allowed-skip` with an open issue `#N`. A reason string alone is not an explanation. Flaky tests are reported in text and do not fail the run (the retries exist for known multi-context races).
- **Regression pins:** DayNav gets a geometry spec, proven by reverting the fix in `DayNav.svelte`. #393 needs no new spec: `formatCalendarDate` is already unit-pinned in three zones, and the Detroit default covers the class. Escape is already pinned in `sheet-gestures.spec.ts`, and teardown in `sheet-teardown.spec.ts`.
- **Dismissal:** a static test that every `<BottomSheet` host leaves Escape and backdrop handling to BottomSheet, with an explicit allowlist that gives a reason for each exception. Three representative hosts already opened by existing specs are driven through X, Escape and back, under the default reduced motion. Swipe and no-reduced-motion teardown are already covered.
- **`verify:visual` defaults** change to `--widths 375` and viewport-only. `--full` and `--widths` opt in. `--crop SELECTOR` takes an element screenshot of the first visible match. Output lists each shot's path and size.
- **Image review:** `visual-reviewer` is a project agent (Sonnet, Read-only) that returns a text verdict per image or diff set. It is used when there are more than two images or any diff set. A single small crop may be read inline, because a subagent spawn costs ~15–25k tokens.
- **Token comparison:** a static estimate. Take historic image counts per session, apply tokens per shot at the old defaults (full-page 375 + 768) and the new ones (375 viewport or crop), and add the turns each image stayed in context. No live rerun.
- **Pixel regeneration is Scott-only; ARIA regeneration is agent-allowed and reviewed.** Agents never run Playwright with `--update-snapshots` / `-u` directly (the svw plugin hook blocks it). Pixel: `pnpm test:visual:update` refuses unless stdin is a TTY and Scott types `update`; agent Bash has no TTY, and an env flag would not stop an agent. Image diffs can't be reviewed as text, so this is where the guard matters; no pixel baselines exist until #550, so it costs Scott nothing today. ARIA: `pnpm test:aria:update` regenerates only `@aria`-tagged tests and fails (restoring the files) if any `.png` changed. ARIA files are text, so every change is a readable PR diff; the PR body lists each changed snapshot, the final Opus review treats any ARIA change the task's intent doesn't call for as blocking, and Scott sees them in his sweep. New snapshots of either kind are written on first run (`updateSnapshots: 'missing'`). Deleting or hand-editing a committed snapshot is a change like any other: listed in the PR, and for a PNG it needs Scott's sign-off. Why the split: Scott chose no manual step on ARIA changes (2026-10-21) while keeping the guard where a diff can't be read.
- **axe-core** (`@axe-core/playwright`) runs on the same five surfaces, tags `wcag2a`, `wcag2aa`, failing on `serious` and `critical` impact. Existing violations are filed as `A11y: …` issues and excluded by rule id with the issue number, so the check is green and every exclusion is visible.
- **Stryker mutation testing is #551, not #540:** it tests unit-test strength on pure-logic modules, a different concern from visual verification, and it would roughly double this effort.
- No CONTEXT.md terms; these are dev-process terms, not product domain.

## Testing Decisions

- Seam: Playwright against the preview build on the isolated PB, the same seam as the existing e2e suite. Assertions are on rendered behavior: what `elementFromPoint` returns, scroll widths, bounding boxes of visible elements, the ARIA tree. Never CSS source.
- A good pin fails against the reverted fix; that revert check is part of done for the DayNav pin.
- Geometry helpers get their own spec on known-good and known-bad synthetic pages, so a helper that always passes is caught.
- The strict reporter is tested on a fixture suite: a bare skip must exit non-zero; an annotated skip and a flaky test must exit 0, and the flaky test must be named in the output.
- Prior art:
  - `sheet-gestures.spec.ts` (Escape, swipe, `newContext` for reduced motion)
  - `sheet-teardown.spec.ts`
  - `format.test.ts` (the #393 multi-timezone unit pin)
  - the #366 measured-in-situ hit-area harness in the cerebrum
  - the seeding in `scripts/verify-visual.mjs`
  - the slot ports in `tests/e2e/e2e-env.ts`

## Out of Scope

- Replacing Scott's visual sweep; taste calls (weight, placement, hierarchy) stay human.
- Pixel baselines on any surface (deferred, #550). Linux/container baselines (#547).
- Making CI e2e a blocking gate.
- Failing the run on flaky tests.
- A dismissal matrix over all 20 BottomSheet hosts.
- An e2e pin for #393.
- A live before/after rerun for the token comparison.
- Fixing app bugs exposed by Detroit or the geometry checks, unless they block #540 (filed as issues).
- Desktop-width checks.
- Stryker mutation testing (#551).
- axe violations at `moderate`/`minor` impact.

## Assumptions & Open Questions

- Assumed `seed-visual-trip` answers on the `test:e2e:clean` PB. The route lives in `backend/pb_hooks/dev-auth.pb.js`, the same hooks that PB serves. The plan verifies this first.
- #540's "Done when" lists diff baselines on key surfaces and a measured before/after comparison. This revision replaces them with the baseline-ready config plus #550, and with a static estimate. Scott approved this on 2026-10-21.

## Revision (2026-10-21)

A fresh-eyes Opus review measured the token problem from transcripts, at ~4–6% of cache-read tokens even in the worst sessions. It found three errors in the first plan:

- DayNav lives in `src/lib/shell/components/DayNav.svelte`.
- `CloseoutDayCard` already uses the unit-pinned `formatCalendarDate`.
- `test.use({ reducedMotion })` doesn't type-check on this Playwright version.

Scott approved these cuts:

- the live token rerun becomes a static estimate
- pixel baselines are deferred
- flaky tests are reported, not failed
- the 20-host dismissal matrix becomes a static check plus three hosts
- the #393 e2e pin is dropped
- `visual-reviewer` is used only for batches and diffs

### Addendum (2026-10-21, later)

Scott approved three more items via a sibling session: a guard on snapshot regeneration (later narrowed to pixel baselines, so ARIA updates need no manual step), axe-core checks on the key surfaces, and Stryker mutation testing. The first two are folded into this scope. Stryker went to its own issue.
