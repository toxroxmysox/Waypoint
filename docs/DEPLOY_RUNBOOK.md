# Waypoint redeploy runbook — steady-state (main → basecamp)

The **repeatable** procedure for shipping a new `main` to the live basecamp container.
For the one-time Fly.io→NAS migration see `docs/NAS_MIGRATION_RUNBOOK.md` (historical).
Shared infra facts (SSH, layout, Caddy, backups) are canonical in `homeserver-stacks/BASECAMP.md`.

**This deploys a data migration on real data. Every run: backup first, verify after, never touch `data/` or `waypoint.env`.**

## Facts (constant)

| | |
|---|---|
| Box (Tailscale) | `vandenwarsen@100.82.71.103` (tailnet only; MagicDNS `basecamp`) |
| Stack dir | `/volume1/docker/stacks/waypoint/` |
| Build context | `./repo` (app source; `image: waypoint:local`) |
| Data (DO NOT TOUCH) | `./data` → container `/data` · secrets `./waypoint.env` (chmod 600) |
| Container | `waypoint` @ `100.82.71.103:8091` → internal `:8080`; public `app.vandenwarsen.com` (CF Tunnel) |
| No git on NAS | source ships via `git archive <sha> | ssh | tar` |
| PB admin creds | `$PB_ADMIN_EMAIL` / `$PB_ADMIN_PASSWORD` — env vars **inside** the container |

## Pre-flight (on the Mac)

```bash
cd /Users/Scott/Waypoint
git fetch origin && git log --oneline -1 origin/main   # the SHA you intend to deploy
SHA=$(git rev-parse origin/main)                        # or pin an explicit commit
pnpm check && pnpm test:unit                            # main must be green before it ships
```
First connection of a session may need the host key: prepend
`ssh -o StrictHostKeyChecking=accept-new vandenwarsen@100.82.71.103 …` once.

## 1. Backup first (rollback point — non-negotiable)

PB built-in backup = consistent (WAL-checkpointed DB + storage). Triggered via the admin API inside the container:

```bash
ssh vandenwarsen@100.82.71.103 'docker exec waypoint sh -c '"'"'
TOKEN=$(curl -s -X POST http://localhost:8090/api/collections/_superusers/auth-with-password \
  -H "Content-Type: application/json" \
  -d "{\"identity\":\"$PB_ADMIN_EMAIL\",\"password\":\"$PB_ADMIN_PASSWORD\"}" \
  | grep -o "\"token\":\"[^\"]*\"" | sed "s/.*://;s/\"//g")
[ -n "$TOKEN" ] || { echo AUTH-FAILED; exit 1; }
curl -s -X POST http://localhost:8090/api/backups \
  -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"predeploy_<SHA>.zip\"}" -w "\nHTTP %{http_code}\n"
'"'"''
# Expect HTTP 204. Confirm: ls -la /volume1/docker/stacks/waypoint/data/backups/
```
(`<SHA>` → the short commit. Backups live at `data/backups/` on the box.)

## 2. Ship the source (atomic swap; never clobbers data/ or .env)

```bash
git archive --format=tar "$SHA" | ssh vandenwarsen@100.82.71.103 '
cd /volume1/docker/stacks/waypoint &&
rm -rf repo_new && mkdir repo_new && tar -xf - -C repo_new &&
echo "extracted $(find repo_new -type f | wc -l) files" &&
ls repo_new/backend/pb_migrations/ | tail -3 &&
rm -rf repo_old && mv repo repo_old && mv repo_new repo &&
echo SWAPPED'
```
`repo_old` is kept as a same-host rollback of the source.

## 3. Rebuild + restart

```bash
ssh vandenwarsen@100.82.71.103 \
  'cd /volume1/docker/stacks/waypoint && docker compose up -d --build 2>&1 | tail -15'
# Old container keeps serving during the build; it is recreated only at the end.
# PB applies any new migrations on boot.
```

## 4. Verify (every deploy)

```bash
ssh vandenwarsen@100.82.71.103 '
sleep 12
docker ps --filter name=waypoint --format "{{.Names}} {{.Status}}"   # want: Up … (healthy)
docker logs waypoint 2>&1 | grep -iE "migrat|smtp\.pb|ratelimit\.pb|error|panic|Server started" | tail -15
'
# Boot log MUST show: "smtp.pb.js: SMTP configured" (else OTP login is silently dead),
# the ratelimit line, "Server started", and NO error/panic.

# Data intact + any migration backfill sane (counts via admin API, same TOKEN trick as step 1):
#   trips / items totalItems unchanged from before; spot-check the migration's effect.

# Public edge (tunnel + security headers) from anywhere:
curl -sS -I https://app.vandenwarsen.com/ | grep -iE 'HTTP/|content-type-options|frame-options|strict-transport|referrer-policy|permissions-policy'
# Want 200/303 + nosniff, X-Frame DENY, HSTS, Referrer-Policy, Permissions-Policy.
```
Then load `https://app.vandenwarsen.com` and **send yourself an OTP** to confirm end-to-end login.

## 5. Rollback (if verify fails)

```bash
ssh vandenwarsen@100.82.71.103 '
cd /volume1/docker/stacks/waypoint &&
# restore the pre-deploy DB+storage from the backup zip, then the prior source, then rebuild:
# (PB restore: Admin UI → Settings → Backups → Restore "predeploy_<SHA>.zip", OR the restore API)
rm -rf repo_broken && mv repo repo_broken && mv repo_old repo &&
docker compose up -d --build'
```
The migration is append-only + idempotent, so a forward re-deploy is usually safer than a restore;
restore from the backup only if data looks wrong.

## Gotchas (learned the hard way)

- **Never `cp data.db`** — misses the WAL → torn DB. Use PB's backup (step 1).
- The sync (step 2) targets only `repo/`. `data/` and `waypoint.env` are siblings — leave them.
- Missing/empty `SMTP_*` in `waypoint.env` → OTP login silently dead with no error. Check the boot log.
- `git archive` ships tracked files at the SHA; a fresh `repo/` (swap, not overlay) avoids stale deleted files lingering.
- UGOS firmware updates flip SSH "Local network only" back ON (tailnet SSH times out) — toggle it OFF on the box after any NAS update.
