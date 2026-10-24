# PB invariant hardening (#411) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use svw:executing-plans (small plans) or svw:subagent-driven-development (large plans) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every invariant the web UI relies on holds for any client with a member's PB token (MCP writes in v3.2, scripts, devtools), not only for SvelteKit form actions.

**Architecture:** Move each invariant from SvelteKit actions into PB hooks (`backend/pb_hooks/*.pb.js`), so PB enforces it on every request; tighten two rules; hide three secret fields per caller with `onRecordEnrich`. Hooks run in isolated goja sandboxes: every helper is inlined into the callback body. Each task is proven by a backend harness against a fresh PB (`scripts/backend-harnesses.sh`), not by e2e.

**Tech Stack:** PocketBase 0.27.2 JSVM hooks, append-only JS migrations, Node harnesses (`backend/test-*.mjs`), Vitest for the pure tiling core already there, Playwright only for regressions in existing flows.

**Spec:** [toxroxmysox/Waypoint#411](https://github.com/toxroxmysox/Waypoint/issues/411) (issue body: the gap table + Direction). Context: `docs/plans/2026-10-10-mcp-reads/grill.md` ("v3.2 = writes (+ #411 hardening, #413 decision)").

**Intent sources:** `docs/adr/0021-*` (phase tiling, boundary model), `docs/adr/0024-agent-access-posture.md` (agent acts as the user; PB rules enforce role), `docs/adr/0002-*` (lodging `end_date`), `backend/RULES.md` (rule matrix), glossary `CONTEXT.md` (Role, Phase, Suggestion, Placeholder Member).

**Run:** `bash scripts/backend-harnesses.sh` (every harness, fresh PB each) and `pnpm test:e2e:clean` (no regressions in the web flows). Use `E2E_SLOT=N` per worktree. Bound every run (cerebrum standing rule; macOS: `perl -e 'alarm shift; exec @ARGV' 900 <cmd>`).

## Global Constraints

- Branch: ticket branch `refactor/411-pb-hardening` off `origin/release/3.2`, merged back into `release/3.2`. Deploy only on Scott's word.
- Migrations append only, next number `0079` (main shipped `0078`; `0076`/`0077` are v3.1's).
- Hook sandbox: no file-scope helpers; handler-first signature; `getString` for date/relation truthiness (`reference_pb_jsvm_datefield_truthy`); explicit `'' +` string compares on relation values.
- Admin-context saves (`e.app.save` inside other hooks: import, closeout, suggestion approval, trip date hooks) must keep working: request hooks (`onRecord*Request`) only fire on API requests, so model-level invariants that must also hold for admin saves go in `onRecordCreate`/`onRecordUpdate`, and ones that are request-only (role, caller identity) stay in `*Request`.
- Error copy is user-facing and matches the SvelteKit action's existing message where one exists (quoted per task), so the UI's in-context error shows the same text when the hook rejects.
- No change to who may do what in the web UI (owner/co_owner/traveler/viewer matrices in `backend/RULES.md` stay as documented, except the two rows this plan names).
- Real or dogfood data (:8090, prod) is never touched; nothing here migrates data, only rules and hooks.
- Removed/renamed SvelteKit code paths → `grep -rn` tests for their error strings in the same commit.

## Review Focus

1. **Admin-context saves tripping new model hooks.** Import (`trips/import`), clone, closeout and suggestion approval create items/phases with `e.app.save` or the superuser client. Expect: all keep working; Task 2's and Task 4's harness each run an import + clone round trip, and `pnpm test:e2e:clean` stays green.
2. **Retile loops.** The tiling hook updates sibling phases, which fire the update hook again. Expect: sibling writes use model-level saves that skip the request hook, retile is idempotent (no write when end/order already match), no recursion. (Task 4 test: create 3 phases via REST, every phase's end equals the next start, `updated` of an untouched phase unchanged on a no-op edit.)
3. **Empty-ish relation values.** `day: ""`, `phase: ""`, `paid_by` missing, `split_data` `{}` or `null`, checklists with neither phase nor item. Expect: treated as absent, not as foreign ids. (Tasks 2, 5 tests.)
4. **Trip date edits.** Shrinking a trip so the last phase's start is past the new end; moving the trip start later than phase 2's start. Expect: the trip hook clamps (phases starting on/after the new end are merged into their predecessor, as the phases page does on delete) and the first phase is pinned to the new start; no gaps, no overlaps. (Task 4 tests.)
5. **Viewer reading secrets through expand.** `trips?expand=...` or `trip_members` expanded from another collection. Expect: `onRecordEnrich` hides the field on expanded records too. (Task 3 test via `items?expand=trip`.)

---

### Task 1: `days` and `notifications` update gates

**Files:**

- Create: `backend/pb_hooks/days.pb.js`
- Modify: `backend/pb_hooks/notifications.pb.js`, `backend/test-rules.mjs` (expected cells), `backend/RULES.md`
- Test: `backend/test-rules.mjs`

**Interfaces:**

- Produces: `days` update by a viewer → 403 `Viewers can't edit the plan.`; travelers may change only `notes`; owner/co_owner may change `notes` and `phases` (clone sets `phases` through the user client, `clone/+page.server.ts:150`); `date`/`trip` by anyone, or `phases` by a traveler → 400 `Only a day's notes can be edited.` The phases hook's admin saves are unaffected. `notifications` update by the recipient → only `read_at` may change; any other field → 400 `Only read state can change.`

- [ ] **Step 1:** In `test-rules.mjs`, flip the `days.update` expectation for `viewer` to deny, add cells "traveler updates day `phases`" → deny 400, "owner updates day `phases`" → allow, "owner updates day `date`" → deny 400, add a cell "recipient updates notification `body`" → deny 400, "recipient sets `read_at`" → allow.
- [ ] **Step 2:** `bash scripts/backend-harnesses.sh rules` → FAIL on exactly those cells.
- [ ] **Step 3:** `onRecordUpdateRequest` in `days.pb.js` (caller's membership inlined, as in `items.pb.js`; compare `original()` vs new for every field but `notes`/`updated`). Same field-diff pattern in `notifications.pb.js`. No migration: the rules stay; the hooks narrow them.
- [ ] **Step 4:** Harness → PASS. `pnpm test:e2e:clean -- day notes notification` green (day notes save, bell mark-read).
- [ ] **Step 5:** RULES.md rows for `days`, `notifications`. Commit `refactor(#411): days notes-only + viewer block; notifications read-only but read_at`.

### Task 2: Item validity in `items.pb.js`

**Files:**

- Modify: `backend/pb_hooks/items.pb.js` (new model-level `onRecordCreate` + `onRecordUpdate` validation block, registered before the existing exclusivity hooks)
- Create: `backend/test-items.mjs`; add `items` to `ALL` in `scripts/backend-harnesses.sh`
- Test: `backend/test-items.mjs`

**Interfaces:**

- Produces, enforced on every save (API and admin), messages verbatim from `items/new/+page.server.ts` where they exist:
  - `day` set → the day's `trip` equals the item's `trip`, else 400 `That day isn't on this trip.`
  - `phase` set → same trip, else 400 `That phase isn't on this trip.`
  - `day` empty and the trip has ≥1 phase → `phase` required, else 400 `Pick a phase for an unscheduled item, or assign it to a day.`
  - `type` `meal`/`note` with `booked` true → 400 `<type> items cannot be marked as booked.`
  - `end_date` set → requires `day`; must be after the day's date and ≤ trip `end_date`, else 400 `End date is after the trip ends.` (after trip end) / `End date must be after the start day.` (not after the day). Flights keep their `end_date` (#498 red-eye) under the same bounds.
  - `parent_item` set → same trip, else 400 `That item isn't on this trip.`
  - `status`: no `day` with `status = "planned"` → stored as `unplanned` (normalised, not rejected: closeout and suggestion approval rely on PB defaults today; confirm by grep before choosing reject).

- [ ] **Step 1: Write `test-items.mjs`** (owner token via `/api/dev/rules-fixture`, plus a second trip from the same owner): one assertion per bullet above via REST create and REST update; plus "import a TripExport v1 fixture through `/trips/import`'s server path" is out of reach from a harness, so instead: an item created by the superuser client with valid data passes, and with a foreign day fails (proves the model hook covers admin saves).
- [ ] **Step 2:** `bash scripts/backend-harnesses.sh items` → FAIL.
- [ ] **Step 3:** Implement. Keep the SvelteKit checks (they give field-level errors before a round trip); the hook is the backstop.
- [ ] **Step 4:** Harness PASS; `bash scripts/backend-harnesses.sh` all green; `pnpm test:e2e:clean` green (import, clone, closeout, suggestion approve specs are the regression net).
- [ ] **Step 5:** Commit `refactor(#411): item validity enforced in items.pb.js`.

### Task 3: Secrets hidden per caller

**Files:**

- Create: `backend/pb_hooks/secrets.pb.js`
- Create: `backend/test-secrets.mjs`; add `secrets` to `ALL`
- Modify: `backend/RULES.md`

**Interfaces:**

- Produces (`onRecordEnrich`, skipped for superusers and for requests with no auth only where the record is already denied):
  - `trip_members.soft_token`: hidden from every non-superuser (only the poll hooks use it, in admin context).
  - `join_tokens.token`: hidden from viewers (non-viewers manage join links, #152).
  - `trips.public_share_token`: hidden from viewers.
  - Caller's role resolved from `trip_members` (`trip = {:t} && user = {:u} && removed_at = ""`); no membership → hide.

- [ ] **Step 1: Write `test-secrets.mjs`:** for each field, owner/co_owner/traveler/viewer list + view + `items?expand=trip` (Review Focus 5) and assert presence/absence per the table; superuser sees all three.
- [ ] **Step 2:** FAIL. **Step 3:** Implement with `e.record.hide(field)` then `e.next()`. **Step 4:** PASS; `pnpm test:e2e:clean -- poll members archive closeout` green (poll re-entry, join links, share link). **Step 5:** Commit `refactor(#411): hide soft_token, join token and share token from callers who don't need them`.

### Task 4: Phase tiling as a PB invariant

**Files:**

- Modify: `backend/pb_hooks/phases.pb.js` (after the role hooks, before the rebucket hooks), `backend/pb_hooks/trips.pb.js` (date-change hook at ~line 486)
- Modify: `src/routes/(app)/trips/[slug]/phases/+page.server.ts`, `src/routes/(app)/trips/[slug]/phases/[phaseId]/+page.server.ts`, `src/routes/(app)/trips/import/+page.server.ts` (drop `applyRetile` calls once the hook does it), `src/lib/itinerary/phase-tiling.server.ts` (delete if unused)
- Create: `backend/test-tiling.mjs`; add `tiling` to `ALL`
- Test: `backend/test-tiling.mjs`; existing `src/lib/itinerary/phase-tiling.test.ts` stays the spec for the algorithm

**Interfaces:**

- Consumes: the algorithm in `src/lib/itinerary/phase-tiling.ts` (`retilePhases`, `validateNewPhaseStart`, `validateMovePhaseStart`), ported inline into the hooks with the same messages.
- Produces: after any phase create, `start_date` update or delete via the API, and after any trip `start_date`/`end_date` change, the trip's phases satisfy: sorted by start, `end_date` = next phase's start, last ends at trip end, first starts at trip start, `order` = position. Invalid starts → 400 with `validateNewPhaseStart` / `validateMovePhaseStart`'s exact message. Client-sent `end_date` / `order` are ignored (overwritten by the retile).

- [ ] **Step 1: Write `test-tiling.mjs`:** create 3 phases via REST with junk `end_date`/`order` → tiled; create on an existing boundary → 400 `A phase already starts on that day.`; move phase 2 past phase 3 → 400 `This phase must start between …`; move phase 1 → 400 `The first phase must start when the trip begins.`; delete the middle phase → predecessor extends; delete phase 1 → the new first starts at trip start; shrink trip end before phase 3's start → phase 3 merged per Review Focus 4; move trip start later → first phase pinned; no-op edit leaves siblings' `updated` unchanged (Review Focus 2); `days.phases` reflect the new ranges (rebucket still fires).
- [ ] **Step 2:** FAIL. **Step 3:** Implement: validation in `onRecordCreateRequest`/`onRecordUpdateRequest`; the retile in `onRecordAfterCreateSuccess`/`AfterUpdateSuccess`/`AfterDeleteSuccess` and in the trip date hook, writing siblings with `e.app.save` (no request hooks fire, so no recursion) only when end/order differ. Then remove the SvelteKit `applyRetile` calls and run `grep -rn applyRetile src tests`.
- [ ] **Step 4:** Harness PASS; Vitest `phase-tiling` unchanged and green; `pnpm test:e2e:clean -- phase` green.
- [ ] **Step 5:** Commit `refactor(#411): phase tiling enforced by phases + trips hooks (ADR-0021)`.

### Task 5: Cross-trip references

**Files:**

- Modify: `backend/pb_hooks/expenses.pb.js`, `backend/pb_hooks/checklists.pb.js`, `backend/pb_hooks/votes.pb.js`, `backend/pb_hooks/settlements.pb.js`
- Modify: `backend/test-money.mjs`, `backend/test-rules.mjs`

**Interfaces:**

- Produces (create + update, model-level so admin saves are checked too): `expenses.paid_by`, every member id in `split_data` (shape per `split_mode`, see the existing validator), `expenses.linked_item`; `settlements.from_member`/`to_member`; `checklists.phase` / `checklists.item`; `votes.item` — each must belong to the record's `trip`, else 400 `That <member|item|phase> isn't on this trip.`

- [ ] **Step 1:** Harness cells: each field pointed at a second trip's record → 400; same-trip → 201. **Step 2:** FAIL. **Step 3:** Implement (one inlined lookup per id). **Step 4:** `bash scripts/backend-harnesses.sh money rules` PASS. **Step 5:** Commit `refactor(#411): cross-trip references rejected in expenses, settlements, checklists, votes`.

### Task 6: Lossless suggestion → item conversion

**Files:**

- Modify: `backend/pb_hooks/suggestions.pb.js` (both item-building blocks: auto-approve ~line 97, approve ~line 355)
- Modify: `backend/test-suggestions.mjs`

**Interfaces:**

- Produces: an approved or auto-approved item carries the payload's `end_date`, `start_tz`, `end_tz`, `location_coords`, `google_place_id`, `requires_booking`, `flight_number`, `parent_item` (same-trip check as `day`/`phase` from #496). Task 2's model hook then validates the result, so an out-of-bounds `end_date` in a suggestion fails at approval with Task 2's message.

- [ ] **Step 1:** In `test-suggestions.mjs`, a traveler suggests a 3-night lodging with coords, place id, tz and `requires_booking`; owner approves; assert every field on the item. Same for the auto-approve trip setting. **Step 2:** FAIL. **Step 3:** Implement (one shared field list, duplicated into both blocks: sandbox). **Step 4:** PASS + `pnpm test:e2e:clean -- contribution` green. **Step 5:** Commit `fix(#411): suggestion approval keeps span, timezone, place and booking fields`.

---

## Execution notes

- Order: 1 → 2 → 3 → 4 → 5 → 6; 2 before 4 and 6 (both depend on the item hook existing), otherwise independent.
- Close #411 on merge into `release/3.2`, not on deploy.
- If a hook can't distinguish an admin save that must be allowed from an API save that must be refused, stop and ask: that's a design question, not an implementation detail.
