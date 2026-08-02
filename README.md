# Waypoint

Collaborative trip planning — build an itinerary with the people you're actually travelling with, settle up afterwards, and keep the trip as a record once it's over.

Personal project. Live at [app.vandenwarsen.com](https://app.vandenwarsen.com), self-hosted.

---

## Stack

| Layer    | Choice                                                        |
| -------- | ------------------------------------------------------------- |
| Frontend | SvelteKit 2 + Svelte 5 (runes), Tailwind v4                    |
| Backend  | PocketBase 0.27.2 — SQLite, collection rules, goja JS hooks    |
| Auth     | Email + 6-digit code. No passwords, no magic links, no OAuth   |
| Tests    | Vitest (logic), Playwright (critical-path E2E), PB harnesses   |
| Hosting  | Docker on a home server, behind a Cloudflare Tunnel            |

Full specification: [`docs/SPEC.md`](docs/SPEC.md). Architecture decisions: [`docs/adr/`](docs/adr/).

---

## Quick start

Prerequisites: Node 22+, pnpm 10, and the PocketBase 0.27.2 binary at `backend/pocketbase` (gitignored — [download it](https://github.com/pocketbase/pocketbase/releases/tag/v0.27.2)).

```bash
pnpm install
cp .env.example .env.local   # then fill in the values below
```

Run the two processes in separate terminals:

```bash
./backend/start.sh
```

```bash
pnpm dev
```

App on `http://localhost:5173`, PocketBase on `http://localhost:8090` (admin UI at `/_/`).

> Always start PocketBase through `./backend/start.sh` — running the `pocketbase` binary directly skips the environment variables the hooks depend on, and dev-mode features (SMTP bypass, disabled rate limits, the `/api/dev/*` fixture routes) silently won't load.

### Environment

`.env.local` is gitignored. The keys that matter:

| Key                                  | Purpose                                              |
| ------------------------------------ | ---------------------------------------------------- |
| `PUBLIC_PB_URL`, `PUBLIC_APP_URL`    | Base URLs                                            |
| `WAYPOINT_DEV_MODE`                  | `true` locally — disables SMTP + rate limits         |
| `E2E_TEST_EMAIL`, `E2E_TEST_EMAILS`  | Whitelist for the `/api/dev/*` fixture routes        |
| `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD`| Superuser, for the maintenance scripts               |
| `RESEND_*` / `SMTP_*`                | Outbound email (unused when dev mode is on)          |
| `GOOGLE_MAPS_API_KEY`                | Places autocomplete + details                        |
| `AERODATABOX_API_KEY`                | Flight lookup                                        |

Both API keys are optional — those routes return 503 without them, and nothing else breaks.

---

## Tests

```bash
pnpm check                  # svelte-check — the real gate
pnpm test:unit --run        # Vitest
pnpm test:e2e:clean         # Playwright against a disposable PB on :8097
bash scripts/backend-harnesses.sh   # every PB harness, each on a fresh PB
```

The PocketBase harnesses (`backend/test-*.mjs`) drive a live server over REST and cover collection rules, membership lifecycle, invites, suggestions, and money. **They are not order-independent** — `test-members` makes the non-member fixture user a real co-traveler, which then legitimately flips a `users` cross-read cell in `test-rules`. `scripts/backend-harnesses.sh` gives each one a freshly-migrated database, which is why it exists.

`pnpm lint` is currently red on main (prettier formatting plus eslint rules that were never scoped to the goja hooks in `backend/pb_hooks/`). CI reports it without blocking.

### Visual verification

No UI or layout change ships without a 375px screenshot:

```bash
pnpm verify:visual                              # trip overview @ 375 + 768
pnpm verify:visual '/trips/{slug}/days/{day1}'  # any route
```

Boots a disposable PB, seeds a populated trip, screenshots into `.visual/`, tears it all down. Never touches the dev database.

---

## Layout

```
src/lib/            domain modules — itinerary, money, collaboration, trip-mode, shell
src/routes/         SvelteKit routes; api/ holds server-side proxies for external APIs
backend/pb_hooks/   PocketBase goja hooks (*.pb.js)
backend/pb_migrations/  schema — append-only, never edited or deleted
backend/test-*.mjs  REST harnesses run against a live PB
scripts/            maintenance + verification tooling
docs/               SPEC, PRDs, ADRs, runbooks
```

### Working on the backend

Two things about PocketBase's goja runtime cause most of the bugs here:

- **Hook callbacks cannot see file-scope helpers.** A top-level `function helper()` called from inside a hook throws a swallowed `ReferenceError`. Inline everything into the callback body, or `require()` a CommonJS module. Module-level `const`/`Map` are equally invisible — use `e.app.store()` for cross-request state.
- **Empty date fields are truthy.** `record.get('someDate')` returns a `DateTime` object even when unset, so `!!record.get('removed_at')` is always true. Use `getString()`.

Migrations are append-only. Collection rules come first; hooks are for logic rules can't express.

---

## Deployment

Runs as a Docker container on a home server, reverse-proxied through a Cloudflare Tunnel, with the PocketBase admin UI reachable only over the tailnet. Redeploy steps are in [`docs/DEPLOY_RUNBOOK.md`](docs/DEPLOY_RUNBOOK.md).

---

## Not in scope

Multi-currency, push notifications, embedded maps, real-time co-editing, native apps, AI-generated itineraries.
