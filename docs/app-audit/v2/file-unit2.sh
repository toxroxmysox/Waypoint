#!/usr/bin/env bash
# #116 Unit 2 — file the Phase-3 quick-decides batch as issues. Idempotency: run once.
# Product forks resolved by Scott 2026-06-12: B-002 block-until-moved, B-021 build it,
# B-013 rephrase (don't count), B-022 light lens. B-006 folds into #189 (no issue).
# Each body ends with the source finding id(s) from docs/app-audit/v2/findings-v2.json.
set -euo pipefail
REPO=toxroxmysox/Waypoint
created=()
mk() { # title, labels, body
  local url
  url=$(gh issue create --repo "$REPO" --title "$1" --label "$2" --body "$3")
  echo "  $url — $1"
  created+=("$url")
}

mk "fix(itinerary): deleting a phase orphans its parking lot — ideas vanish from every screen" "bug,afk" \
'**Source:** #116 deep-review, finding WP-B-002 (P2, fleet-verified).

An item with `status=unplanned` and `phase='\'''\''` is renderable nowhere — every parking surface is phase-scoped (day-view filters `i.phase === p.id`, Phase Detail queries its own phase, the trip-wide `/parking-lot` is a 303 to `/phases`, the swipe deck is per-phase). Three paths create that state; the dangerous one is **phase delete**: `0006_items.js` declares `items.phase` with no `cascadeDelete`, so PB clears `item.phase` on delete, while `phases.pb.js onRecordDeleteRequest` re-buckets only days'\'' phases and never re-homes items — so the deleted phase'\''s entire parking lot keeps existing in the DB but disappears from every screen. Violates CONTEXT.md'\''s invariant "An unplanned item belongs to a phase."

**Where:** `backend/pb_hooks/phases.pb.js` (`onRecordDeleteRequest` — days only); `backend/pb_migrations/0006_items.js:14` (phase relation, no cascade); `src/lib/itinerary/components/ItemForm.svelte:410` (Day "Unscheduled") + `:433` (Phase "None"); `src/routes/(app)/trips/[slug]/items/new/+page.server.ts` (status ternary, no phase validation); `backend/pb_hooks/suggestions.pb.js` (approve path writes `phase:'\'''\''` when payload lacks it).

**Fix (DECISION — block-until-moved):** on phase delete, **block while the phase still holds unplanned items** ("Move N ideas first"). Enforce the phase-required invariant at the source too: require a phase when Day = Unscheduled in `ItemForm` + server validation (`items/new` and edit), and make the suggestion-approve hook force/fall-back to a phase. Add an "Unsorted ideas" catch-all section on the Phases sub-tab as a safety net for any pre-existing orphans.

**Acceptance:** a phase with parking-lot ideas cannot be deleted until they'\''re moved (clear message); no create/approve path can produce a phase-less unplanned item; `pnpm check` + a rules/vitest case for the delete block.'

mk "fix(trip-mode): nav coherence — mode-chrome chimera, back-exits, phase-blind parking back" "bug,afk" \
'**Source:** #116 deep-review, findings WP-B-011 (P2) + WP-B-012 (P2) + WP-B-023 (P3) — all code-verified 2026-06-12. One issue: shared shell/routing root.

1. **B-011 mode-chrome chimera.** The trips-list "On trip" card links to `/trips/[slug]` — the planning Overview — but because the trip is active, `AppShell` renders clay Trip-Mode chrome and `getActiveTab` falls back to `'\''now'\''` for the non-tab path, so the mode pill reads "Edit plan" while you are literally looking at the plan-editing surface. The in-memory mode override resets on every reload/PWA relaunch.
2. **B-012 back-exits.** Item-detail, Today, and items/new back-chevrons are hardcoded to planning surfaces; **Documents back → `/trips`** abandons the trip entirely. In standalone PWA there is no browser back, so every Trip-Mode drill-down strands the user on a planning surface.
3. **B-023 phase-blind parking back.** A parking idea'\''s detail back-chevron and post-delete redirect land on the Overview, ignoring the already-loaded `itemPhase`.

**Where:** `src/routes/(app)/trips/+page.svelte:70`; `src/lib/shell/nav-tabs.ts:43-48`; `AppShell.svelte:35-55`; `items/[itemId]/+page.svelte:37-54` + `+page.server.ts:128-131`; `today/+page.svelte:43-44`; `documents/+page.svelte:65`; `items/new/+page.svelte:57`.

**Fix:** (B-011) derive chrome-mode from the **URL** — planning routes (incl. the `/trips/[slug]` Overview) always render planning/moss chrome even on an active trip; make `getActiveTab` return no active tab for non-tab paths. ⚠️ Do **not** redirect active `/trips/[slug]` → `/now`: #195'\''s home router intentionally serves the planning Overview there (and wrap-up/record after `end_date`), so a redirect would fight it. (B-012) make `backHref` mode-aware (honor `?from=trip` / derive from mode); Documents back → the trip, not `/trips`; Today as a root tab needs no back chevron. (B-023) `backHref` + delete/edit redirects prefer day, else phase, else Overview. Coordinate with the `from=trip` mechanism in #183.

**Acceptance:** an active-trip planning Overview shows planning chrome with no false "Now"; Trip-Mode drill-downs return to `/now` or `/today`; Documents back stays inside the trip; parking-idea round-trips return to the phase. `pnpm test:e2e`; visual-verify at 375px.'

mk "feat(money): plan-vs-budget comparison — Budget can't answer \"can we afford this?\"" "enhancement,afk" \
'**Source:** #116 deep-review, finding WP-B-021 (P2, fleet-verified). Charter scenario 8.

The Budget tab shows category limits vs money **spent** (expenses ≈ $0 before the trip), while the plan'\''s `cost_estimate_usd` — CONTEXT.md'\''s forward-looking "what we expect to pay" — aggregates nowhere above a single day (only per-day chips behind the `DayMetricToggle`). To compare plan to budget a member must open every day, toggle the metric, and sum chips by hand. The "Estimated Total" heading actually shows the budget envelope, compounding the confusion.

**Where:** `budget/+page.server.ts:13-56` (loads `trip_budgets` + `expenses` only — never items); `budget/+page.svelte:102-103` ("Estimated Total" label); `src/lib/itinerary/day-card.ts:40` (per-day Σ `cost_estimate_usd`).

**Fix:** add one field-limited items fetch to the budget loader (mirror the Overview query); sum `cost_estimate_usd` per expense category; render "planned $X / budget $Y / spent $Z" per category; rename the header to distinguish the budget envelope from the plan estimate.

**Acceptance:** Budget answers planned-vs-budget-vs-spent per category before any expenses exist; `pnpm check`; visual-verify at 375px.'

mk "fix(trip-mode): Today and Day-wrapped report \"0 of N done\" all day — done is a closeout verdict" "bug,afk" \
'**Source:** #116 deep-review, finding WP-B-013 (P3, code-verified 2026-06-12).

Today'\''s header pill and the 8pm "Day wrapped" Focus both count `status === '\''done'\''` (`now-state.ts:83`), but `status:'\''done'\''` is assigned at **Closeout** by design (CONTEXT.md Item Status / Closeout) — no card, detail, or sheet in Trip Mode offers a done action (`TodayItemCard` has only an edit pencil). So a normal day reads "0 of 6 done" all day and closes with "Day wrapped — 0 of 6 items completed": a demoralizing lie at the moment the day should feel complete.

**Where:** `src/lib/trip-mode/components/TodayTimeline.svelte:20-21,56-60`; `src/lib/trip-mode/now-state.ts:81-87`; `src/lib/trip-mode/components/NowDayWrapped.svelte:17-23`.

**Fix (DECISION — rephrase, don'\''t count):** stop counting `status` mid-trip; rephrase the Today pill and the Day-wrapped summary around elapsed / planned items ("6 things on today'\''s plan"). Closeout (and #195) remain the sole owner of the done verdict — **no new status-write path** in Trip Mode.

**Acceptance:** no Trip-Mode surface reports a done-count that only Closeout can move; the wrapped summary reads truthfully at day'\''s end; `pnpm check`.'

mk "feat(itinerary): light item-findability lens — days are the only index" "enhancement,afk" \
'**Source:** #116 deep-review, finding WP-B-022 (P3, code-verified 2026-06-12). Charter scenario 1 (first novice task).

From the trip home there is no surface listing items by type or title — days are the only index, so finding the flight means remembering its date and tapping that day (worst case on a 14-day trip: opening days one by one). The booking Smart List drops the flight once booked; Documents helps only if a file was attached.

**Where:** `src/routes/(app)/trips/[slug]/items/` has only `new/` + `[itemId]/` (no index); `trips/[slug]/+page.svelte:151-158` + `src/lib/itinerary/day-card.ts` (Overview cards expose counts/chips, never titles); `lists/booking` surfaces only planned-but-unbooked.

**Fix (DECISION — light lens, not full search):** a small type-filtered item lens — e.g. flights/lodging rows on the Overview stats card, or a lightweight items index reachable from the Itinerary sub-tabs. Not a full search index.

**Acceptance:** a member can find the flight/lodging from the trip home without opening days one by one; `pnpm check`; visual-verify at 375px.'

echo
echo "Created ${#created[@]} issues."
printf '%s\n' "${created[@]}" > docs/app-audit/v2/unit2-issues.txt
echo "URLs saved to docs/app-audit/v2/unit2-issues.txt"
