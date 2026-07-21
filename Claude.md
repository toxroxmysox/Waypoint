# OpenWolf

@.wolf/OPENWOLF.md

This project uses OpenWolf for context management. Read and follow .wolf/OPENWOLF.md every session. Check .wolf/cerebrum.md before generating code. Check .wolf/anatomy.md before reading files.

# Waypoint — Project Instructions

Be as concise as possible. Sacrifice grammar for concision.

---

## Scope discipline

Work that spans sessions or needs a plan should trace to a GitHub Issue.
Small, self-contained fixes (single-session, no plan needed) — just do them.

"Let's just..." on anything non-trivial is a scope-creep trigger. Interrogate:
- Is this a quick fix or a rabbit hole?
- If it needs a plan, create an issue first.

---

## Workflow

Issue-driven development. Label reference: `docs/agents/triage-labels.md`

Ceremony by type:
- **bug**: fix → PR → review
- **enhancement**: plan optional → PR → review
- **feature**: grill → plan → subagent execution → PR → review
- **research**: output = decision or ADR, no PR expected
- **refactor**: plan → PR → review

Issues labeled `afk` can run unsupervised. `hitl` needs human checkpoints.

Session scope: one issue or one PR. If a task needs both planning and execution, split into separate sessions.

---

## Tech stack

Defined in `docs/SPEC.md` §2. Alternatives require clear rationale — don't suggest them casually, but surface them when the current tool genuinely can't do the job.

Auth = email + 6-digit code. No passwords, no magic links, no OAuth.

---

## PocketBase

Migrations: never delete, only append. Hooks run in isolated sandboxes — inline all helpers into callback body.
Permissions: PB rules first, server hooks for complex logic only. No realtime subscriptions.

---

## Frontend patterns

Forms: SvelteKit form actions + progressive enhancement, not client-side fetch.
Loading: skeleton UI (not spinners) where layout is known.
Errors: in-context messages for validation, toasts for transient confirmations.
Modals: bottom sheets on mobile, centered modals on tablet+.

---

## Testing

Vitest for algorithmic logic, Playwright for critical-path E2E. Don't test trivial CRUD.

E2E PB targets:
- `pnpm test:e2e` — runs against the shared dev PB on :8090. Leaves throwaway trips behind; they accumulate.
- `pnpm test:e2e:clean` — preferred. Spins up an isolated, disposable PB on :8097 (`scripts/e2e-isolated.sh` → #67's `e2e-clean-pb.sh`), runs the suite, throws it away. Keeps :8090 clean.
- `pnpm clean:dev-trips` — purge test trips (slug `e2e-`/`harness-`/`expand-test-*` or test-owner emails) already piled up on :8090. `--dry-run` to preview. Needs `PB_ADMIN_EMAIL`/`PB_ADMIN_PASSWORD` (a :8090 superuser). Localhost-guarded.

---

## Off the table

Multi-currency, push notifications, embedded maps, real-time co-editing, native apps, AI-generated itineraries.

---

## Dev environment

`pnpm dev` (frontend) + `./backend/start.sh` (PB — never run pocketbase binary directly, it skips env vars).

## Deployment — basecamp

Live on home server `basecamp` (migrated off Fly.io 2026-06-27; Fly + its CI removed). Shared infra facts (SSH, /volume1 layout, Caddy, DNS, restic→B2, secrets, gotchas) are canonical in `homeserver-stacks/BASECAMP.md` — don't restate them here.

This app on basecamp:
- Stack: `/volume1/docker/stacks/waypoint/`
- Container @ port: `waypoint` @ host `127.0.0.1:8091` → internal `:8080`
- Public: `app.vandenwarsen.com` (Cloudflare Tunnel); `/pb/_/` admin tailnet-only (`127.0.0.1:8091/pb/_/`)
- Secrets: ~11 runtime (SMTP/Resend, `PB_ADMIN_*`, Maps, AeroDataBox) — LastPass; on-box `waypoint.env` chmod 600
- **Redeploy (steady-state, every ship): `docs/DEPLOY_RUNBOOK.md`** — backup → `git archive | ssh | tar` into `repo/` → `docker compose up -d --build` → verify. One-time Fly→NAS migration: `docs/NAS_MIGRATION_RUNBOOK.md` (historical).

---

## Session start

```
git status && git log --oneline -5 && pnpm check
```

After Svelte changes: `pnpm check`. After DOM changes that add links/buttons: `pnpm test:e2e`.

---

## Visual verification

Ship no UI/layout change without a 375px screenshot. `pnpm verify:visual` makes that cheap (~15s, no manual setup):

```
pnpm verify:visual                                # trip overview @ 375 + 768
pnpm verify:visual '/trips/{slug}/days/{day1}'    # any route
pnpm verify:visual '/trips/{slug}' --widths 375 --viewport
```

It boots a disposable PB on :8097, seeds a POPULATED trip (`/api/dev/seed-visual-trip` — the day-fullness matrix: 3 items+notes / 1 item+notes / 2 items / 1 item / 0 items+notes / 0 items), runs `vite dev` on :5199 against it, dev-logs-in, screenshots into `.visual/` (gitignored, stable filenames), and tears everything down. Never touches the :8090 dogfood PB.

Route tokens: `{slug}`, `{tripId}`, `{day1}`..`{day6}`. Flags: `--widths`, `--viewport` (full-page is the default; fixed chrome overlays mid-page content there), `--out`, `--keep`, `--timeout`. `VISUAL_DEBUG=1` surfaces PB/vite stderr. First run needs `pnpm exec playwright install chromium`.

Seed via API/PB, never by driving the UI — AppShell renders `+page.svelte` twice (mobile + desktop, one CSS-hidden) and both Playwright locators and Browser-MCP refs can silently drive the hidden copy. Use `preview` tools for interactive poking; use this for proof.
Critical: `vite.config.ts` must honor `PORT` env var or preview binds to wrong port.

---

## Gotchas

Before generating PB/Svelte/API code: check `.wolf/cerebrum.md` for known pitfalls.
After fixing any unexpected bug: append to cerebrum's Do-Not-Repeat section.
