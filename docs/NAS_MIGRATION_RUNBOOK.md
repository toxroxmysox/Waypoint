# Waypoint → NAS ("basecamp") Migration Runbook

> Move Waypoint off Fly.io onto the home NAS with **zero data loss**, a **DNS-only reversible cutover**, full **public hardening before exposure**, and then **remove Fly entirely**. Companion to the Obsidian `Home Server — Migrations §2`.

**Source commit to build from:** `2cf7b25` (or the merge commit of the Phase 0 prereq PR).
**Status:** planned. Execution is **HITL** (touches prod data + DNS) — not AFK.

## Locked decisions

| Question | Decision | Why |
|---|---|---|
| Squash PocketBase migrations? | **No — keep all 49, change nothing.** | Restored DB already records every file in `_migrations`; they're no-ops on boot. Squashing orphans rows + diverges from data-backfill migrations (`0011/0012/0027`). Only legit for a clean-slate v2. |
| `/data` disk | **HDD pool (btrfs RAID1) for now**, `chattr +C` (nodatacow). Monitor fsync; move to M.2 later if it bites. | 2-user write load is light. No hardware step. |
| Sequencing | **Harden, then public cutover.** Phase 0 prereq PR closes the Critical security gaps before any public exposure. | Public OTP with no rate limiting / open admin UI is unsafe. |
| Container shape | **Keep the single container** (PB + SvelteKit + internal Caddy). Expose `:8080` only. | It's the artifact already validated in prod; the internal Caddy does the `/pb` split the baked URL depends on. Don't rebuild the topology. |
| Public ingress | **Cloudflare Tunnel (remote-managed/token) → `http://waypoint:8080`** over a shared `waypoint_net` docker network. Host-Caddy NOT in path. | TLS terminates at CF edge; tunnel is outbound-only (no inbound ports). cloudflared is its own container, so it reaches the app by **container name** over the shared net, not `localhost`. |
| Freeze method | **`fly machine stop <id>`** to freeze writes. **NEVER `fly scale count 0`** — that destroys the Machine. | `machine stop` is reversible and preserves the volume. (Overrides the review agents, which suggested `scale count 0`.) |

## Architecture

**Now (Fly):** one container, 3 procs via `deploy/start.sh` — PocketBase 0.27.2 `serve --dir /data` `:8090`; SvelteKit SSR `:3000`; Caddy `:8080` (`/pb/*`→8090, else→3000). Fly volume `pb_data`→`/data`. `PUBLIC_PB_URL=https://app.vandenwarsen.com/pb` baked at build (same-origin, path-based). CI `deploy.yml` redeploys Fly on every push to `main`.

**Target (NAS):**
```
Internet → Cloudflare edge (TLS) → cloudflared container (NAS) ──waypoint_net──▶ http://waypoint:8080 (container Caddy) → /pb→PB, else→SvelteKit
                                                                                          └ /data bind-mounted to btrfs (nodatacow)
```
cloudflared and the waypoint container share an **external `waypoint_net`** docker network, so the tunnel routes to the app by **container name** (`waypoint:8080`). NAS is amd64 (Pentium Gold 8505) → the pinned `linux_amd64` Caddy/PB binaries are correct; build natively on the NAS.

**Current DNS chain (Cloudflare `vandenwarsen.com`):** `waypoint.vandenwarsen.com` (proxied ON) → CNAME `app.vandenwarsen.com` (proxied OFF) → CNAME `waypoint-trips.fly.dev`. The cutover repoints **`app.vandenwarsen.com`** (the baked hostname) at the tunnel; saving the tunnel's Public Hostname route auto-creates the proxied `app → <UUID>.cfargotunnel.com` CNAME, replacing the Fly one.

**DNS-only claim — verified:** grep found zero Fly-specific hostnames in app code. As long as the hostname stays `app.vandenwarsen.com`, no rebuild is needed for the URL. **But the image is NOT self-contained on env** — Fly injects ~11 runtime secrets the Dockerfile doesn't bake. The NAS compose must supply them (see env file). Miss SMTP → **OTP login is silently dead.**

## Roles & prerequisites (gather BEFORE cutover)

**Scott (browser/creds/DNS — not scriptable):** `flyctl` auth + confirm app `waypoint-trips`/`ord`; the exact prod commit on Fly (`fly releases`); Resend API key + `RESEND_FROM`; the prod `PB_ADMIN_EMAIL/PASSWORD` (created manually, not in repo); CF Zero Trust access to create the tunnel + copy its token + add the `app.vandenwarsen.com` Public Hostname route; lower DNS TTL; the off-tailnet public smoke test; `fly machine stop`/`fly apps destroy`.

**Claude Code (SSH/Docker on the box):** build + pin the image from the prod commit; the waypoint + cloudflared stacks + shared `waypoint_net`; first-boot/migration verification; restore the PB backup into `data/`; the tailnet-admin Caddy host for `/pb/_/`; run `pnpm test:rules`.

> The actual cutover is **HITL** — it needs Scott at the keyboard for Fly/CF/DNS and live SSH to basecamp. Do not run it unsupervised. `/volume1/docker/stacks/` is already in the nightly restic→B2 set, so Waypoint's `data/` is backed up the moment it lands there.

---

## Phase 0 — Repo prereq branch (do FIRST, separate session)

Code changes that must land before cutover. **Do NOT redeploy Fly** — the NAS builds from this branch; Fly stays frozen on its current good image as the rollback target (rollback = `fly machine start` the existing machine, never a redeploy). Merge the branch to `main` only at cutover, together with the CI-disable + `fly.toml` removal. This removes any risk of an untested change hitting the live Fly app.

### 0.1 Pin the build (so NAS image == prod image)
- [ ] Add `"packageManager": "pnpm@<exact-version>"` to `package.json` (corepack honors it; currently **absent**, so `corepack prepare pnpm@latest` floats).
- [ ] Pin the base image by digest in **both** Dockerfile stages: `FROM node:22.x.y-slim@sha256:…`.
- [ ] (Optional belt) Add `sha256sum -c` guards after the PB and Caddy `curl` downloads.

### 0.2 Security hardening — the env-agnostic parts only
> **Rate limiting is NOT here** — it's IP-based and environment-specific (needs `CF-Connecting-IP` trusted-proxy on the NAS; an unconditional migration would also 429 dev/`test:rules`/e2e, which hammer one IP). It moves to **Phase 2** (NAS-only). See there for exact settings.
- [ ] **Gate dev routes at the edge.** In `deploy/Caddyfile`, return 403 for `/pb/api/dev/*` so the `dev-auth.pb.js` bypass is unreachable regardless of env (already fail-closed on `WAYPOINT_DEV_MODE`; this removes the single-var blast radius).
- [ ] **Edge body cap.** In `deploy/Caddyfile`, `request_body { max_size 21MB }` (just above the 20MB doc limit) so oversized uploads die at the proxy.
- [ ] **Generic OTP error.** `src/routes/invite/[code]/+page.server.ts` (and the parallel `join/[token]` action) — return a static "Failed to send code" instead of raw `err.message`.
- [ ] (Admin UI gating `/pb/_/*` is Phase 2.)

### 0.3 Fly CI — leave the branch UNMERGED pre-cutover
- [ ] Keep Phase 0 on its branch (`chore/302-nas-migration-prereqs`); the NAS builds from this branch's commit. Because nothing lands on `main`, the Fly CI (`deploy.yml`, fires on push to `main`) never triggers — Fly stays frozen on its current good image.
- [ ] At cutover (Phase 3): in one merge to `main`, include this branch **plus** deleting `deploy.yml` (else the merge itself redeploys Fly). `fly.toml` removal is Phase 4.

- [ ] **Gate:** `pnpm check` green. `pnpm test:rules` green against a staging PB (needs `WAYPOINT_DEV_MODE=true` — staging only, never the live box).

---

## Phase 1 — NAS warm standby (no traffic yet)

### 1.1 Stand up the stack
- [ ] `git clone` the repo into `/volume1/docker/stacks/waypoint/repo`, `git checkout <phase-0 merge commit>`.
- [ ] Create `/volume1/docker/stacks/waypoint/waypoint.env` (`chmod 600`, **not** in git) — all values sourced from Fly secrets / your `.env.local` (Fly values aren't retrievable; `PB_ADMIN_*` may only exist on Fly — **confirm you have them**):

```
PUBLIC_APP_URL=https://app.vandenwarsen.com
RESEND_API_KEY=
RESEND_FROM=hello@vandenwarsen.com
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USERNAME=resend
SMTP_PASSWORD=
GOOGLE_MAPS_API_KEY=
AERODATABOX_API_KEY=
PB_ADMIN_EMAIL=
PB_ADMIN_PASSWORD=
# MUST stay unset/false in prod — true disables SMTP (OTP dies) AND arms dev-auth bypass:
# WAYPOINT_DEV_MODE=
```

- [ ] `docker-compose.yml` at `/volume1/docker/stacks/waypoint/`:

```yaml
services:
  waypoint:
    build:
      context: ./repo
      dockerfile: Dockerfile
      args:
        PUBLIC_PB_URL: https://app.vandenwarsen.com/pb
        PUBLIC_APP_URL: https://app.vandenwarsen.com
    image: waypoint:local
    container_name: waypoint
    restart: unless-stopped
    ports:
      - "127.0.0.1:8088:8080"   # 127.0.0.1 only, for tailnet-admin Caddy host (→ /pb/_/). Public path is the tunnel, not this.
    env_file:
      - ./waypoint.env
    volumes:
      - /volume1/docker/stacks/waypoint/data:/data   # ONLY /data. Do NOT bind over pb_hooks/pb_migrations.
    networks: [waypoint_net]     # shared with cloudflared → reachable as http://waypoint:8080
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8080/", "-o", "/dev/null"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s

networks:
  waypoint_net:
    external: true              # create once: docker network create waypoint_net
```

**cloudflared** (same stack, or `/volume1/docker/stacks/cloudflared/`). Token from CF dashboard → Zero Trust → Networks → Tunnels → Create (Docker connector). Route the Public Hostname `app.vandenwarsen.com` → Service URL `http://waypoint:8080`.

```yaml
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=${TUNNEL_TOKEN}   # in .env, chmod 600, gitignored
    networks: [waypoint_net]
networks:
  waypoint_net:
    external: true
```

- [ ] **Prep the data dir before first boot:** `docker network create waypoint_net` (once), `mkdir -p data && chattr +C data` (nodatacow — set on the empty dir *before* PB writes the SQLite files).
- [ ] **Check box load first:** the photo-import watchdog (icloudpd/immich-go) may still be running — `tail watchdog.log` / `uptime`. PB restore is light, but don't pile first-boot migration churn on a thrashing box.

### 1.1b First-boot validation on a THROWAWAY DB (before touching prod data)
- [ ] Boot the stack with an empty `data/` (Tailscale-only, no tunnel): confirm `:8090/api/health` healthy, all 49 migrations apply, and hooks fire — create a trip → days/phase/owner auto-generate. This proves the image is sound independent of the data restore.
- [ ] Tear down the throwaway DB (`docker compose down`, wipe `data/`, re-`chattr +C`).

### 1.2 Get the data over (consistent backup — see Data-Safety Appendix)
- [ ] Trigger PB built-in backup on Fly (WAL-checkpoints + zips DB **and** `storage/` together), pull the zip, `shasum -a 256` it, `unzip -l` to confirm `data.db` + a non-empty `storage/` are present.
- [ ] Unzip into the NAS `data/` dir (or restore via PB API). `chown -R` to the UID PB runs as in the container.

### 1.3 Build + verify on a throwaway subdomain
- [ ] `docker compose build && docker compose up -d`.
- [ ] Stand up the `cloudflared` container on `waypoint_net`; route a throwaway host `waypoint-test.vandenwarsen.com` → `http://waypoint:8080` (do **not** touch the prod hostname yet).
- [ ] Through the test host: log in (OTP email arrives ⇒ SMTP good), open a known trip, confirm cover image + an uploaded document render, test Maps autocomplete + a flight lookup, open an archive/export link (⇒ `PB_ADMIN_*` good).
- [ ] **Data verification** (Appendix): per-collection row counts == Fly; `storage/` file count == Fly; superuser login works.

---

## Phase 2 — Hardening verification (still no public traffic)

- [ ] **Rotate the superuser.** Create a strong superuser. If the migrated `pb_data` was ever seeded by `backend/start.sh`, **delete `admin@waypoint.dev`** (known creds `waypointdevadmin`). Never run `backend/start.sh` on this box.
- [ ] **Gate `/pb/_/*`** behind **Cloudflare Access** (email-OTP policy for your address) — or bind admin to Tailscale-only and expose only `/pb/api/*` publicly.
- [ ] Confirm `respond /pb/api/dev/* 403` (Phase 0) is live: `curl https://waypoint-test…/pb/api/dev/login` → 403.
- [ ] **Configure rate limiting (NAS-only — Admin UI → Settings, or one-shot against this instance).** Verified PB 0.27.2 API (`backend/pb_data/types.d.ts`): `settings.rateLimits = { enabled, rules[] }`, each rule `{ label, audience, duration(s), maxRequests }`; `settings.trustedProxy = { headers[], useLeftmostIP }`.
  - **Trusted proxy FIRST (or per-IP limits lump everyone under one proxy IP and lock out all users):** `trustedProxy.headers = ["CF-Connecting-IP"]`, `useLeftmostIP = false`. (CF sets this to the real client IP; cloudflared + internal Caddy forward it.) Verify: a request shows the real client IP in PB logs, not the container IP.
  - **Rules** (agreed thresholds — 10 OTP req/hr, 5 verify attempts):
    - `{ label: "POST /api/collections/users/request-otp", audience: "", duration: 3600, maxRequests: 10 }`
    - `{ label: "POST /api/collections/users/auth-with-otp", audience: "", duration: 3600, maxRequests: 5 }`
  - `enabled = true`.
  - Verify: from one IP, the 11th `request-otp` / 6th `auth-with-otp` in the hour → 429. From a *different* IP (e.g. phone off-wifi), not throttled — confirms per-IP keying works (so a simultaneous group invite from different devices is never blocked).
- [ ] Confirm `printenv | grep WAYPOINT` in the **running PB process** shows `WAYPOINT_DEV_MODE` unset (not just the file).
- [ ] Tighten PB CORS/allowed-origins to `https://app.vandenwarsen.com`.
- [ ] `chmod 600 waypoint.env`; restrict the `data/` dir perms (contains SMTP password in PB settings).

---

## Phase 3 — Cutover (DNS-only, reversible)

> **Verify current DNS first:** is `app.vandenwarsen.com` proxied (orange) or DNS-only (grey) in Cloudflare, and pointed at Fly how? This determines cutover speed.

- [ ] **≥ old-TTL ahead:** lower the `app.vandenwarsen.com` TTL to 60s (or rely on proxied = near-instant).
- [ ] **Freeze Fly writes:** announce a ~15-min window; `fly machine stop <id> -a waypoint-trips`. ⚠️ **NEVER `fly scale count 0`** — it destroys the Machine; `machine stop` is reversible and preserves the volume. After the DNS swing no traffic reaches Fly anyway; during the brief final-backup window just don't hit the app.
- [ ] **Final sync:** start Fly just long enough to take the final PB backup → pull → restore onto NAS `data/` → `docker compose restart waypoint`. This is now the authoritative copy.
- [ ] **Re-verify** row/file counts on the NAS against the pre-freeze Fly counts.
- [ ] **Swing DNS:** repoint `app.vandenwarsen.com` → the Cloudflare Tunnel CNAME (proxied). Propagation = seconds with low TTL.
- [ ] **Verify on the real hostname:** fresh OTP login, create a trip, vote, open archive/export, Maps + flights. Watch `docker logs waypoint` + `cloudflared` logs.

**Rollback (window: ~7 days):** keep the Fly Machine **stopped (not destroyed)**, volume intact — it's last-known-good. If the NAS misbehaves: repoint `app.vandenwarsen.com` DNS back to the Fly CNAME (or pause the tunnel route), `fly machine start <id>`. ⚠️ Writes made on the NAS after cutover are NOT on Fly — rollback loses them. So rollback is "safe within minutes/hours," degrading to "data-losing emergency" later. Cut over at a low-traffic time.

---

## Phase 4 — Remove Fly entirely (destroy LAST)

Only after cutover verified **and** the rollback window elapsed.

- [ ] CI workflow already deleted (Phase 0).
- [ ] `fly apps destroy waypoint-trips` (removes machines **and** the `pb_data` volume). Take one final downloaded backup first.
- [ ] `fly volumes list` → destroy any orphan.
- [ ] Delete the **`FLY_API_TOKEN`** GitHub Actions secret; revoke the Fly token (`fly tokens list` → revoke).
- [ ] Delete `fly.toml` from the repo (git history preserves it; a stray file invites `fly deploy`).
- [ ] Fix stale `docs/SPEC.md:35` ("PocketBase on Fly.io free tier").
- [ ] Uninstall `flyctl` locally if nothing else uses it.
- [ ] Update Obsidian `Home Server — Operations` services table + `Migrations §2` to ✅, and remove Fly from the stack.

---

## Appendix A — Data-Safety procedure (the part you can't get wrong)

**What must travel:** the whole `/data` dir = `data.db` (+`-wal`/`-shm`) **and** `storage/` (all uploads — `users.avatar`, `trips.cover_image`, `documents.file`; **fully local, no S3**). `auxiliary.db` is just logs (optional).

**Backup (preferred — PB built-in):** it runs `PRAGMA wal_checkpoint(TRUNCATE)` then zips DB + storage consistently. Trigger via Admin UI → Settings → Backups, or `POST /pb/api/backups` with a superuser token. Pull via `fly ssh sftp get /data/backups/<name>.zip` or the authenticated API. **Never hot-`cp data.db`** (misses the WAL → stale/torn DB).

**Verify before cutover:**
```bash
# per-collection counts (compare NAS vs pre-freeze Fly)
for t in users trips trip_members phases days items expenses settlements \
         votes documents notifications suggestions checklist_items trip_goals; do
  echo -n "$t: "; sqlite3 /data/data.db "SELECT count(*) FROM $t;"
done
find /data/storage -type f | wc -l          # == Fly's count
```
Plus: superuser login returns a token; a known trip's image + document actually render in the UI (proves DB row + blob + path align).

**Traps + mitigations:**
- `storage/` missed → silent broken links. → built-in backup bundles it; `unzip -l` to confirm.
- WAL not checkpointed → stale DB. → built-in backup; or stop PB before any raw copy.
- Backup mid-write. → PB's online backup is application-aware (read-only during the snapshot), so a *consistent* backup needs no stop; the `fly machine stop` freeze additionally guarantees no new writes for the *final* sync.
- PB version mismatch → NAS **must** run 0.27.2 (pinned). A newer PB silently auto-migrates (one-way).
- Bind-mount perms → `chown -R` data dir to PB's UID; test an upload post-restore.
- btrfs CoW → `chattr +C` on `data/` before first write; never use a btrfs snapshot as the DB "backup."
- Single zip = SPOF → keep ≥2 verified copies (NAS + laptop) before deleting anything on Fly.

## Open items needing Scott (can't derive from repo)
1. **Do you have the prod `PB_ADMIN_EMAIL/PASSWORD` and SMTP/Resend creds?** Fly values aren't retrievable. Without `PB_ADMIN_*` the archive/export route 500s; without SMTP, OTP login is dead.
2. **Is `app.vandenwarsen.com` proxied or DNS-only in Cloudflare today, and how is it pointed at Fly?** Sets cutover mechanics.
3. **Which `pb_data` is the source of truth** — confirm it's the live Fly prod data (not a dev DB seeded with `admin@waypoint.dev`).
