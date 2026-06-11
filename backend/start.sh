#!/usr/bin/env bash
# Start PocketBase with all required env vars sourced from .env.local
set -a
source "$(dirname "$0")/../.env.local" 2>/dev/null || true
source "$(dirname "$0")/../.env" 2>/dev/null || true
set +a

PB="$(dirname "$0")/pocketbase"
DATA="$(dirname "$0")/pb_data"

# Headless superuser upsert (#102). Without a superuser, `pocketbase serve`
# prints a `/_/#/pbinstal/<token>` installer URL and the dashboard routes to a
# first-run "create your superuser" login screen — the popup you keep minimizing.
# It is NOT needed for tests; it only exists so SOMEONE creates the first admin.
# Upserting one here (idempotent) suppresses the installer entirely and gives the
# archive route's `_superusers` auth (src/routes/archive/[token]) real env-driven
# creds — same trick scripts/e2e-clean-pb.sh already uses for the :8097 test PB.
# Dev-only: production starts via deploy/start.sh, which does NOT do this.
ADMIN_EMAIL="${PB_ADMIN_EMAIL:-admin@waypoint.dev}"
ADMIN_PASSWORD="${PB_ADMIN_PASSWORD:-waypointdevadmin}"
"$PB" superuser upsert "$ADMIN_EMAIL" "$ADMIN_PASSWORD" --dir "$DATA" >/dev/null 2>&1 \
	&& echo "superuser ready: $ADMIN_EMAIL (set PB_ADMIN_EMAIL/PB_ADMIN_PASSWORD to override)" \
	|| echo "warning: superuser upsert failed — dashboard may show the install screen" >&2

exec "$PB" serve --dir "$DATA" "$@"
