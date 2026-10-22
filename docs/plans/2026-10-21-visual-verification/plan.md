# Visual Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use svw:executing-plans (small plans) or svw:subagent-driven-development (large plans) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make visual checking assert and diff in text, keep images out of the main session, and pin the known regressions, for #540.

**Architecture:** A new `visual` Playwright project (375px, preview build, isolated PB via `scripts/e2e-isolated.sh`) holds `toHaveScreenshot()` baselines, ARIA snapshots and geometry checks for five surfaces. Shared helpers (geometry, dismissal) live in `tests/e2e/helpers/`. A strict reporter fails any run with unexplained skips or flakes; Detroit becomes the default timezone. A Read-only `visual-reviewer` subagent is the only reader of images.

**Tech Stack:** Playwright (`@playwright/test`, exact-pinned), SvelteKit preview build, PocketBase dev routes (`/api/dev/seed-visual-trip`, `/api/dev/login`), vitest, Node scripts.

**Spec:** `docs/plans/2026-10-21-visual-verification/grill.md`

**Intent sources:** `docs/adr/0003-visual-baselines-macos-local.md`; glossary `CONTEXT.md` (no new terms); `CLAUDE.md` "Visual verification".

**Run:** `pnpm test:visual` (visual project), `pnpm test:e2e:clean` (whole e2e under the strict reporter), `pnpm verify:visual '/trips/{slug}' --crop 'nav'`. Needs `.env.local` with `WAYPOINT_DEV_MODE` and `E2E_TEST_EMAIL`; first run `pnpm exec playwright install chromium`.

## Global Constraints

- Baselines are darwin-only, generated on Scott's Mac with Playwright's bundled Chromium; `@playwright/test` exact-pinned (no `^`). CI never runs the `visual` project (ADR-0003).
- Visual surfaces render at 375px, viewport only (not full page).
- Default timezone for e2e (process `TZ` and browser `timezoneId`) and unit runs: `America/Detroit`. Overridable by setting `TZ` explicitly.
- A skip or flaky test fails the run unless annotated `allowed-skip` / `allowed-flaky` with a description containing an open issue `#N`.
- The main session never Reads a PNG; images go to `visual-reviewer`.
- Baselines are updated only after a `visual-reviewer` verdict of `intended`, and only with `--update-snapshots=changed`; the PR body lists every changed baseline; Scott signs off in the sweep before merge.
- App bugs exposed by Detroit or geometry checks are filed as issues, not fixed here, unless they block a task.
- Every regression pin is proven by temporarily reverting its fix, seeing the pin fail, and restoring (no commit of the revert).
- Never touch the :8090 dogfood PB; use `E2E_SLOT` ports from `tests/e2e/e2e-env.ts`.

## Review Focus

1. Dynamic content (relative times, avatars, "now"-dependent copy) makes a baseline nondeterministic: three consecutive `pnpm test:visual` runs must all pass with no diff (Task 6).
2. A helper given a locator whose only matches are the hidden dual-render copy must throw "no visible match", not pass vacuously (Task 3).
3. A second worktree on `E2E_SLOT=1` running `pnpm test:visual` must use its own ports and pass (Task 2).
4. A skip that fires because `.env.local` lacks `E2E_TEST_EMAIL` must fail the run and print the skip reason (Task 1).
5. Updating baselines after one intended change must rewrite only the baselines that differ (`--update-snapshots=changed`), leaving every other PNG byte-identical (Task 6).

---

### Task 0: Token-comparison "before" measurement

**Files:**
- Create: `scripts/transcript-tokens.mjs`
- Create: `docs/plans/2026-10-21-visual-verification/token-comparison.md`

**Interfaces:**
- Produces: `node scripts/transcript-tokens.mjs <file.jsonl>` prints one JSON line `{"turns":N,"imageBlocks":N,"inputTokens":N,"cacheReadTokens":N,"cacheCreationTokens":N,"outputTokens":N}`. `turns` = assistant messages; token fields sum `message.usage.*` across assistant messages; `imageBlocks` counts `type:"image"` blocks anywhere in user/tool_result content.

- [ ] **Step 1:** Implement the script. Check it on one transcript by hand: `imageBlocks` equals `grep -o '"type":"image"' <file> | wc -l`.
- [ ] **Step 2:** Pick the "before" task. Scan `~/.claude/projects/*Waypoint*/*.jsonl` and rank by `imageBlocks`. Choose the highest-ranked transcript that is one UI issue with a merged fix commit. Record the issue number, the transcript path, the fix commit and its parent SHA, the original brief (the first user message), and the script output in `token-comparison.md`.
- [ ] **Step 3:** Commit: `docs(#540): token comparison baseline + transcript-tokens script`.

### Task 1: Strict reporter (skips and flakes fail)

**Files:**
- Create: `tests/e2e/strict-reporter.ts`
- Create: `tests/strict-reporter/fixture.config.ts`, `tests/strict-reporter/fixtures.spec.ts`, `tests/strict-reporter/run.mjs`
- Modify: `playwright.config.ts` (add `reporter: [['list'], ['./tests/e2e/strict-reporter.ts'], ['html', { open: 'never' }]]`)

**Interfaces:**
- Produces: a default-export Playwright `Reporter` class. `onTestEnd` collects tests whose `test.outcome()` is `'skipped'` or `'flaky'`. `onEnd` prints a text block `STRICT: N skipped, M flaky (K allowed)` plus one line per offender (`<file>:<line> <title> — <skip reason | flaky after R retries>`). It returns `{ status: 'failed' }` when any offender lacks an annotation of type `allowed-skip` / `allowed-flaky` whose description matches `/#\d+/`.

- [ ] **Step 1: Write failing harness.** `fixtures.spec.ts` has five tests, selected by `--grep`:
  - `@skip-bare`: `test.skip(true, 'no reason')`
  - `@skip-allowed`: skip with annotation `{type:'allowed-skip', description:'#999'}`
  - `@flaky-bare`: fails when `testInfo.retry === 0`, passes otherwise
  - `@flaky-allowed`: the same, with `allowed-flaky`
  - `@pass`

  `fixture.config.ts` uses `retries: 1`, the strict reporter, and that testDir only. `run.mjs` runs `pnpm exec playwright test --config tests/strict-reporter/fixture.config.ts --grep <tag>` for each tag. It asserts these exit codes: `@skip-bare` → 1, `@flaky-bare` → 1, `@skip-allowed` → 0, `@flaky-allowed` → 0, `@pass` → 0. It also asserts that the `@skip-bare` stdout contains `no reason`. It exits non-zero on any mismatch.
- [ ] **Step 2:** Run `node tests/strict-reporter/run.mjs`. Expected: FAIL (the reporter does not exist yet).
- [ ] **Step 3:** Implement the reporter and wire it into `playwright.config.ts`.
- [ ] **Step 4:** Run `node tests/strict-reporter/run.mjs`. Expected: `5/5 ok`, exit 0.
- [ ] **Step 5:** Run `pnpm test:e2e:clean` and record the STRICT block. Each offender gets either a fix (only if it is a test bug of the `.count()`-race kind; see `.wolf/cerebrum.md` 2026-09-08) or a filed issue plus an annotation. **Must not change:** `retries` values and existing assertions. Done = `pnpm test:e2e:clean` exits 0 with `STRICT: … (all allowed)` or `0 skipped, 0 flaky`. Loop cap: two full-suite runs. Beyond that, stop and report the remaining offenders.
- [ ] **Step 6:** Commit.

### Task 2: Detroit default, exact Playwright pin, `visual` project scaffold

**Files:**
- Modify: `playwright.config.ts`, `vite.config.ts` (vitest `test.env`), `package.json`, `scripts/e2e-isolated.sh`
- Create: `tests/visual/visual-fixture.ts`, `tests/visual/smoke.spec.ts`, `src/lib/shell/default-tz.test.ts`

**Interfaces:**
- Produces:
  - `playwright.config.ts`:
    - sets `process.env.TZ ??= 'America/Detroit'` before anything else, and `use.timezoneId: process.env.TZ`.
    - `projects`: `e2e` (testDir `tests/e2e`, current `use`) and `visual` (testDir `tests/visual`, `viewport {375, 812}`, `reducedMotion: 'reduce'`).
    - `snapshotPathTemplate: '{testDir}/__snapshots__/{testFilePath}/{arg}{-platform}{ext}'`
    - `expect.toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' }`
  - `package.json`:
    - `test:visual` = `bash scripts/e2e-isolated.sh --project=visual`
    - `test:visual:update` = `bash scripts/e2e-isolated.sh --project=visual --update-snapshots=changed`
    - `test:e2e` = `playwright test --project=e2e`
    - `@playwright/test` pinned to the exact version in `pnpm-lock.yaml`
  - `scripts/e2e-isolated.sh` defaults to `--project=e2e` when no `--project` is passed, so CI is unchanged.
  - `tests/visual/visual-fixture.ts` exports `test` (extends Playwright `test`) with:
    - a worker-scoped fixture `trip: VisualTrip`. It POSTs `${PUBLIC_PB_URL}/api/dev/seed-visual-trip` with body `{"now":"hero"}` and maps the response to `VisualTrip = { slug; tripId; phase1; day: string[] /* day1..day6 */; item1; item2 }` using the same fields `scripts/verify-visual.mjs` reads.
    - a page-level login through `/api/dev/login?email=${E2E_TEST_EMAIL}`.
  - It also re-exports `expect`.

- [ ] **Step 1: Write failing tests.**
  - `default-tz.test.ts`: `expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/Detroit')`.
  - `smoke.spec.ts`: using the fixture, go to `/trips/${trip.slug}` and expect the viewport width to be 375. Expect `await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)` to be `'America/Detroit'`.
- [ ] **Step 2:** Run `pnpm test:unit --run src/lib/shell/default-tz.test.ts` → FAIL. Run `pnpm test:visual` → FAIL (no project).
- [ ] **Step 3:** Implement the config, scripts and fixture listed above. Confirm that `/api/dev/seed-visual-trip` answers on the `test:e2e:clean` PB (the grill's assumption). If it doesn't, stop and report.
- [ ] **Step 4:** Run both again → PASS. Also run `E2E_SLOT=1 pnpm test:visual` → PASS on the slot-1 ports (Review Focus 3).
- [ ] **Step 5:** Run `pnpm test:unit --run` and `pnpm test:e2e:clean` under Detroit. File each new red as an issue (title prefix `Detroit TZ:`) and annotate the test `allowed-*` with that issue. Fix inside #540 only if it blocks a later task. **Must not change:** the assertions in the red tests. Done = both commands exit 0 and every new allowance links a filed issue.
- [ ] **Step 6:** Commit.

### Task 3: Geometry helpers

**Files:**
- Create: `tests/e2e/helpers/geometry.ts`, `tests/visual/geometry-helpers.spec.ts`

**Interfaces:**
- Produces (all throw an `Error` whose message is plain text naming the element as `tag#id.class`, the measured value and the cause):
  - `visibleOnly(locator: Locator): Promise<Locator>` returns `locator.filter({ visible: true })`. Throws `no visible match for <selector>` when the count is 0 after auto-waiting with `expect(...).toHaveCount(>0)` semantics. Never uses `.count()` without waiting first.
  - `expectHitTarget(locator: Locator, min = 44): Promise<void>` runs `visibleOnly` first. The extended rect is the bounding box grown symmetrically to at least `min`×`min`. It probes `document.elementFromPoint` 1px inside each of the four edge midpoints and the centre. Each hit must be the target or a descendant. The message names the failing edge and the element that won, e.g. `top edge resolves to header.sticky; effective height ≈30px`.
  - `expectNoHorizontalOverflow(page: Page): Promise<void>` asserts `scrollingElement.scrollWidth <= clientWidth`. On failure it names up to 3 elements whose right edge exceeds `clientWidth`.
  - `expectClearOfFixedChrome(locator: Locator): Promise<void>` collects visible elements with computed `position` `fixed` or `sticky`, excluding the target and its ancestors. Any intersection with the target's box fails, naming the chrome element and the overlap in px.

- [ ] **Step 1: Write failing tests.** Use `page.setContent` with synthetic HTML at 375px.
  - **(a) Hit target, bad:** a sticky 56px header directly above a 30px button using the `hit-44` `::after` overlay pattern copied from `src/routes/layout.css`. `expectHitTarget` rejects with a message matching `/top edge resolves to header/`.
  - **(b) Hit target, good:** the same button sized `min-height:44px` passes.
  - **(c) Overflow:** a 500px-wide div rejects, naming the div. Without it, passes.
  - **(d) Chrome overlap:** a fixed bottom bar over a button rejects. With the button moved clear, passes.
  - **(e) Hidden copy:** a locator matching only an element inside a `display:none` parent makes `visibleOnly` reject with `no visible match` (Review Focus 2).
- [ ] **Step 2:** Run `pnpm test:visual tests/visual/geometry-helpers.spec.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `geometry.ts`.
- [ ] **Step 4:** Run the same command → PASS, all five.
- [ ] **Step 5:** Commit.

### Task 4: Regression pins: DayNav hit area and #393 in a Detroit browser

**Files:**
- Create: `tests/visual/daynav-hit-area.spec.ts`, `tests/e2e/closeout-day-tz.spec.ts`

**Interfaces:**
- Consumes: `test`, `trip` from `tests/visual/visual-fixture.ts`; `expectHitTarget` from `tests/e2e/helpers/geometry.ts`.

- [ ] **Step 1: DayNav spec.** `daynav prev/next arrows have a ≥44px hit area under the sticky header`: go to `/trips/${trip.slug}/days/${trip.day[1]}` (it has both arrows) and run `expectHitTarget` on each arrow link.
- [ ] **Step 2:** Run `pnpm test:visual tests/visual/daynav-hit-area.spec.ts` → PASS.
- [ ] **Step 3: Revert check.** In `src/routes/(app)/trips/[slug]/days/[dayId]/+page.svelte`, temporarily swap DayNav's direct `min-h-11 min-w-11` sizing back to the `hit-44` overlay. Rerun → FAIL with `resolves to header`. Restore with `git checkout -- <file>`, then rerun → PASS.
- [ ] **Step 4: #393 spec.** `closeout day header shows the stored calendar date west of UTC`:
  - Seed a past trip through the PB API, following `closeout-checklist.spec.ts`. Use `start_date` `2026-03-10`, which is a Tuesday.
  - Open its closeout page in the default (Detroit) browser.
  - Assert the first day header contains the 10 March rendering in CloseoutDayCard's format and does not contain 9 March. Read the format from the component.
- [ ] **Step 5:** Run `pnpm test:e2e:clean tests/e2e/closeout-day-tz.spec.ts` → PASS.
- [ ] **Step 6: Revert check.** Temporarily remove `timeZone: 'UTC'` from CloseoutDayCard's date formatter. Rerun → FAIL. Restore, then rerun → PASS.
- [ ] **Step 7:** Commit.

### Task 5: BottomSheet dismissal matrix

**Files:**
- Create: `tests/e2e/helpers/dismiss.ts`, `tests/e2e/sheet-dismissal.spec.ts`
- Modify: `tests/e2e/sheet-gestures.spec.ts` (import the swipe gesture from the helper instead of its local copy; assertions unchanged)

**Interfaces:**
- Produces:
  - `type DismissPath = 'x' | 'escape' | 'back' | 'swipe'`
  - `expectDismissal(page: Page, open: () => Promise<Locator>, path: DismissPath): Promise<void>`:
    - record `page.url()`
    - call `open()` to get the sheet's dialog locator, scoped with `visibleOnly`
    - dismiss via `path`
    - assert the dialog is hidden, `page.url()` equals the recorded URL, and the page is not tap-dead: a known control under the former overlay receives a click.
  - `swipeDown(page: Page, sheet: Locator): Promise<void>`, extracted from `sheet-gestures.spec.ts`.

- [ ] **Step 1: Write the host table.** In `sheet-dismissal.spec.ts`, one entry per `<BottomSheet` host file in `src` (20 today), each with `file`, `route`, `open`, `paths` (swipe only where the sheet supports it), or `unreachable: '<why>'`.

  It generates one test per reachable host × path, named `<host> closes via <path>`. It runs with `test.use({ reducedMotion: 'no-preference' })` so it covers the #379 teardown class.

  Add `table covers every BottomSheet host`, which:
  - scans `src` for `<BottomSheet` and expects the set of `file`s in the table to equal that set
  - prints the unreachable hosts and their reasons as text with `console.log`, never `test.skip`.
- [ ] **Step 2:** Run `pnpm test:e2e:clean tests/e2e/sheet-dismissal.spec.ts`. Fix only test-side problems until green. App failures get filed as issues and annotated `allowed-*`. **Must not change:** the helper's three post-dismiss assertions. Loop cap: three runs.
- [ ] **Step 3: Revert check.** Temporarily rebind BottomSheet's Escape handler from `<svelte:window>` to the overlay div. Rerun → every `closes via escape` test FAILS. Restore, then rerun → PASS.
- [ ] **Step 4:** Run `pnpm test:e2e:clean tests/e2e/sheet-gestures.spec.ts` → PASS, unchanged.
- [ ] **Step 5:** Commit.

### Task 6: Baselines, ARIA snapshots and geometry sweeps on five surfaces

**Files:**
- Create: `tests/visual/surfaces.spec.ts`, `tests/visual/__snapshots__/**` (generated)

**Interfaces:**
- Consumes: the fixture (Task 2) and the helpers (Task 3).

- [ ] **Step 1: Write the spec.** One `describe` per surface:
  - trip overview `/trips/${slug}`
  - day page `/trips/${slug}/days/${day[0]}`
  - phase detail `/trips/${slug}/phases/${phase1}` (confirm the route)
  - item page `/trips/${slug}/items/${item1}` (confirm the route)
  - Trip Mode `/trips/${slug}/now`

  Each one:
  - waits for `networkidle`
  - runs `expect(page).toHaveScreenshot('<surface>.png', { mask: [<avatar and relative-time locators>] })`; list the mask selectors in a header comment
  - runs `expect(page.locator('main').filter({visible:true})).toMatchAriaSnapshot({ name: '<surface>.aria.yml' })`
  - runs `expectNoHorizontalOverflow`
  - runs `expectHitTarget` on every visible `.hit-44`
  - runs `expectClearOfFixedChrome` on the surface's primary heading and first card.
- [ ] **Step 2:** Run `pnpm test:visual tests/visual/surfaces.spec.ts` → FAIL (missing baselines).
- [ ] **Step 3:** Run `pnpm test:visual:update`. It writes 5 PNGs and 5 `.aria.yml` files. Dispatch `visual-reviewer` only if Task 7 has already landed. Otherwise leave the PNGs for Scott's sweep and don't Read them.
- [ ] **Step 4: Determinism check (Review Focus 1).** Run `pnpm test:visual` three times in a row. Expected: all pass, and `git status tests/visual/__snapshots__` is clean. If not, widen masks (never thresholds), with a loop cap of three. Then stop and report.
- [ ] **Step 5: Scoped-update check (Review Focus 5).**
  1. Temporarily change one heading's text on the day page.
  2. Run `pnpm test:visual:update`, then `git status --porcelain tests/visual/__snapshots__`. Expected: only the day-page PNG and its ARIA file are modified.
  3. Restore the heading and run `git checkout tests/visual/__snapshots__`.
- [ ] **Step 6:** Commit, with the baseline list in the message.

### Task 7: `visual-reviewer` agent and the smaller `verify:visual`

**Files:**
- Create: `.claude/agents/visual-reviewer.md`
- Modify: `scripts/verify-visual.mjs`

**Interfaces:**
- Produces:
  - **The agent.** Frontmatter `name: visual-reviewer`, `model: sonnet`, `tools: Read`. Input: the task intent plus image paths (expected/actual/diff, or plain shots). Output is only lines of the form
    `VERDICT <surface>: intended|regression|noise` / `REGION: <where>` / `REASON: <one sentence>`
    plus, for plain shots, `ISSUES: none|<list>`. It never returns an image.
  - **`verify:visual`.**
    - Defaults: `--widths 375` and viewport-only.
    - New flags: `--full` (full page) and `--crop SELECTOR`, a `locator(sel).filter({visible:true}).first().screenshot()` per route.
    - Each shot prints `shot <path> <w>x<h> <route>`.
    - The run ends with `Images not read. Review via the visual-reviewer agent.`
    - `--widths` keeps working for opt-in multi-width.

- [ ] **Step 1:** Run `pnpm verify:visual '/trips/{slug}' --crop 'nav'`. Expected: FAIL (unknown flag).
- [ ] **Step 2:** Implement the flags and defaults. Update the script's header comment.
- [ ] **Step 3: Check.**
  - Rerun → `shot .visual/… <w>x<h>` with w ≤ 375, and `sips -g pixelWidth` on the file agrees.
  - Run `pnpm verify:visual` with no args → exactly one shot, 375 wide, height 812.
  - Run `--full --widths 375,768` → two full-page shots.
- [ ] **Step 4: Agent check.**
  1. Temporarily change the day-page heading colour and run `pnpm test:visual tests/visual/surfaces.spec.ts`. It FAILs and prints the diff paths.
  2. Dispatch `visual-reviewer` with those paths and the intent "no visual change intended". Expected: one `VERDICT day: regression` line naming the heading.
  3. Restore the colour.
  The main session Reads no PNG during this check.
- [ ] **Step 5:** Commit.

### Task 8: Docs, sweep rule and the "after" token measurement

**Files:**
- Modify: `CLAUDE.md` ("Visual verification", "Integrating and shipping"), `.wolf/cerebrum.md` (local, gitignored), `docs/plans/2026-10-21-visual-verification/token-comparison.md`

- [ ] **Step 1: Rewrite CLAUDE.md "Visual verification"** in this order:
  1. Assert first: geometry helpers and ARIA.
  2. Diff second: `pnpm test:visual`, plus the update command, and when the update is allowed.
  3. Look last, via `visual-reviewer`. The main session never Reads PNGs.
  4. The new `verify:visual` defaults and flags.
  5. Named conditions: Detroit default, the 375 visual project, and the dismissal matrix for sheet changes.
  6. The strict reporter and the annotation rule.

  Also add the browser-pane rule: `read_page` / `get_page_text` first; screenshot only when appearance is the question; never trust timing or animation without `document.visibilityState` and an rAF tick count, or a Playwright rerun.
- [ ] **Step 2: "Integrating and shipping".** Add the rule: a PR changing `tests/visual/__snapshots__` lists each changed baseline in its body and doesn't merge without Scott's sweep sign-off. Baselines are regenerated only on the Mac (ADR-0003).
- [ ] **Step 3: Cerebrum.** Add a dated entry pointing the five scars at their new guards. Keep it local; it isn't committed.
- [ ] **Step 4: "After" measurement.**
  1. Create a throwaway worktree at the Task 0 parent SHA.
  2. Run `git checkout <this branch> -- playwright.config.ts package.json pnpm-lock.yaml scripts/ tests/ .claude/agents/ CLAUDE.md vite.config.ts`.
  3. Run `pnpm install`, then `pnpm test:visual:update` to baseline the old UI, and commit locally.
  4. Run the Task 0 brief there in a fresh non-interactive session: `claude -p "<brief>" --model sonnet`.
  5. Run `transcript-tokens.mjs` on its transcript.
  6. Record both JSON lines, the deltas, and whether the after-run's result passed `pnpm test:visual` and `pnpm test:e2e:clean` in `token-comparison.md`.
  7. Delete the worktree.
- [ ] **Step 5:** Commit. Post the comparison table as a comment on #540.

## Done check (whole branch)

- `node tests/strict-reporter/run.mjs` → `5/5 ok`.
- `pnpm test:unit --run` → exit 0 under Detroit.
- `pnpm test:e2e:clean` → exit 0, and the STRICT block shows only issue-linked allowances.
- `pnpm test:visual` → exit 0, three times in a row, with a clean snapshots tree.
- The revert checks in Tasks 4 and 5 were each observed failing. The executor records them in the PR body.
- No PNG was Read in the main session. This is the reviewer's check against the transcript.
- `token-comparison.md` has before/after numbers, and #540 has the comment.
