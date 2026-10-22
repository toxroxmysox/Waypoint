# Visual verification: grill record

Source: https://github.com/toxroxmysox/Waypoint/issues/540 · Date: 2026-10-21

## Problem Statement

Visual checking is expensive and still misses bugs. `pnpm verify:visual` and browser-pane screenshots land in the main session as images (~1–1.5k tokens each) that every later turn re-reads; recent build sessions ran `verify:visual` 10–66 times. Meanwhile a green suite plus screenshots missed: DayNav's ~30px hit area under the sticky header, Escape never closing any BottomSheet, the UTC-only runs hiding #393, `.count()` races turning a failing acceptance spec into a skip that read as a pass, and the hidden-tab browser pane producing the false P1 #379.

## Intent & Success Criteria

A passing visual check costs ~0 image tokens and catches more than a screenshot does. Images reach an agent only when something changed, and only inside a subagent. Scott's visual sweep stays the judge of taste and the approver of baselines.

Success, observable:
- On pass, `pnpm test:visual`, `pnpm test:e2e:clean` and `pnpm verify:visual` print text only; no image is read into the main session.
- On a visual diff, the main session receives a text verdict from the reviewer subagent, never a PNG.
- Each known regression has a spec that fails when its fix is reverted (DayNav hit area, BottomSheet Escape, #393 in a Detroit browser).
- A run with an unexplained skip or a flaky (retried-then-passed) test exits non-zero.
- The e2e and unit suites run under `America/Detroit` by default.
- A measured before/after token comparison on one real UI task is posted on #540 and in the PR.

## User Stories

1. As an agent doing UI work, I want `pnpm test:visual` to report pass/fail per surface in text, so that a pass costs no image tokens.
2. As an agent, I want a failed diff to write expected/actual/diff images to disk and print their paths, so that I can hand them to a reviewer without reading them.
3. As an agent, I want a `visual-reviewer` subagent that reads diff images and returns a text verdict (intended / regression / noise, changed region, reason), so that the main session never holds an image.
4. As an agent, I want a documented update command that regenerates baselines and prints the changed files as text, so that intended changes are cheap to record.
5. As Scott, I want every PR that changes a baseline to list those baselines in its body, so that I approve them in my per-wave sweep via GitHub's image diff.
6. As Scott, I want baseline-changing PRs not to merge without my sweep sign-off, so that taste stays a human call.
7. As an agent, I want diff baselines on trip overview, day page, phase detail, item page and Trip Mode at 375px (viewport, not full page), seeded by `seed-visual-trip` with the `Etc/GMT±N` "now" trick and with dynamic content masked, so that diffs are deterministic.
8. As an agent, I want ARIA snapshots of the same five surfaces, so that structure and order (headings, labels, which controls exist) are checked in text.
9. As an agent, I want a geometry helper asserting a hit target ≥ 44px measured by `elementFromPoint` at the extended edge, so that invisible hit-area failures under sticky chrome are caught.
10. As an agent, I want a geometry helper asserting no horizontal overflow, so that layout breakage at 375px is caught without looking.
11. As an agent, I want a geometry helper asserting no overlap with fixed chrome (BottomNav, FAB, sticky header), so that covered content is caught without looking.
12. As an agent, I want every helper to target only the visible copy under AppShell's dual render, so that assertions never pass against the hidden copy.
13. As an agent, I want each geometry helper to fail with a text message naming the element, the measured value and what covered it, so that failures are diagnosable without a screenshot.
14. As Scott, I want the DayNav arrows pinned by a geometry spec that fails if DayNav's direct sizing fix is reverted to the `::after` overlay, so that the hit-area regression cannot return.
15. As Scott, I want a shared dismissal helper that drives X, Escape, back and swipe (where the sheet supports it) on every BottomSheet host reachable from the seeded trip, so that a single path cannot pass for all of them.
16. As Scott, I want BottomSheet hosts that the dismissal matrix cannot reach listed explicitly, not silently skipped, so that coverage gaps are visible.
17. As Scott, I want an e2e check of the closeout day header in a Detroit browser that fails if #393's fix is reverted, so that the timezone bug is pinned end to end (the unit pin already exists).
18. As Scott, I want the e2e and unit suites to run under `TZ=America/Detroit` (process and browser), so that UTC no longer hides calendar-day bugs.
19. As Scott, I want reds exposed by the Detroit switch filed as issues rather than fixed inside #540 unless they block it, so that scope holds.
20. As Scott, I want a strict reporter that fails the run on any skip or flaky test unless it carries an `allowed-skip` / `allowed-flaky` annotation linking an open issue, so that a skip can never read as a pass.
21. As an agent, I want `verify:visual` to default to one width (375) and viewport-only, with an element-crop mode (`--crop SELECTOR`) and full-page / multi-width opt-in, so that a look, when needed, is as small as possible.
22. As an agent, I want `verify:visual` to print shot paths and dimensions as text and never imply I should read them in the main session, so that looks go through the reviewer subagent.
23. As an agent, I want CLAUDE.md "Visual verification" to describe the new flow (assert first, diff second, look via subagent, sweep approves), so that every session follows it.
24. As an agent, I want CLAUDE.md to say: in the browser pane use `read_page` / `get_page_text` first, screenshot only when appearance is the question, and never trust timing or animation observations there without checking `document.visibilityState` and an rAF tick count or rerunning in Playwright, so that #379-style false findings stop.
25. As an agent, I want `.wolf/cerebrum.md` updated with the new flow, so that the scar tissue points at the fix.
26. As Scott, I want a before/after token comparison on one real UI task, measured from transcripts, so that the savings claim is evidence, not an estimate.

## Decisions

- Baselines are generated and compared on the Mac (darwin), exact-pinned Playwright, bundled Chromium, self-hosted fonts; CI excludes the visual project. See [ADR-0003](../../adr/0003-visual-baselines-macos-local.md). Container baselines filed as a future issue for when CI e2e becomes a gate.
- Baselines are committed. An agent runs the update command only after the reviewer's verdict says "intended change"; the PR body lists every changed baseline; Scott approves in the per-wave sweep; no merge of a baseline change without that sign-off. `verify:visual` is for looking, never for approving.
- First surfaces: trip overview, day page, phase detail, item page, Trip Mode. 375px, viewport only, no desktop shots yet. Masks over avatars and relative times. A sixth surface is added only after something escapes.
- ARIA snapshots cover the same five surfaces.
- The visual + geometry specs are a separate `visual` Playwright project at 375px, run under the `test:e2e:clean` harness against the preview build (production CSS), exposed as `pnpm test:visual` with a sibling update command. The default `test:e2e` run and CI exclude it.
- Geometry checks on the five surfaces cover all controls using the shared hit-target utility plus overflow and fixed-chrome overlap, not only DayNav.
- `America/Detroit` is the default timezone for e2e (process `TZ` and browser `timezoneId`) and unit runs, local and CI. The `Etc/GMT±N` trip-tz trick stays for pinning "now".
- Strict reporter: any skip or flaky test fails the run unless annotated `allowed-skip` / `allowed-flaky` with an open-issue link; a reason string alone is not an explanation. Retries stay so flakes are named. Env-guard skips don't fire under `test:e2e:clean`.
- Every regression pin is proven by reverting its fix and watching the pin fail, then restoring.
- Image review is a project agent `.claude/agents/visual-reviewer.md`: Sonnet, Read-only, input = expected/actual/diff paths + task intent, output = per-diff text verdict. The main session never Reads a PNG.
- `verify:visual` defaults change to `--widths 375 --viewport`; `--full` and `--widths` opt in; `--crop SELECTOR` uses an element screenshot of the first visible match.
- Token comparison: pick one recent UI task whose transcript shows heavy `verify:visual` use; "before" = that transcript; "after" = rerun the same brief on the commit before its fix under the new flow; a script compares image-block count, total input + cache-read tokens, and turns from the two JSONL transcripts.
- No CONTEXT.md terms: these are dev-process terms, not product domain.

## Testing Decisions

- Seam: Playwright against the preview build on the isolated PB, the same seam as the existing e2e suite. Assertions are on rendered behavior (what `elementFromPoint` returns, scroll widths, bounding boxes of visible elements, the ARIA tree, pixels), never CSS source.
- A good pin fails against the reverted fix; that revert check is part of done for each pin.
- Geometry helpers get their own spec on a known-good and a known-bad fixture state, so a helper that always passes is caught.
- The strict reporter is tested by a deliberate skip and a deliberate flake that must exit non-zero, and the same with annotations that must pass.
- Prior art: `sheet-gestures.spec.ts` (Escape + swipe), `format.test.ts` (#393 multi-tz unit pin), the #366 measured-in-situ hit-area harness in the cerebrum, `scripts/verify-visual.mjs` seeding, `tests/e2e/e2e-env.ts` slot ports.

## Out of Scope

- Replacing Scott's visual sweep; taste calls (weight, placement, hierarchy) stay human.
- Making CI e2e a blocking gate, or linux/container baselines (future issue).
- Fixing app bugs the Detroit switch or new geometry checks expose, unless they block #540 (filed as issues).
- Desktop-width baselines.

## Assumptions & Open Questions

- Assumed `seed-visual-trip` can be called against the `test:e2e:clean` PB (same dev routes as `verify:visual`'s PB); the plan verifies this first.
- Assumed enough historic transcripts exist under `~/.claude/projects/` to pick the "before" task; the plan names the task before building.
- The Detroit switch may turn up an unknown number of reds; handled by the filing rule, not a decision left open.
