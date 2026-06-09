# HANDOFF — Issue #67: deterministic E2E suite

**Branch:** `claude/relaxed-wozniak-4edf51` · **Status:** fixed + verified, PR open, not merged.

## TL;DR

`pnpm test:e2e` was order/timing-dependent: specs failed in the full suite but
passed in isolation. Three independent defects, all masked for years by running
against a long-lived, data-polluted dev PocketBase. Fixed all three and proved
determinism: **two runs against independently clean PBs → identical 42 passed /
0 failed / 1 skipped.**

## Root causes (found, not guessed)

1. **Auth-bypass create race (the core culprit).**
   `/api/dev/auth-bypass` did find-or-create, but parallel Playwright workers hit
   it for the same email simultaneously, all missed the lookup, all tried to
   insert → PB rejected the losers with `validation_not_unique`. `/api/dev/login`
   surfaced the 400, the page never redirected to `/trips`, and `waitForURL`
   timed out. Every spec's login funnels through here, so *which* spec failed was
   random each run (issue saw m3-money; a clean-DB run saw checklist/closeout/
   documents). Confirmed via `error-context.md`:
   `Bypass failed: {"data":{"email":{"code":"validation_not_unique"...}}}`.

2. **Shared fixture slug across parallel files.**
   `m2-collab` and `m3-money` both seeded `rules-fixture`, which tears its trip
   down by slug (`e2e-rules-test`) and cascade-deletes expenses. Files run in
   parallel workers; m2's `beforeAll` could fire mid-run of m3, wiping
   `E2E Test Dinner` → m3:124 fails. This is the exact failure issue #67 reports.

3. **Ambient-trip dependency on a clean DB.**
   `documents`, `m4`, `m5`, `m6`, `trip-mode-views` log in as the default user and
   "click the first trip," assuming `m1-happy-path` already created one. On a
   clean DB that's a pure ordering race (only surfaced once login #1 was fixed and
   we ran against a genuinely clean PB — the dev PB always had ambient trips).

   Plus a harness defect exposed along the way: PB's hooks **file-watcher** fired
   a delayed macOS FSEvents "changed" event mid-run and auto-restarted the server,
   dropping in-flight connections → intermittent `fetch failed` /
   `ClientResponseError 0`.

## Fixes

| # | File | Change |
|---|------|--------|
| 1 | `backend/pb_hooks/dev-auth.pb.js` | auth-bypass + rules-fixture user creation now catch the unique-collision on save and re-fetch the winner's record → idempotent under concurrency. |
| 2 | `backend/pb_hooks/dev-auth.pb.js` | `rules-fixture` accepts an optional `slug` (defaults to legacy `e2e-rules-test`); `m2`/`m3` pass distinct slugs (`-m2` / `-m3`) so neither file's teardown can touch the other's trip. |
| 3 | `backend/pb_hooks/dev-auth.pb.js` + `tests/e2e/global-setup.ts` + `playwright.config.ts` | new `POST /api/dev/seed-baseline-trip` (idempotent, creates one active trip for `E2E_TEST_EMAIL`); Playwright `globalSetup` calls it once before the suite so "first trip" specs have deterministic state. |
| 4 | `tests/e2e/{m2-collab,m3-money}.spec.ts` | `PB_BASE` reads `process.env.PUBLIC_PB_URL` (defaults to `:8090`) so the suite can target an isolated PB without editing specs. |
| 5 | `scripts/e2e-clean-pb.sh` (new) | stands up a clean, isolated PB for deterministic runs; serves with `--hooksWatch=false` so the server can't restart itself mid-run. |

No tests were deleted, skipped, or weakened. The single skip is the pre-existing
`test.skip` in `m5-closure` (public-archive 404).

## How to reproduce the green result

A long-lived dev PB runs on `:8090`; this harness uses an **isolated** clean PB
on `:8097` so the dev instance is left untouched. In this worktree `.env.local`
already has `PUBLIC_PB_URL=http://127.0.0.1:8097` (gitignored; committed code
defaults to `:8090`).

```bash
# from the worktree root, with .env.local present + pnpm install done
# terminal 1 — clean isolated PB (wipes /tmp/pb67, migrates, superuser, serves)
./scripts/e2e-clean-pb.sh
# terminal 2
pnpm test:e2e            # → 42 passed, 1 skipped, 0 failed
```

Re-run terminal 1 (it resets to a fresh DB each time) then terminal 2 to confirm
the same result twice. Verified twice here: 42/0/1 both runs, PB started exactly
once per run (no restart), zero connection errors.

## Setup gotchas (baked in)

- Fresh worktree: `cp /Users/Scott/Waypoint/.env.local .` + `pnpm install`.
- A custom `--dir` alone makes PB look for hooks/migrations under that dir and
  they silently don't load — always pass explicit `--migrationsDir` and
  `--hooksDir` (the script does).
- `--hooksWatch=false` is mandatory for test PBs (see root cause 3).

## Notes / follow-ups (out of scope, not done)

- The ambient "click the first trip" pattern (5 specs) is inherently fragile; the
  `globalSetup` seed makes it deterministic but a future refactor could have each
  spec own its trip by known slug (like m2/m3 now do).
- This worktree has no `.wolf/` dir, so OpenWolf buglog/cerebrum were not updated.
