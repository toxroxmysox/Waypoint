# Visual Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use svw:executing-plans (small plans) or svw:subagent-driven-development (large plans) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For #540, catch layout, structure and timezone regressions in text. Shrink the remaining looks, and keep batch looks out of the main session.

**Architecture:** A new `visual` Playwright project holds ARIA snapshots and geometry checks for five surfaces. It renders at 375px against the preview build, with an isolated PB via `scripts/e2e-isolated.sh`. Pixel-baseline config is ready, but there are zero baselines (#550). Shared geometry helpers live in `tests/e2e/helpers/`. A strict reporter fails any run with an unexplained skip and lists flaky tests. Detroit becomes the default timezone. `verify:visual` defaults to one small shot, and a Read-only `visual-reviewer` subagent handles batch and diff looks.

**Tech Stack:** Playwright (`@playwright/test`, exact-pinned), SvelteKit preview build, PocketBase dev routes (`/api/dev/seed-visual-trip`, `/api/dev/login`), vitest, Node scripts.

**Spec:** `docs/plans/2026-10-21-visual-verification/grill.md`. Read its "Revision" section: this plan implements the trimmed scope.

**Intent sources:** `docs/adr/0003-visual-baselines-macos-local.md`; glossary `CONTEXT.md` (no new terms); `CLAUDE.md` "Visual verification".

**Run:**
- `pnpm test:visual`
- `pnpm test:e2e:clean`
- `pnpm test:unit --run`
- `pnpm verify:visual '/trips/{slug}' --crop 'nav'`

These need `.env.local` with `WAYPOINT_DEV_MODE` and `E2E_TEST_EMAIL`. On the first run, do `pnpm exec playwright install chromium`.

## Global Constraints

- `@playwright/test` is exact-pinned (no `^`). No pixel baselines are committed in this effort (#550). CI never runs the `visual` project (ADR-0003).
- Visual surfaces render at 375px, viewport only.
- The default timezone is `America/Detroit`. For e2e this means both process `TZ` and browser `timezoneId`; unit runs use it too. An explicitly set `TZ` overrides it.
- A skip fails the run unless annotated `allowed-skip` with a description containing an open issue `#N`. Flaky tests are listed in text and never fail the run.
- Only fix an app bug that Detroit or a geometry check exposes if it blocks a task. Otherwise file it, title-prefixed `Detroit TZ:` or `Geometry:`.
- The DayNav pin is proven by temporarily reverting its fix, seeing the pin fail, and restoring. The revert is never committed.
- `test.use({ reducedMotion })` does not type-check on this Playwright version. To change reduced motion, use `browser.newContext({ reducedMotion })` as `sheet-gestures.spec.ts` does.
- Never touch the :8090 dogfood PB. Take ports from `tests/e2e/e2e-env.ts` (`E2E_SLOT`).

## Review Focus

1. Content that depends on "now" (Trip Mode, relative times) makes an ARIA snapshot nondeterministic. Three consecutive `pnpm test:visual` runs must all pass with a clean snapshots tree (Task 4).
2. A helper given a locator whose only matches are in the hidden dual-render copy must throw `no visible match`, not pass vacuously (Task 3).
3. A second worktree on `E2E_SLOT=1` running `pnpm test:visual` must use its own ports and pass (Task 2).
4. If `.env.local` lacks `E2E_TEST_EMAIL`, the env-guard skip fires. That run must fail and print the skip reason (Task 1).
5. A unit test that only passed in UTC must not be "fixed" by loosening its assertion. Either the test's UTC assumption is corrected, or it is pinned to UTC with a filed issue (Task 2).

---

### Task 1: Strict reporter

**Files:**
- Create: `tests/e2e/strict-reporter.ts`
- Create: `tests/strict-reporter/fixture.config.ts`, `tests/strict-reporter/fixtures.spec.ts`, `tests/strict-reporter/run.mjs`
- Modify: `playwright.config.ts` (`reporter: [['list'], ['./tests/e2e/strict-reporter.ts'], ['html', { open: 'never' }]]`)

**Interfaces:**
- Produces: a default-export Playwright `Reporter`.
  - `onTestEnd` collects tests whose `test.outcome()` is `'skipped'` or `'flaky'`.
  - `onEnd` prints `STRICT: N skipped (K allowed), M flaky`, then one line per test: `<file>:<line> <title> — <skip reason | flaky after R retries>`.
  - `onEnd` returns `{ status: 'failed' }` only when a skipped test lacks an `allowed-skip` annotation whose description matches `/#\d+/`.

- [ ] **Step 1: Write the failing harness.**
  - `fixtures.spec.ts` defines four tests:
    - `@skip-bare`: `test.skip(true, 'no reason')`
    - `@skip-allowed`: skip plus annotation `{type:'allowed-skip', description:'#999'}`
    - `@flaky`: fails when `testInfo.retry === 0`, passes otherwise
    - `@pass`
  - `fixture.config.ts` uses `retries: 1`, the strict reporter, and this testDir only.
  - `run.mjs` runs `pnpm exec playwright test --config tests/strict-reporter/fixture.config.ts --grep <tag>` once per tag. It asserts:
    - exit codes: `@skip-bare` → 1, `@skip-allowed` → 0, `@flaky` → 0, `@pass` → 0
    - `@skip-bare` stdout contains `no reason`
    - `@flaky` stdout contains `1 flaky`
  - `run.mjs` exits non-zero on any mismatch.
- [ ] **Step 2:** `node tests/strict-reporter/run.mjs` → FAIL (reporter missing).
- [ ] **Step 3:** Implement the reporter and wire it into `playwright.config.ts`.
- [ ] **Step 4:** `node tests/strict-reporter/run.mjs` → `4/4 ok`, exit 0.
- [ ] **Step 5:** Run `pnpm test:e2e:clean` and record the STRICT block in the commit message.
  - Fix a skipped test only if it is a test bug of the `.count()`-race kind (cerebrum 2026-09-08).
  - Otherwise file an issue and annotate the test.
  - **Must not change:** `retries` values or existing assertions.
  - Done = exit 0.
  - Loop cap: two full runs. After that, stop and report.
- [ ] **Step 6:** Commit.

### Task 2: Detroit default, exact Playwright pin, `visual` project scaffold

**Files:**
- Modify: `playwright.config.ts`, `vite.config.ts` (vitest `test.env`), `package.json`, `scripts/e2e-isolated.sh`
- Create: `scripts/visual-update.sh`
- Create: `tests/visual/visual-fixture.ts`, `tests/visual/smoke.spec.ts`, `src/lib/shell/default-tz.test.ts`

**Interfaces:**
- Produces:
  - **`playwright.config.ts`:**
    - `process.env.TZ ??= 'America/Detroit'` before anything else, and `use.timezoneId: process.env.TZ`.
    - `projects`: `e2e` (testDir `tests/e2e`, current `use`) and `visual` (testDir `tests/visual`, `viewport {width:375, height:812}`).
    - `snapshotPathTemplate: '{testDir}/__snapshots__/{testFilePath}/{arg}{-platform}{ext}'`
    - `expect.toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' }`
  - **`vite.config.ts`:** `test.env.TZ = process.env.TZ ?? 'America/Detroit'`.
  - **`package.json`:**
    - `test:visual` = `bash scripts/e2e-isolated.sh --project=visual`
    - `test:visual:update` = `bash scripts/visual-update.sh`: exits 1 with `snapshot regeneration is Scott-only: run this in your own terminal` unless `[ -t 0 ]`, then prompts `type "update" to regenerate changed snapshots:` and only on exact `update` runs `bash scripts/e2e-isolated.sh --project=visual --update-snapshots=changed`.
    - `playwright.config.ts` also sets `updateSnapshots: 'missing'` so new snapshots are written on first run without any flag.
    - `test:e2e` = `playwright test --project=e2e`
    - `@playwright/test` pinned to the exact version in `pnpm-lock.yaml`.
  - **`scripts/e2e-isolated.sh`:** appends `--project=e2e` when no `--project` argument is passed, so CI behaviour is unchanged.
  - **`tests/visual/visual-fixture.ts`:** exports `test` and `expect`.
    - Worker-scoped fixture `trip: VisualTrip`: it POSTs `${PUBLIC_PB_URL}/api/dev/seed-visual-trip` with body `{"now":"hero"}`. It maps the response to `VisualTrip = { slug: string; tripId: string; phase1: string; day: string[]; item1: string; item2: string }`, reading the same fields `scripts/verify-visual.mjs` reads.
    - An auto page fixture logs in via `/api/dev/login?email=${E2E_TEST_EMAIL}`.

- [ ] **Step 1: Write the failing tests.**
  - `default-tz.test.ts`: `expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/Detroit')`.
  - `smoke.spec.ts`: go to `/trips/${trip.slug}` and expect `page.viewportSize()?.width` to be 375, and the in-page `Intl…timeZone` to be `'America/Detroit'`.
- [ ] **Step 2:** Run `pnpm test:unit --run src/lib/shell/default-tz.test.ts` → FAIL. Run `pnpm test:visual` → FAIL.
- [ ] **Step 3:** Implement. First confirm that `seed-visual-trip` answers on the `test:e2e:clean` PB. If it doesn't, stop and report.
- [ ] **Step 4:** Rerun both → PASS. Also run `E2E_SLOT=1 pnpm test:visual` → PASS (Review Focus 3). Then `pnpm test:visual:update < /dev/null` → exit 1 with the Scott-only message and no snapshot written.
- [ ] **Step 5:** Run `pnpm test:unit --run` and `pnpm test:e2e:clean` under Detroit, and handle every new red:
  - **Test-side UTC assumption:** fix the test's setup or expected value. Never loosen the assertion.
  - **Real app bug:** file `Detroit TZ: …`.
    - Unit test: wrap it so it runs with `process.env.TZ = 'UTC'`, with a comment linking the issue.
    - e2e test: add an `allowed-skip` annotation and skip it.

  Done = both exit 0, and every UTC pin or allowance links a filed issue. Loop cap: two passes over the reds. After that, stop and report.
- [ ] **Step 6:** Commit.

### Task 3: Geometry helpers

**Files:**
- Create: `tests/e2e/helpers/geometry.ts`, `tests/visual/geometry-helpers.spec.ts`

**Interfaces:**
- Produces the following. Every failure throws an `Error` with plain text that names the element as `tag#id.class`, the measured value, and the cause.
  - **`visibleOnly(locator: Locator): Promise<Locator>`**
    - Returns `locator.filter({ visible: true })`.
    - Throws `no visible match for <selector>` if nothing is visible within the expect timeout.
    - Never calls `.count()` without waiting first.
  - **`expectHitTarget(locator: Locator, min = 44): Promise<void>`**
    - Calls `visibleOnly` first.
    - Grows the bounding box symmetrically to at least `min`×`min` (the extended rect).
    - Probes `document.elementFromPoint` at the centre and 1px inside each of the extended rect's four edge midpoints. Every hit must be the target or a descendant of it.
    - The failure message names the failing edge and the element that won, e.g. `top edge resolves to header.sticky; effective height ≈30px`.
  - **`expectNoHorizontalOverflow(page: Page): Promise<void>`**
    - Asserts `scrollingElement.scrollWidth <= clientWidth`.
    - On failure, names up to 3 elements whose right edge exceeds `clientWidth`.
  - **`expectClearOfFixedChrome(locator: Locator): Promise<void>`**
    - Finds visible elements whose computed `position` is `fixed` or `sticky`, excluding the target's own ancestors.
    - Any intersection with the target's box fails, naming the chrome element and the overlap in px.

- [ ] **Step 1: Write the failing tests.** Use `page.setContent` synthetic pages at 375px:
  - **(a)** A sticky 56px header sits directly above a 30px button that uses the `hit-44` `::after` pattern from `src/routes/layout.css`. `expectHitTarget` rejects with `/top edge resolves to header/`.
  - **(b)** The same button sized `min-height:44px;min-width:44px` passes.
  - **(c)** A 500px-wide div makes `expectNoHorizontalOverflow` reject, naming the div. Without the div, it passes.
  - **(d)** A fixed bottom bar over a button makes `expectClearOfFixedChrome` reject. With the button moved clear, it passes.
  - **(e)** A locator that matches only an element inside a `display:none` parent makes `visibleOnly` reject with `no visible match`.
- [ ] **Step 2:** `pnpm test:visual tests/visual/geometry-helpers.spec.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `geometry.ts`.
- [ ] **Step 4:** Same command → 5 passed.
- [ ] **Step 5:** Commit.

### Task 4: DayNav pin and the five-surface ARIA + geometry sweep

**Files:**
- Create: `tests/e2e/helpers/a11y.ts`; add dev dependency `@axe-core/playwright` (exact version)
- Create: `tests/visual/daynav-hit-area.spec.ts`, `tests/visual/surfaces.spec.ts`, `tests/visual/__snapshots__/**/*.aria.yml` (generated)

**Interfaces:**
- Consumes: `test`, `expect`, `trip` from `tests/visual/visual-fixture.ts`; all four helpers from `tests/e2e/helpers/geometry.ts`.
- Produces: `expectNoA11yViolations(page: Page, opts?: { exclude?: Record<string, string> }): Promise<void>` in `tests/e2e/helpers/a11y.ts`. Runs `new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa']).disableRules(Object.keys(exclude))`, fails on violations with impact `serious` or `critical`, and prints one text line per violation: `<rule id> (<impact>) <target selector> — <help>`. `exclude` maps rule id → `#N` of a filed issue; a value without `#\d+` throws.

- [ ] **Step 1: DayNav spec.** Write `daynav prev/next arrows have a ≥44px hit area under the sticky header`.
  - Go to `/trips/${trip.slug}/days/${trip.day[1]}`, which has both arrows.
  - Run `expectHitTarget` on each arrow.
- [ ] **Step 2:** `pnpm test:visual tests/visual/daynav-hit-area.spec.ts` → PASS.
- [ ] **Step 3: Revert check.**
  - In `src/lib/shell/components/DayNav.svelte`, temporarily replace the arrows' direct `min-h-11 min-w-11` sizing with the `hit-44` overlay class.
  - Rerun → FAIL with `resolves to header`.
  - `git checkout -- src/lib/shell/components/DayNav.svelte`, then rerun → PASS.
  - Record the observed failure line in the commit message.
- [ ] **Step 4: Surfaces spec.** One `describe` per surface. Confirm each route in `src/routes`:
  - trip overview `/trips/${slug}`
  - day page `/trips/${slug}/days/${day[0]}`
  - phase detail (phase `phase1`)
  - item page (item `item1`)
  - Trip Mode `/trips/${slug}/now`

  Each `describe` does the following:
  - waits for `networkidle`
  - `expect(await visibleOnly(page.locator('main'))).toMatchAriaSnapshot({ name: '<surface>.aria.yml' })`
  - `expectNoHorizontalOverflow(page)`
  - `expectHitTarget` on each visible `.hit-44` element
  - `expectClearOfFixedChrome` on the surface's first heading and first card link
  - `expectNoA11yViolations(page, { exclude: <per-surface known rules> })`
- [ ] **Step 5:** Run `pnpm test:visual` twice. The first run writes the 5 missing `.aria.yml` files (`updateSnapshots: 'missing'`); never pass `-u`/`--update-snapshots`. Read each one: it must list the surface's real headings and controls, with no timestamps. The second run → PASS. App failures from geometry get filed as `Geometry: …` issues, and that assertion is annotated `allowed-skip` and skipped. Existing serious/critical axe violations get one `A11y: <rule id>` issue per rule and an `exclude` entry with that issue number.
- [ ] **Step 6: Determinism check (Review Focus 1).** Run `pnpm test:visual` three times in a row.
  - Expected: all pass, and `git status --porcelain tests/visual/__snapshots__` stays empty.
  - If not, replace volatile text in the ARIA template with a regex (`- text: /\d+ min/`) rather than dropping nodes.
  - Loop cap: three. After that, stop and report.
- [ ] **Step 7:** Commit.

### Task 5: BottomSheet dismissal: static check and three hosts

**Files:**
- Create: `src/lib/ui/bottom-sheet-hosts.test.ts`, `tests/e2e/sheet-dismissal.spec.ts`

**Interfaces:**
- Consumes: `visibleOnly` (Task 3).

- [ ] **Step 1: Static test.** Write `every BottomSheet host leaves Escape and backdrop to BottomSheet`.
  - Glob `src/**/*.svelte` for files containing `<BottomSheet` (20 today). This excludes BottomSheet's own file.
  - Assert that no host contains an `'Escape'` key check or its own fixed backdrop element (`fixed inset-0`).
  - Exceptions go in an explicit `allow: Record<string, string>` mapping file → reason, and the test also fails on stale allowlist entries.
- [ ] **Step 2:** `pnpm test:unit --run src/lib/ui/bottom-sheet-hosts.test.ts`.
  - Expected: PASS, or failures that get either an allowlist entry with a real reason or a filed issue.
  - **Must not change:** the two patterns being checked.
- [ ] **Step 3: Three-host spec.** Pick three hosts that existing specs already open:
  - the expense sheet (`expense-sheet-stays-closed.spec.ts`)
  - the lists sheet (`checklist-tasks.spec.ts`)
  - one itinerary sheet (e.g. `MoveItemSheet` from an item's actions)

  For each host and each of `x`, `escape` and `back`, write `<host> closes via <path>`:
  1. Record `page.url()`.
  2. Open the sheet and take its visible dialog.
  3. Dismiss it via the path.
  4. Assert the dialog is hidden.
  5. Assert `page.url()` equals the recorded URL.
  6. Assert a control under the former overlay receives a click.
- [ ] **Step 4:** `pnpm test:e2e:clean tests/e2e/sheet-dismissal.spec.ts` → 9 passed.
- [ ] **Step 5:** Commit.

### Task 6: Smaller `verify:visual` and the `visual-reviewer` agent

**Files:**
- Modify: `scripts/verify-visual.mjs` (flags and its header comment)
- Create: `.claude/agents/visual-reviewer.md`

**Interfaces:**
- Produces:
  - **`verify:visual`:**
    - Defaults: `--widths 375`, viewport only.
    - `--full` opts into full-page shots. `--widths a,b` still works.
    - `--crop SELECTOR` saves `locator(sel).filter({visible:true}).first().screenshot()` per route.
    - Each shot prints `shot <path> <w>x<h> <route>`.
  - **The agent:**
    - Frontmatter: `name: visual-reviewer`, `description` (batch or diff review of screenshots; returns text), `model: sonnet`, `tools: Read`.
    - Input: the task intent, plus image paths (shots, or expected/actual/diff sets).
    - Output: only lines of the form `VERDICT <name>: ok|intended|regression|noise`, then `REGION: <where>`, then `REASON: <one sentence>`.
    - Never returns or embeds an image.

- [ ] **Step 1:** `pnpm verify:visual '/trips/{slug}' --crop 'nav'` → FAIL (unknown flag).
- [ ] **Step 2:** Implement.
- [ ] **Step 3: Check.**
  - The rerun prints one `shot` line with w ≤ 375, and `sips -g pixelWidth <path>` agrees.
  - `pnpm verify:visual` prints exactly one shot of 375x812.
  - `pnpm verify:visual --full --widths 375,768` prints two shots, each taller than 812.
- [ ] **Step 4: Agent check.**
  1. Run `pnpm verify:visual '/trips/{slug}/days/{day1}' '/trips/{slug}'`.
  2. Dispatch `visual-reviewer` with both paths and the intent "no change; check for clipped text or overlapping chrome".
  3. Expected: two `VERDICT` lines and no image in the reply.
  4. The main session does not Read either PNG.
- [ ] **Step 5:** Commit.

### Task 7: Docs and the static token estimate

**Files:**
- Create: `scripts/transcript-tokens.mjs`, `docs/plans/2026-10-21-visual-verification/token-estimate.md`
- Modify: `CLAUDE.md` ("Visual verification", "Integrating and shipping"), `.wolf/cerebrum.md` (local, gitignored)

**Interfaces:**
- Produces: `node scripts/transcript-tokens.mjs <dir-or-files…>` prints one JSON line per transcript plus a total line: `{"file":…,"turns":N,"images":N,"imageTurnsHeld":N}`.
  - Only real `type:"image"` content blocks are counted, deduplicated by their `tool_use_id`/message uuid. A raw grep double-counts.
  - `imageTurnsHeld` = the sum, over images, of the assistant turns after the image until the session ends or the next compaction boundary.

- [ ] **Step 1:** Implement the script and run it on `~/.claude/projects/-Users-Scott-Waypoint/`. Sanity check: the total image count is close to the review's 199 images across 35 sessions.
- [ ] **Step 2: Write `token-estimate.md`.**
  - Per-shot tokens ≈ `w×h/750`, after the API downscales to ≤1568px on the long side. Old default: 375 full page + 768 full page, using the median full-page height of the current five surfaces from `pnpm verify:visual --full --widths 375,768`, read from the printed dimensions. New default: 375×812, plus one typical crop.
  - Estimated saved tokens = `imageTurnsHeld × (old − new per-shot tokens)`, totalled and for the top 3 sessions.
  - State the assumptions, including that delegated batches move images out entirely.
- [ ] **Step 3: Rewrite CLAUDE.md "Visual verification".** Cover, in order:
  1. Assert first: geometry helpers and ARIA, via `pnpm test:visual`.
  2. Named conditions: Detroit default, the 375 visual project, and three-host dismissal for sheet changes.
  3. The strict reporter: skips fail unless annotated with an issue, and flakes are listed.
  4. Look small: the new `verify:visual` defaults, `--crop` and `--full`.
  5. A single small crop may be read inline. More than two images, or any diff set, goes to `visual-reviewer`.
  6. Pixel baselines: none yet (#550). The rule for adding one: ≥2 waves without a redesign, one surface per PR, Mac only (ADR-0003).
  7. Snapshot regeneration is Scott-only: agents never pass `-u`/`--update-snapshots`; new snapshots write on first run; an agent whose diff is `intended` asks Scott to run `pnpm test:visual:update` in his terminal, and never hand-edits a committed snapshot to make it pass.
  8. axe: serious/critical violations fail `pnpm test:visual`; exclusions only by rule id with a filed issue.

  Then add the browser-pane rule: use `read_page` / `get_page_text` first, take a screenshot only when appearance is the question, and never trust timing or animation without `document.visibilityState` plus an rAF tick count, or a Playwright rerun.
- [ ] **Step 4: "Integrating and shipping".** Add: a PR that changes `tests/visual/__snapshots__` lists every changed snapshot in its body. A PNG baseline change needs Scott's sweep sign-off before merge.
- [ ] **Step 5: Cerebrum.** Add a dated entry pointing each of the five scars at its guard:
  - hit area → `expectHitTarget`
  - Escape → static host check plus `sheet-gestures`
  - #393 → Detroit default
  - `.count()` skip → strict reporter
  - #379 → the browser-pane rule

  It is local and not committed.
- [ ] **Step 6:** Commit. Post the `token-estimate.md` summary table as a comment on #540.

## Done check (whole branch)

- `node tests/strict-reporter/run.mjs` → `4/4 ok`.
- `pnpm check` → exit 0.
- `pnpm test:unit --run` → exit 0 under Detroit.
- `pnpm test:e2e:clean` → exit 0. The STRICT block shows only issue-linked skip allowances.
- `pnpm test:visual` → exit 0, three times in a row, with a clean `tests/visual/__snapshots__`.
- The DayNav revert check was observed failing; the line is recorded in the commit message.
- `pnpm test:visual:update < /dev/null` → exit 1, Scott-only message.
- `surfaces.spec.ts` runs `expectNoA11yViolations` on all five surfaces; every `exclude` value links a filed issue.
- No pixel baseline PNG is committed (`git ls-files tests/visual | grep -c '\.png$'` → 0).
- `token-estimate.md` exists, and #540 has the comment.
