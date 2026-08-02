#!/usr/bin/env bash
# scripts/backend-harnesses.sh — run every PocketBase harness, each against its
# OWN freshly-migrated PB (issue #341).
#
# WHY A FRESH PB PER HARNESS
#   The harnesses are not order-independent. test-members.mjs has `non_member`
#   claim a placeholder, which makes them a genuine co-traveler — so a later
#   test-rules.mjs run on the same database sees the co-traveler users.viewRule
#   correctly allow a cross-read and scores 674/676 instead of 676/676. That is
#   contamination, not flake (it was mis-filed as flake once already). Giving
#   each harness a clean database removes the whole class.
#
# Each cycle wipes /tmp/pb-harness, re-applies migrations, serves on :8097 with
# THIS worktree's hooks, runs one harness, then tears the server down.
#
# USAGE
#   bash scripts/backend-harnesses.sh              # all harnesses
#   bash scripts/backend-harnesses.sh rules money  # only the named ones
#
# ENV
#   PB_BIN    path to the pocketbase binary (default backend/pocketbase)
#   PB_PORT   port to serve on (default 8097)
#
# EXIT  0 = every harness passed, 1 = at least one failed.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PB="${PB_BIN:-$ROOT/backend/pocketbase}"
PORT="${PB_PORT:-8097}"
DIR="${PB_DIR:-/tmp/pb-harness}"
PB_URL="http://127.0.0.1:${PORT}"

ALL=(rules members invites suggestions money)
SELECTED=("$@")
[ ${#SELECTED[@]} -eq 0 ] && SELECTED=("${ALL[@]}")

if [ ! -x "$PB" ]; then
	echo "✗ pocketbase binary not found or not executable: $PB" >&2
	echo "  set PB_BIN, or download v0.27.2 into backend/pocketbase" >&2
	exit 1
fi

PB_PID=""

# Kill by tracked PID first — `lsof` is not guaranteed present everywhere and
# `xargs -r` is GNU-only (macOS xargs runs the command even with no input).
# lsof is only a fallback for a stray server from an earlier run.
stop_pb() {
	if [ -n "$PB_PID" ]; then
		kill "$PB_PID" 2>/dev/null || true
		wait "$PB_PID" 2>/dev/null || true
		PB_PID=""
	fi
	if command -v lsof >/dev/null 2>&1; then
		for pid in $(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null); do
			kill "$pid" 2>/dev/null || true
		done
		# Give the port a moment to actually free up before the next bind.
		for _ in $(seq 1 20); do
			lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1 || break
			sleep 0.25
		done
	fi
}
trap stop_pb EXIT

start_pb() {
	stop_pb
	rm -rf "$DIR"
	"$PB" migrate up --dir "$DIR" --migrationsDir "$ROOT/backend/pb_migrations" >/dev/null
	"$PB" superuser upsert admin@e2e.test e2eAdminPass123 --dir "$DIR" >/dev/null

	# The dev-fixture routes (auth-bypass, rules-fixture) are gated on
	# WAYPOINT_DEV_MODE + the E2E_TEST_EMAILS whitelist, both of which live in
	# .env.local. --hooksWatch=false so PB never restarts mid-run (#67 scar).
	set -a
	# shellcheck disable=SC1091
	[ -f "$ROOT/.env.local" ] && source "$ROOT/.env.local"
	set +a

	"$PB" serve \
		--dir "$DIR" \
		--migrationsDir "$ROOT/backend/pb_migrations" \
		--hooksDir "$ROOT/backend/pb_hooks" \
		--hooksWatch=false \
		--http 127.0.0.1:"$PORT" >"$DIR.log" 2>&1 &
	PB_PID=$!

	for _ in $(seq 1 60); do
		if curl -sf "$PB_URL/api/health" >/dev/null 2>&1; then return 0; fi
		sleep 0.5
	done
	echo "✗ PocketBase did not come up on $PB_URL" >&2
	tail -20 "$DIR.log" >&2 || true
	return 1
}

declare -a FAILED=()
declare -a PASSED=()

for name in "${SELECTED[@]}"; do
	script="$ROOT/backend/test-${name}.mjs"
	if [ ! -f "$script" ]; then
		echo "✗ no such harness: $script" >&2
		FAILED+=("$name (missing)")
		continue
	fi

	echo ""
	echo "──────── $name ────────"
	if ! start_pb; then
		FAILED+=("$name (PB failed to start)")
		continue
	fi

	if PUBLIC_PB_URL="$PB_URL" node "$script"; then
		PASSED+=("$name")
	else
		FAILED+=("$name")
	fi
	stop_pb
done

echo ""
echo "════════ summary ════════"
for n in "${PASSED[@]:-}"; do [ -n "$n" ] && echo "  ✓ $n"; done
for n in "${FAILED[@]:-}"; do [ -n "$n" ] && echo "  ✗ $n"; done

if [ ${#FAILED[@]} -gt 0 ]; then
	echo ""
	echo "${#FAILED[@]} harness(es) failed."
	exit 1
fi
echo ""
echo "All ${#PASSED[@]} harnesses passed."
