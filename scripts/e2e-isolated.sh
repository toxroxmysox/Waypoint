#!/usr/bin/env bash
# scripts/e2e-isolated.sh — run the Playwright E2E suite against an ISOLATED,
# disposable PocketBase on :8097 instead of the shared dev PB on :8090 (issue
# #91). This stops every test run from leaving throwaway trips in the database
# you actually work in. Builds directly on the clean-PB harness from #67
# (scripts/e2e-clean-pb.sh), which wipes /tmp/pb67, re-applies migrations, and
# serves with this worktree's hooks.
#
# The isolated PB lives in /tmp and is thrown away, so there is nothing to clean
# up afterwards — that is the whole point. Use scripts/clean-dev-trips.mjs only
# for trips that already piled up on :8090.
#
# Usage:  pnpm test:e2e:clean            # whole suite, isolated
#         pnpm test:e2e:clean some.spec  # extra args pass through to playwright
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PB_PORT:-8097}"
PB_URL="http://127.0.0.1:${PORT}"

# Stand up a fresh, migrated PB on :8097 in the background. e2e-clean-pb.sh
# sources .env.local (WAYPOINT_DEV_MODE + E2E_TEST_EMAIL/E2E_TEST_EMAILS), so the
# dev-fixture routes are enabled on this instance only.
PB_PORT="$PORT" "$ROOT/scripts/e2e-clean-pb.sh" &
PB_PID=$!

cleanup() {
	kill "$PB_PID" 2>/dev/null || true
	# Belt-and-suspenders: kill whatever still holds the port.
	lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | xargs -r kill 2>/dev/null || true
}
trap cleanup EXIT

# Wait for PB to answer (max ~15s).
for _ in $(seq 1 30); do
	if curl -sf "$PB_URL/api/health" >/dev/null 2>&1; then break; fi
	sleep 0.5
done
if ! curl -sf "$PB_URL/api/health" >/dev/null 2>&1; then
	echo "✗ isolated PocketBase did not come up on $PB_URL" >&2
	exit 1
fi

# PUBLIC_PB_URL is inlined into the SvelteKit build, so it must be exported
# BEFORE Playwright's webServer runs `npm run build`. dotenv (in
# playwright.config.ts) won't override an already-set process env, so this wins
# over the :8090 in .env.local for both the app build and the dev-fixture calls.
export PUBLIC_PB_URL="$PB_URL"

cd "$ROOT"
exec pnpm exec playwright test "$@"
