#!/bin/bash
set -e

DATA_DIR="${PB_DATA_DIR:-/data}"
mkdir -p "$DATA_DIR"

# Start PocketBase in the background on :8090
/app/backend/pocketbase serve \
  --dir "$DATA_DIR" \
  --hooksDir /app/backend/pb_hooks \
  --migrationsDir /app/backend/pb_migrations \
  --http 0.0.0.0:8090 &

PB_PID=$!

# Give PocketBase a moment to start and run migrations
sleep 2

# Start SvelteKit on :3000
export PORT=3000
export HOST=0.0.0.0
node /app/build/index.js &

SK_PID=$!

# Start Caddy on :8080 (Fly-facing port)
caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &

CADDY_PID=$!

# If any process exits, kill the others and exit
trap "kill $PB_PID $SK_PID $CADDY_PID 2>/dev/null; exit 1" TERM INT
wait -n $PB_PID $SK_PID $CADDY_PID
kill $PB_PID $SK_PID $CADDY_PID 2>/dev/null
exit 1
