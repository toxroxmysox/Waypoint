#!/usr/bin/env bash
# Stand up an isolated, clean PocketBase for deterministic E2E runs (issue #67).
# Wipes /tmp/pb67, re-applies migrations, upserts a superuser, and serves on
# :8097 with THIS worktree's hooks + migrations. Pass --no-serve to only reset.
#
# Gotcha (baked in): a custom --dir alone makes PB look for hooks/migrations
# under that dir, so they silently don't load. Always pass explicit
# --migrationsDir and --hooksDir alongside --dir.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PB="${PB_BIN:-/Users/Scott/Waypoint/backend/pocketbase}"
DIR="${PB_DIR:-/tmp/pb67}"
PORT="${PB_PORT:-8097}"

# Stop anything already on the port.
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | xargs -r kill 2>/dev/null || true
sleep 1

rm -rf "$DIR"
"$PB" migrate up --dir "$DIR" --migrationsDir "$ROOT/backend/pb_migrations" >/dev/null
"$PB" superuser upsert admin@e2e.test e2eAdminPass123 --dir "$DIR" >/dev/null
echo "clean PB data prepared at $DIR"

[ "${1:-}" = "--no-serve" ] && exit 0

set -a; source "$ROOT/.env.local"; set +a
# --hooksWatch=false: without it, PB's file watcher can fire a (delayed, on
# macOS) "hooks changed" event mid-run and auto-restart, dropping every in-flight
# connection → intermittent `fetch failed` / `ClientResponseError 0` in the app →
# flaky login/page failures. A test PB must not restart itself.
exec "$PB" serve \
  --dir "$DIR" \
  --migrationsDir "$ROOT/backend/pb_migrations" \
  --hooksDir "$ROOT/backend/pb_hooks" \
  --hooksWatch=false \
  --http 127.0.0.1:"$PORT"
