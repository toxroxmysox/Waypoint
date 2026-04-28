#!/usr/bin/env bash
# Start PocketBase with all required env vars sourced from .env.local
set -a
source "$(dirname "$0")/../.env.local" 2>/dev/null || true
source "$(dirname "$0")/../.env" 2>/dev/null || true
set +a

exec "$(dirname "$0")/pocketbase" serve --dir "$(dirname "$0")/pb_data" "$@"
