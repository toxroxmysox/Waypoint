#!/usr/bin/env bash
# #116 Phase 3 — file the 9 v1 WP-A stragglers as direct issues. Idempotency: run once.
# Dispositions confirmed by Scott 2026-06-13:
#   A-006+A-025 -> one issue (chip gate/target + loader guard)
#   A-016 -> codes in Documents view
#   A-013 -> Leave trip (self-leave UI; reuses #133 tombstone machinery, PRD §13)
#   A-015 -> mirror swipe launch on Goals / post-join (additive entry, not a move)
#   A-020 -> export from archive + import as a new trip (Scott wants reuse; blocked on #174/#173)
#   A-024 -> REMOVE print (Scott: "we will never need it")
# A-017 (flights lineup) + A-018 (mid-trip money glance) are grill->PRD, filed separately.
# Bodies are written to temp files (plain redirection) to dodge $()+heredoc paren-balancing.
set -euo pipefail
REPO=toxroxmysox/Waypoint
TMP=$(mktemp -d)
created=()
mk() { # title, labels, bodyfile
  local url
  url=$(gh issue create --repo "$REPO" --title "$1" --label "$2" --body-file "$3")
  echo "  $url — $1"
  created+=("$url")
}

cat > "$TMP/006.md" <<'EOF'
**Source:** #116 audit, findings WP-A-006 (P2) + WP-A-025 (P3) — Trip Mode entry coherence.

Two problems, one root (Trip Mode entry has no single guarded door):

1. **Status-blind chip (A-006).** The Overview "Trip Mode" chip renders unconditionally and navigates to `/today`, while the mode-pill toggle lands on `/now` — two different "homes" for one mode. On planning-status and past trips the chip still shows; tapping it lands on a dead-ish "No itinerary for today / Today doesn't fall within this trip's dates" state that makes the app feel broken pre- and post-trip. Contradicts CONTEXT.md ("Trip Mode… available only when trip status is active").
2. **Unguarded loaders (A-025).** `/now`, `/today`, `/today/upcoming` load for ANY trip status via deep link — a planning or long-past trip renders trip-mode views with the planning bottom-nav (a chimera nav can't normally reach, but the unguarded chip links straight into).

**Where:** `src/routes/(app)/trips/[slug]/+page.svelte:92-101` (chip → `/today`, unguarded); `src/lib/shell/components/AppShell.svelte:54` (pill → `/now`); `src/routes/(app)/trips/[slug]/now/+page.server.ts`, `today/+page.server.ts`, `today/upcoming/+page.server.ts` (no `isTripActive` guard).

**Fix:** gate the chip on `isTripActive(trip)` and point it at `/now` to match the pill (one mode, one home). Add a loader guard on the three trip-mode routes that redirects to the trip home when `!isTripActive(trip)`. Charter scenario 24 wants read-only peeking only for *active* trips, so non-active deep links redirect rather than render.

**Acceptance:** chip hidden on non-active trips; chip and pill land on the same home; deep-linking `/now` (or `/today`) on a planning/past trip redirects to the trip home; `pnpm check`; visual-verify at 375px.
EOF

cat > "$TMP/016.md" <<'EOF'
**Source:** #116 audit, finding WP-A-016 (P3).

Text confirmation codes live solely on item detail; the Documents tab — literally where a novice looks for "my confirmation" — shows file artifacts only, with no hint that codes exist elsewhere. Mid-trip "what's the hotel code" → Docs tab → not there → back to email (the old stack). The domain model (Document = artifact, codes = item field) is sound; the nav doesn't bridge the novice's mental model.

**Where:** `src/routes/(app)/trips/[slug]/items/[itemId]/+page.svelte:131` (`confirmation_codes` on item detail only); `src/routes/(app)/trips/[slug]/documents/+page.svelte` (artifacts only).

**Fix:** keep the model, bridge the lookup — surface each item's confirmation codes as read-only chips on its row in the Documents list (or an explainer line pointing to where codes live). No schema change.

**Acceptance:** a member can find a confirmation code from the Documents tab without opening item detail; `pnpm check`; visual-verify at 375px.
EOF

cat > "$TMP/013.md" <<'EOF'
**Source:** #116 audit, finding WP-A-013 (P2).

A member cannot leave a trip. "Remove" is owner-only; there is no "Leave trip" affordance for travelers/viewers anywhere, so the only exit is asking the owner in the group text. #133 already shipped the removal machinery (cascade/tombstone semantics per authored-record type) and the Former-members tombstone UI exists — but the self-serve door was never cut. MEMBERSHIP_LIFECYCLE_PRD §13 specs the semantics: self-leave is tombstone-only (a leaver can't reassign or cascade; expenses forced to `keep`; votes drop).

**Where:** `src/routes/(app)/trips/[slug]/members/+page.svelte:150` (Remove form gated on `data.isOwner`; no self-leave control); former-members tombstone UI at `:183-206` (#133); `docs/MEMBERSHIP_LIFECYCLE_PRD.md:83` (§13 self-leave-is-tombstone-only) + `:124` (expenses forced `keep`, votes drop).

**Fix:** add a "Leave trip" affordance on the Members self-row (and/or under More) wired to a `?/leave` action that reuses the remove/tombstone path with §13 semantics. Guard the sole owner (must transfer ownership or remove others first) — a one-owner trip can't be abandoned.

**Acceptance:** a traveler/viewer can leave a trip; leaving tombstones them (name kept on past expenses, money history preserved); the sole owner is blocked with a clear message; `pnpm check`; `pnpm test:e2e` (adds a control); visual-verify at 375px.
EOF

cat > "$TMP/015.md" <<'EOF'
**Source:** #116 audit, finding WP-A-015 (P3). Disposition (Scott, 2026-06-13): additive entry point, not a move.

The swipe deck — a contribution minigame — launches only from the Phases sub-tab, a structure-management surface (create/reorder/delete phases). A contributor "looking for where to weigh in" has no reason to open Phases; an owner managing structure gets a game card. V4_GROUP_INPUT_PRD placed it on Phases deliberately, so this is an *additional* door on the surfaces a contributor actually visits — the Phases card stays.

**Where:** `src/routes/(app)/trips/[slug]/phases/+page.svelte:55-67` (existing swipe launch card); `src/routes/(app)/trips/[slug]/goals/+page.svelte` (the other contribution surface — no launch card); post-join landing rides #111 (intro wizard, WP-A-014).

**Fix:** mirror the swipe launch card (count + label) on Goals, and surface it on the post-join landing where it lands (#111). Keep the existing Phases card. Per D1 (contextual scattering), per-surface discoverability is the agreed ceiling — this is discoverability, not a global menu.

**Acceptance:** a contributor finds the swipe deck from Goals (and/or post-join) without opening Phases; `pnpm check`; visual-verify at 375px. Relates: #89 (phase sub-tab pass), #111 (intro wizard).
EOF

cat > "$TMP/020.md" <<'EOF'
**Source:** #116 audit, finding WP-A-020 (P3). Disposition (Scott, 2026-06-13): build it — the archive should be reusable.

Scenario 39 (a family wants to do the trip themselves): the public archive is a beautiful dead end for non-members — read-only, no "use as template", no export; clone/export exist but are member-gated. The plan can be read but not reused by the people it's shared with. Scott wants: from the archived state, export the trip and import it as a brand-new trip on your own account.

**Where:** `src/routes/archive/[token]/+page.svelte` (public, read-only — no template/export/reuse affordance); `src/routes/(app)/trips/[slug]/export/` + `clone/` (machinery exists, member-gated). **Blocked on #174** (export→import round-trip currently fails; export omits money/goals) and **#173** (clone broken on real trips) — the round-trip must actually work and carry the right slices first.

**Fix:** add a "Use as template / Export plan" affordance to the public archive page → download the plan as JSON (reusing the existing export, PII-stripped) + an import path that creates a new trip owned by the importer (import-on-signup for non-members). Decide PII scope at plan time (strip member identities + expenses; keep the itinerary skeleton).

**Acceptance:** a non-member with an archive link can export the plan and import it as a new trip they own; PII handled per the planned decision; round-trip verified (rides #174); `pnpm check`; `pnpm test:e2e`. Needs a plan before code (depends on #174 + #173).
EOF

cat > "$TMP/024.md" <<'EOF'
**Source:** #116 audit, finding WP-A-024 (P3). Disposition (Scott, 2026-06-13): **remove** — "not sure how it got in there, we will never need it."

Print itinerary (More → Print) is planning-nav-only, prints whatever page you're on (relying on print.css to restyle), and was flagged as a low-value path. Decision is to delete it rather than extend it to Trip Mode.

**Where:** `src/routes/(app)/trips/[slug]/more/+page.svelte:126-145` (Print itinerary `Card` → `window.print()`); `src/routes/layout.css:2` (`@import '$lib/shell/print.css'`); `src/lib/shell/print.css`.

**Fix:** delete the Print itinerary `Card` from More, remove the `print.css` import from `layout.css`, and delete `src/lib/shell/print.css`. Confirm no other `window.print()` / `print.css` references remain (`grep -rn "window.print\|print.css" src/`).

**Acceptance:** no Print affordance anywhere in the app; `print.css` gone; grep for `window.print`/`print.css` over `src/` is clean; `pnpm check`; visual-verify the More page at 375px (card removed, layout intact).
EOF

mk "fix(trip-mode): Overview chip is status-blind and mis-targeted; trip-mode loaders unguarded" "bug,afk" "$TMP/006.md"
mk "feat(documents): surface confirmation codes in the Documents tab" "enhancement,afk" "$TMP/016.md"
mk "feat(members): no \"Leave trip\" for members — self-leave UI never built" "enhancement,afk" "$TMP/013.md"
mk "feat(collaboration): swipe deck only launches from Phases — mirror on Goals / post-join" "enhancement,afk" "$TMP/015.md"
mk "feat(archive): export a trip from its archive and import it as a new trip" "enhancement,afk" "$TMP/020.md"
mk "refactor(shell): remove the Print itinerary feature — unused" "refactor,afk" "$TMP/024.md"

echo
echo "Created ${#created[@]} issues."
printf '%s\n' "${created[@]}" > docs/app-audit/stragglers-issues.txt
echo "URLs saved to docs/app-audit/stragglers-issues.txt"
rm -rf "$TMP"
