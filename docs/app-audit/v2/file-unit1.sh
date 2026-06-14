#!/usr/bin/env bash
# #116 Unit 1 — file the verified mechanical batch as issues. Idempotency: run once.
# ⚠️ SUPERSEDED 2026-06-13: the issues this produced (#181-194) were DUPLICATES of the
#    descriptive batch #167-180 (filed ~13 min earlier) and were ALL closed as dups.
#    Canonical batch = #167-180. DO NOT re-run. See docs/app-audit/progress.md dedup note.
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

mk "fix(trip-mode): isTripActive uses UTC instead of trip timezone" "bug,afk" \
'**Source:** #116 deep-review, finding WP-B-014 (P1, fleet-verified).

\`isTripActive()\` compares against UTC `new Date()` while every other date predicate in the app uses the trip timezone (`tripToday`/`tripTz`). On a non-UTC trip, Trip Mode flips back to Planning Mode mid-evening on the final day (and activates/deactivates at the wrong instant on the edges generally).

**Where:** `src/lib/trip-mode/activation.ts` (`isTripActive`) vs `src/lib/shell/trip-time.ts` (`tripToday`,`tripTz`).

**Fix:** compute "today" in the trip timezone inside `isTripActive`, mirroring `tripToday`. Add a unit test for the last-evening boundary in a non-UTC zone (prior art: `activation.test.ts`).

**Acceptance:** active window holds through the full trip-local final day; `pnpm check`; new vitest case green. NB: this also underpins the wrap-up-state trigger (#116 WP-A-001).'

mk "fix(shell): no mode pill between 900–1279px — active trips lock into Trip Mode" "bug,afk" \
'**Source:** #116 deep-review, finding WP-B-028 (P1, verified).

The mobile mode pill wrapper is `md-desktop:hidden` (`AppShell.svelte:75-80`); the SideRail pill block is gated `lg-desktop:flex` (`SideRail.svelte:67-79`). In the md-desktop window (≈900–1279px) **no ModePill renders anywhere**, so an active trip defaults to Trip Mode with no "Edit plan" affordance — the user is stranded in Trip Mode on a tablet/small laptop.

**Fix:** render the mode pill in the 72px md-desktop rail too (icon-only is fine), or drop the `lg-desktop` gate on the SideRail pill.

**Acceptance:** an active trip shows a working mode toggle at 768/1024/1280px; verify at each breakpoint with preview tools.'

mk "fix(trip-mode): quick-add ejects to Planning on save; from=trip is a dead param" "bug,afk" \
'**Source:** #116 deep-review, finding WP-B-008 (P1, 3 independent blind witnesses + verified).

Trip Mode'\''s central Add → "Add item to today" routes to `items/new?...&from=trip`, but `items/new` never reads `from` — on save the redirect and the back-chevron both land on the **Planning** day view, dumping a one-handed Trip-Mode user into the desk UI. Overturns v1 scenario-22'\''s "clean" verdict.

**Where:** `src/lib/trip-mode/components/AddSheet.svelte:19` (sets `from=trip`); `src/routes/(app)/trips/[slug]/items/new/+page.server.ts:264-276` (redirect ignores `from`); `items/new/+page.svelte:57` (backHref ignores `from`).

**Fix:** when `from=trip`, redirect on success to `/trips/[slug]/today` (or `/now`) and set the back-chevron there. Respect charter D3 (today-scope stays in Trip Mode).

**Acceptance:** add-item-to-today from Trip Mode returns to Today on save and on back; `pnpm test:e2e`.'

mk "fix(money): expenses page ignores ?action=add from the Trip Mode Add sheet" "bug,afk" \
'**Source:** #116 deep-review, finding WP-B-009 (P2, verified). Overturns v1 scenario-20 "clean".

`AddSheet` "Add expense" navigates to `expenses?action=add` (`AddSheet.svelte:24`) expecting the add-expense form to open — but `expenses/+page.svelte` only reacts to `?item=`, never `?action=add`. The sheet hands off to a param the page drops; the user lands on the expense list and must find the FAB themselves.

**Fix:** in `expenses/+page.svelte`, open the add-expense bottom sheet when `action=add` and strip the param (mirror the documents page'\''s `action=add` handling at `documents/+page.svelte:55-62`).

**Acceptance:** Trip Mode → Add → Add expense opens the form directly; refresh doesn'\''t reopen it.'

mk "feat(shell): add a root +error.svelte error boundary" "enhancement,afk" \
'**Source:** #116 audit, finding WP-A-002 (P1, verified — no `+error.svelte` anywhere, no `handleError` hook).

Every thrown error (mistyped slug, revoked token, 403s) renders SvelteKit'\''s unstyled default page with no branding and no way back.

**Fix:** add `src/routes/+error.svelte` — branded, with recovery actions ("Back to your trips" / "Check the link"). Read `page.status`/`page.error` for tailored copy on 403/404.

**Acceptance:** a bad trip slug and a 403 both render the branded boundary with a working exit; visual-verify at 375px.

**Note:** the archive pre-publish "visible in X days" screen (the other half of WP-A-002) is being handled in the wrap-up PRD, where the owner now chooses publish timing — not here.'

mk "fix(itinerary): moveItem desyncs status from day (invisible / double-rendered items)" "bug,afk" \
'**Source:** #116 deep-review, finding WP-B-007 (P2, verified).

The `moveItem` action updates `day` without reconciling `status` (and/or vice-versa), producing one-tap paths to items that render nowhere (planned with no day, or unplanned with a day) or render twice.

**Where:** `src/routes/(app)/trips/[slug]/items/[itemId]/+page.server.ts` (`moveItem`). Cross-check against the day-view drag semantics (`pullToPlan`/`pushToParking` in `days/[dayId]/+page.server.ts`), which are the correct reference.

**Fix:** make `moveItem` apply the same status↔day invariant as the drag paths (move to a day ⇒ planned+day; move to parking ⇒ unplanned, day cleared). Unit-test the transitions.

**Acceptance:** no move leaves an item in an unrenderable state; vitest covers each transition.'

mk "fix(portability): clone 500s on duplicate days, drops flights, flattens statuses" "bug,afk" \
'**Source:** #116 deep-review, finding WP-B-015 (P2, verified).

Clone is effectively unusable: the default path 500s when the source has duplicate-date days; the phases-off path creates day-less items; flights are dropped and idea/done statuses flatten to day-less "planned".

**Where:** `src/routes/(app)/trips/[slug]/clone/+page.server.ts` (`default`, `phases` actions).

**Fix:** dedupe/representative-day handling so duplicates don'\''t 500; preserve `flight` type and `end_date`; map statuses sanely (ideas→ideas, done→planned-in-new-trip per existing date-shift intent). Add an E2E or harness covering a clone of a multi-phase trip with a flight + an idea.

**Acceptance:** cloning the e2e seed trips succeeds and preserves types/statuses; no 500.'

mk "fix(portability): export omits money/goals/docs; import round-trip fails on real exports" "bug,afk" \
'**Source:** #116 deep-review, finding WP-B-016 (P2, verified).

"Download trip as JSON backup" omits the money ledger, goals, documents, votes, and members — so the "kept record" is partial — and real export files fail to re-import (malformed date handling). The post-trip Export/Import lifecycle is broken end-to-end.

**Where:** `src/lib/portability/export.ts` (`buildTripExport`), `import.ts` (`validateTripImport`), `src/routes/(app)/trips/[slug]/export/+server.ts`, `trips/import/+page.server.ts`.

**Fix:** decide the export contract (at minimum: items+phases+days+expenses+settlements+budgets+goals; documents likely by reference). Make export→import lossless for that contract; fix the date parsing that rejects valid exports. Extend `export.test.ts`/`import.test.ts`.

**Acceptance:** export a real trip → import → equivalent trip; round-trip test green.'

mk "fix(security): viewers and travelers can write items/phases — role rules never landed" "bug,hitl" \
'**Source:** #116 deep-review, findings WP-B-005 + WP-B-006 (P2, verified — security-adjacent, HITL).

PocketBase `items`/`phases` CRUD rules use `MEMBER_VIA_TRIP` with **no role term** (migrations 0008/0014), and `items/new`'\''s only gate is the traveler-suggestion branch — so a **viewer**'\''s direct create/update/delete succeeds end-to-end, and the suggestion review gate covers only item *creation*, not edit/move/delete or phase mutations. `RULES.md`'\''s intended matrix (items.update/delete: viewer/traveler "—") never landed. Contrast: `documents.pb.js:36` and `expenses.pb.js:30` correctly deny viewers; item-detail tasks gate via an `isViewer` helper.

**Fix (needs human review of the matrix):** tighten `items`/`phases` collection rules to encode role (owner/co_owner write; traveler via suggestion; viewer read-only), and extend the suggestion gate to edit/move/delete + phase actions. Append-only migration. Update `test-rules.mjs` to assert the matrix (expect the count to grow).

**Acceptance:** `pnpm test:rules` covers viewer/traveler write denials and passes; no UI regression for owners.'

mk "fix(itinerary): Settings renders the full owner console (incl. danger zone) to non-owners" "bug,afk" \
'**Source:** #116 audit, finding WP-A-023 (P2, verified — server enforcement is correct; UI gating is missing).

Viewers/travelers see the complete editable Settings form including the danger zone; only on submit does the server 403. Capability should be visible before effort.

**Where:** `src/routes/(app)/trips/[slug]/settings/+page.svelte` (renders unconditionally) — guard exists server-side only (`settings/+page.server.ts:38-41`).

**Fix:** render read-only (or hide danger zone + disable inputs) when `membership.role` isn'\''t owner/co_owner.

**Acceptance:** a traveler sees a read-only Settings; owner unaffected.'

mk "fix(collaboration): Edit & Approve discards the traveler's proposed day/phase/cost" "bug,afk" \
'**Source:** #116 deep-review, finding WP-B-003 (P2, verified).

The owner'\''s Edit & Approve path opens the item form with Day reset to "Unscheduled" and Phase "None" even when the traveler proposed them; cost estimate and subtype are dropped too. Saving overrides the original payload with the blanked values, so the approved item loses its scheduling intent (and lands phase-less — see WP-B-002).

**Where:** `src/routes/(app)/trips/[slug]/items/new/+page.svelte:41-54` (initialData omits day/phase/subtype/end_date/cost/assignee, though the server already passes them at `+page.server.ts:44-66`); `inbox/+page.svelte:114-119` (Edit&Approve link carries no `?day=`).

**Fix:** prefill day/phase/subtype/end_date/cost_estimate_usd/assignee from the suggestion payload; add a "proposed by X for [day]" context line.

**Acceptance:** editing-then-approving a dated suggestion keeps its day/phase/cost.'

mk "refactor(shell): nav paper-cuts — delete dead TripTabs, fix transition set + items/new back" "refactor,afk" \
'**Source:** #116 audit, findings WP-A-010, WP-A-022, WP-A-021 (P3, verified). Bundle of three small nav fixes.

1. **WP-A-010** — `src/lib/shell/components/TripTabs.svelte` is dead (zero imports, superseded by `SubTabs`). Delete it.
2. **WP-A-022** — `(app)/+layout.svelte` `bottomNavRoutes` set omits the Trip Mode tab routes (now/today/documents), so those tab hops animate as drill-down/up instead of lateral. Add them.
3. **WP-A-021** — `items/new` back-chevron always points to the trip home even when entered from a day; derive `backHref` from `?day=` (mirror the submit redirect). (Coordinate with the `from=trip` fix in the WP-B-008 issue.)

**Acceptance:** `pnpm check`; TripTabs gone with no broken imports; tab transitions lateral in Trip Mode; items/new back returns to the originating day.'

mk "feat(shell): auth/login UX — preserve deep-link destination, add resend code, recover skipped claims" "enhancement,afk" \
'**Source:** #116 deep-review, findings WP-B-029, WP-B-031, WP-B-030 (verified this session). Three small auth-flow gaps.

1. **WP-B-029** — the `(app)` guard does `redirect(303,'\''/login'\'')` with no return-URL; after OTP you always land on `/trips`, never the deep link you opened. Preserve `?redirectTo=` through login (and the `/claim` hop).
2. **WP-B-031** — `login/+page.svelte` has no "Resend code" though `join/[token]` does (`:222`). Add resend to the login OTP step.
3. **WP-B-030** — `/claim` `?/skip` just `redirect(303,'\''/trips'\'')`; a skipped claim is only re-reachable by logging out/in. Give a way back (e.g. surface pending claims on the trips list, or a "you have N pending invites" affordance).

**Acceptance:** opening a deep link while logged-out returns there post-OTP; login has a working resend; a skipped claim is recoverable without re-login.'

mk "feat(shell): reach /account from inside a trip; make notification bell placement consistent" "enhancement,afk" \
'**Source:** #116 audit, findings WP-A-011 + WP-A-012 (P2/P3, verified).

1. **WP-A-011** — `/account` (name + avatar) is reachable only from the trips-list avatar chip; from inside a trip (incl. the Members page where you see your own row) there'\''s no path to edit your own profile. Link the self-row on Members → `/account` (and/or an Account entry under More). NB: per-trip `display_name` set at claim/join has no edit surface at all — note for a follow-up.
2. **WP-A-012** — `NotificationBell` renders on only 6 surfaces (absent from Now, Members, Documents, days, items…). Put it in one consistent chrome slot across trip pages (or move it to a fixed location).

**Acceptance:** a member can reach `/account` from within a trip; the bell appears consistently (or has one deliberate home).'

echo
echo "Created ${#created[@]} issues."
printf '%s\n' "${created[@]}" > docs/app-audit/v2/unit1-issues.txt
echo "URLs saved to docs/app-audit/v2/unit1-issues.txt"
