# #542 — test digest-core.js directly, delete TS copies, seam for runDigest

Refactor. No behaviour change. Source: issue #542 (2026-10-21 architecture review, candidate 02).

## Seam

`runDigest(app, opts, deps)` — new optional third arg, all fields optional:

- `now` — a goja-DateTime-shaped clock (`.string()`, `.time()`); default `new DateTime()`
- `env(key)` — env reader; default `$os.getenv`
- `send(req)` — the `$http.send` request object in, `{ statusCode }` out; default `$http.send`

`app` is already injected (PB reads + `save`). Defaults reference goja globals only
inside `runDigest`, so Vitest never touches `$os`/`$http`/`DateTime`. Hooks keep
calling `core.runDigest($app, {...})` unchanged; `require()` inside the callback stays.

## Tasks

1. `src/lib/digest/load-digest-core.ts` — one CJS-shim loader (moved out of the parity test).
2. `digest-run.test.ts` (TDD, fakes: app, records, clock, send):
   - 8am window: hour 8 trip-local sends; hour 7 → `not_due`; `force` overrides
   - silent baseline: no `digest_state` → state + `last_digest_at` written, no send, any hour
   - state advances only on a 2xx send; non-2xx / throw / missing env → state untouched
   - per-user grouping: one email per user across trips, sections sorted by title;
     opted-out/removed members excluded (filter passed to PB); zero recipients + changes → consumed
   - dry run: no saves, no sends
3. Seam in `digest-core.js` (make 2 green).
4. Repoint `digest-diff.test.ts` + `digest-reminders.test.ts` at the loader; delete
   `digest-diff.ts`, `digest-email.ts`, `digest-reminders.ts`; drop the TS-vs-JS parity
   blocks from `digest-core-parity.test.ts` (keep #339 trip-time parity — `trip-time.ts` is
   production). Pin the email render with the vectors the parity block used (snapshot).
5. Fix stale comments (digest-core.js header, trip-time.ts).
6. Goja smoke harness `backend/test-digest.mjs` (+ `ALL` in `backend-harnesses.sh`): real PB,
   `/api/digest/run` baseline then `dry_run`+`force` → one composed email. Fakes can't catch
   goja-only behaviour; this does. Dry run only — never sends.

## Done

`pnpm check` 0 errors, vitest green, `bash scripts/backend-harnesses.sh digest` green.
