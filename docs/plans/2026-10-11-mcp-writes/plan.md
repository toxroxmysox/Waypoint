# MCP Writes (v3.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use svw:executing-plans (small plans) or svw:subagent-driven-development (large plans) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a member's connected Claude change anything they could change in the app (except a short can't-list) through propose → confirm → commit, with private audit and revert. Also land the v3.1 hardening minors (#512) and the timestamps fix (#515).

**Architecture:**

- Four new MCP tools (`describe`, `propose_changes`, `commit_changes`, `revert_change`) sit on a write layer in `src/lib/server/mcp/writes/`. They compile generic `create`/`update` ops against a collection registry (the can't-list made concrete), store proposals in memory for 15 min, and commit them as one PocketBase batch with the user's own PB token. PB rules and #411 hooks remain the only permission gate.
- Each commit writes a private `ai_changes` row (the glossary's **AI Change**). Revert works from chat and from a collapsible list in account settings.
- Trips gain `ai_write` alongside `ai_access`. A `MCP_WRITES` env flag removes the write tools server-wide.

**Tech Stack:** SvelteKit 2 / Svelte 5, PocketBase 0.27 (JSVM hooks, batch API), `@modelcontextprotocol/sdk` (stateless Streamable HTTP), MCP Apps card view (`card-html.ts`), Vitest, Playwright.

**Spec:** `docs/plans/2026-10-11-mcp-writes/grill.md`

**Intent sources:** `docs/adr/0025-ai-writes-everything-but-a-cant-list.md`, `docs/adr/0024-agent-access-posture.md`, `docs/adr/0021-phases-tile-the-trip.md`, `docs/adr/0016-codes-as-documents.md`, `docs/adr/0002-multi-day-item-storage-asymmetry.md`; glossary `CONTEXT.md` (AI Access, AI Change, Connection, Suggestion, Auto-approve); PB rules doc `backend/RULES.md`.

**Run:**

- `pnpm test:e2e:clean -- mcp-` runs every MCP spec against a disposable PB, calling tools as the seeded owner, traveler, viewer and outsider (`tests/e2e/mcp-seed.ts`).
- `pnpm verify:visual '/account'` and `pnpm verify:visual '/trips/{slug}/settings'` produce the 375px screenshots.
- On-device card check (Confirm button, calendar) happens on Scott's iPhone after deploy. Deploying is Scott's call.

## Global Constraints

- **Migrations:** append-only, next number is `0079`. Hooks run sandboxed: inline every helper inside the callback.
- **Settings use positive logic and default ON:** `ai_write` defaults `true` and is backfilled `TRUE` on existing trips, the same pattern as `0076_trips_ai_access.js`. `ai_write` and `ai_access` are protected trip fields: owner/co_owner only, enforced in the `trips.pb.js` gate.
- **Formats:**
  - AI ↔ server use ISO `YYYY-MM-DD` and 24h `HH:MM`, trip-local.
  - Anything shown to the user (cards, account list) uses `formatClock` style `9:40 am`.
  - Stored times keep the naive-local fake-`Z` format via `combineDateTime` (`src/lib/shell/trip-time.ts`).
- **Scrubbing:** everything outbound to the model passes `scrub()` (`present.ts`), so no emails or file URLs reach Claude, previews included.
- **Can't-list, verbatim from the spec:**
  - members and invitations
  - AI settings (`ai_access`, `ai_write`)
  - emails, tokens (soft, join, share)
  - `created_by`/owner fields (readable as names, never writable)
  - deleting anything not AI-created
  - file/photo upload
- **No attribution:** no "via Claude" marker anywhere visible to other members. Notifications fire as the hooks already fire them.
- **Limits:** proposal TTL 15 minutes, at most 50 ops per proposal, Recent AI changes window 30 days.
- **Copy (exact):** the outcome lines are `Saved`, `Sent to the owners as a suggestion` and `Added as an idea`.
- **E2E:**
  - Specs read `BASE` from `tests/e2e/e2e-env.ts`.
  - Shared-data specs use `test.describe.configure({ mode: 'serial' })`.
  - Use `goto` with `waitUntil: 'networkidle'` before clicking client controls.
  - Each worktree uses its own `E2E_SLOT`.
- **UI:** any UI change needs a 375px screenshot (`pnpm verify:visual`).

## Review Focus

1. **A proposal whose ops target records in another trip than its `trip` argument** must be refused at propose time: every op resolves to the proposal's trip. Pinned in Task 6.
2. **A double commit** (the user taps Confirm _and_ says yes) must commit once. The second call returns `Already saved` and writes nothing. Pinned in Task 9.
3. **A commit by someone other than the proposer** (a different user or connection holding a leaked `proposal_id`) must be refused. Pinned in Task 9.
4. **AI access or AI changes turned off between propose and commit**, or `MCP_WRITES=off`, must refuse the commit. Pinned in Task 9.
5. **Revert of a record someone has since deleted or edited** must report what it skipped without throwing, and still mark the change reverted for what it restored. Pinned in Task 10.

---

### Task 1: mcp_tokens gets `updated` (#515)

**Files:**

- Create: `backend/pb_migrations/0079_mcp_tokens_updated.js`
- Test: `backend/test-timestamps.mjs` (existing schema guard; no edit expected)

**Interfaces:** Produces nothing consumed later.

- [ ] **Step 1:** Run `E2E_SLOT=<n> bash scripts/backend-harnesses.sh timestamps`. Expected: FAIL `["mcp_tokens.updated"]`.
- [ ] **Step 2:** Write the migration to add `AutodateField({ name: 'updated', onCreate: true, onUpdate: true })` to `mcp_tokens`. The down migration removes it.
- [ ] **Step 3:** Re-run the harness. Expected: `✓ timestamps`.
- [ ] **Step 4:** Commit `fix(#515): mcp_tokens gets an updated autodate`.

### Task 2: Schema for writes (ai_write, ai_changes, batch)

**Files:**

- Create: `backend/pb_migrations/0080_trips_ai_write.js`, `backend/pb_migrations/0081_ai_changes.js`, `backend/pb_migrations/0082_enable_batch.js`
- Modify: `backend/pb_hooks/trips.pb.js` (protected-field list ~line 37; create-default for `ai_write` next to `ai_access`), `backend/RULES.md`
- Test: `backend/test-rules.mjs`

**Interfaces:**

- Produces: `trips.ai_write: boolean`, default true. Collection `ai_changes` has these fields:
  - `user`: relation users, required
  - `connection`: text, the mcp_connections id (text so disconnecting keeps history)
  - `trip`: relation trips, required, cascadeDelete
  - `quote`: text, required
  - `changes`: json (`CommittedChange[]`, see Task 6)
  - `reverted_at`: date
  - `created` / `updated` autodate
- `ai_changes` rules: list/view `user = @request.auth.id`; create/update/delete `null` (superuser only).
- PB batch is enabled with `maxRequests: 50`.

- [ ] **Step 1:** Add failing harness cells to `test-rules.mjs`:
  - owner can set `ai_write` false; traveler and viewer are denied `ai_write` changes
  - a new trip created without `ai_write` reads back `true`
  - `ai_changes` list returns only the caller's rows (seed one row per user via superuser); a member can't create, update or delete an `ai_changes` row
- [ ] **Step 2:** Run `bash scripts/backend-harnesses.sh rules`. Expected: the new cells FAIL.
- [ ] **Step 3:** Write the three migrations and the `trips.pb.js` changes. Enable batch via `app.settings().batch.enabled = true; ...maxRequests = 50; app.save(settings)`.
- [ ] **Step 4:** Run `bash scripts/backend-harnesses.sh`. Expected: every harness ✓, timestamps included.
- [ ] **Step 5:** Add an `ai_write` row and an `ai_changes` row to `RULES.md`. Commit `feat(#503): ai_write trip setting, ai_changes audit, PB batch`.

### Task 3: Trip settings, two AI switches

**Files:**

- Modify: `src/routes/(app)/trips/[slug]/settings/+page.svelte`, `src/routes/(app)/trips/[slug]/settings/+page.server.ts`, `src/lib/types.ts` (`Trip.ai_write?: boolean`)
- Test: `tests/e2e/ai-access-setting.spec.ts`

**Interfaces:** Consumes `trips.ai_write` (Task 2).

- [ ] **Step 1:** Write the failing e2e `owner turns AI changes off while reading stays on`. The owner sees two toggles labelled `AI can read this trip` and `AI can make changes`. Turning changes off persists after reload with read still on. Turning read off disables (greys) the changes toggle and saves `ai_write` unchanged. A traveler sees neither toggle as editable.
- [ ] **Step 2:** Run `pnpm test:e2e:clean -- ai-access-setting`. Expected: FAIL.
- [ ] **Step 3:** Implement the toggles using the existing `ai_access` form action pattern on the same page, a positive-logic checkbox per field.
- [ ] **Step 4:** Re-run the test (expected PASS). Run `pnpm check`, then `pnpm verify:visual '/trips/{slug}/settings' --widths 375`.
- [ ] **Step 5:** Run `grep -rn 'AI access' tests/` and update any assertion whose label changed. Commit `feat(#503): trip settings split AI read / AI changes`.

### Task 4: Invariant audit + write registry

Before a collection becomes AI-writable, every rule the app enforces for it must live in PB (rules/hooks) or in this registry's normalisation. #411 covered items, phases, trips, expenses, settlements, checklists, votes and suggestions. This task covers the rest and classifies everything.

**Files:**

- Create: `docs/plans/2026-10-11-mcp-writes/invariant-audit.md`, `src/lib/server/mcp/writes/registry.ts`, `src/lib/server/mcp/writes/registry.test.ts`, `tests/e2e/mcp-writes-registry.spec.ts`
- Modify: any `backend/pb_hooks/*.pb.js` where the audit finds a SvelteKit-only rule, plus its harness

**Interfaces:**

- Produces, in `registry.ts`:

```ts
export interface WritableSpec {
	label: string; // plain words for describe, e.g. 'trip items (plans and ideas)'
	tripPath: string; // relation path to the trip id: 'trip' | 'item.trip' | 'checklist.trip' | 'scenario.trip' | 'id' (trips)
	stamp?: Record<string, 'user' | 'member'>; // author fields the server fills, never the AI
	dayField?: string; // relation field a friendly `date` resolves into (e.g. 'day')
	timeFields?: string[]; // fields that accept 'HH:MM' (e.g. start_time, end_time)
	viaSuggestion?: true; // items: traveler creates route through /api/suggestions/create
}
export const WRITABLE: Record<string, WritableSpec>;
export const BLOCKED_COLLECTIONS: readonly string[]; // trip_members, pending_invites, join_tokens, users, mcp_connections, mcp_tokens, ai_changes, notifications, vault_entries, plus any the audit adds
export const BLOCKED_FIELDS: readonly string[]; // email, placeholder_email, soft_token, token, public_share_token, ai_access, ai_write, created_by, uploaded_by, invited_by, author, hash, every file field (photo, file, avatar, cover_image)
export function blockedReason(collection: string, field?: string): string | null; // plain-words refusal or null
```

- [ ] **Step 1:** Write the audit. For each non-blocked collection, list the validations in SvelteKit form actions (`src/routes/**/+page.server.ts`, `src/routes/**/+server.ts`) that PB doesn't enforce. Do scenarios, scenario_points, scenario_votes, availability, decisions, trip_budgets, money_units, tasks, trip_goals, goal_votes, memories, documents, days and closeout first. Give each finding a verdict: **move to hook** (with a harness cell), **normalise in registry**, or **block the collection** and file an issue. Days count as writable only for their notes; dates come from trip dates.
- [ ] **Step 2:** For each "move to hook" finding, write the failing harness cell, implement the hook (helpers inlined), and run that harness to PASS. If the audit runs past ~6 hook moves, stop and surface to Scott before continuing (scope check).
- [ ] **Step 3:** Write the failing `registry.test.ts`:
  - `blockedReason('trip_members')` is non-null
  - `blockedReason('items', 'created_by')` is non-null
  - `blockedReason('trips', 'ai_write')` is non-null
  - `blockedReason('memories', 'photo')` is non-null
  - `blockedReason('items', 'title')` is null
  - no key is in both `WRITABLE` and `BLOCKED_COLLECTIONS`
- [ ] **Step 4:** Write the failing `mcp-writes-registry.spec.ts` "every PB collection is classified". It lists the collections via a superuser client (`adminPb` pattern) and expects every non-system name to be in `WRITABLE` or `BLOCKED_COLLECTIONS`, so a new collection forces a decision.
- [ ] **Step 5:** Implement `registry.ts` from the audit. Run `pnpm vitest run registry` and `pnpm test:e2e:clean -- mcp-writes-registry`. Expected: PASS.
- [ ] **Step 6:** Commit `feat(#503): invariant audit + write registry`.

### Task 5: Write gating, describe tool, server registration

**Files:**

- Create: `src/lib/server/mcp/writes/gate.ts`, `src/lib/server/mcp/tools/describe.ts`
- Modify: `src/lib/server/mcp/tools/get-item.ts` (story 35: an `Added by <name>` line from `created_by`, name only), `src/lib/server/mcp/context.ts` (`TRIP_FIELDS` + `ai_write`; `TripRef.canWrite`), `src/lib/server/mcp/tools/types.ts` (`ToolDef.write?: true`), `src/lib/server/mcp/tools/index.ts` (`WRITE_TOOLS`), `src/lib/server/mcp/server.ts` (register write tools only when enabled; `annotations.readOnlyHint` false for them; `INSTRUCTIONS` addition), `.env.example` (`MCP_WRITES=on`)
- Test: `src/lib/server/mcp/writes/gate.test.ts`, `tests/e2e/mcp-writes.spec.ts` (new, serial)

**Interfaces:**

- Produces:
  - `writesEnabled(env: Record<string, string | undefined>): boolean` returns false only for `MCP_WRITES === 'off'`.
  - `TripRef.canWrite: boolean`, which is `open && trip.ai_write !== false && role !== 'viewer'`.
  - `assertCanWrite(ref: TripRef): void` throws the plain reason: `AI changes are turned off for this trip by its owner.`, `Viewers can't change this trip.`, or the existing AI-off notice.
  - `WRITE_TOOLS: ToolDef[]`.
- `describe({ trip?: string })` returns structured content:
  - `collections`: the label plus writable fields for each `WRITABLE` entry
  - with `trip` given: `members` (display name → member id), `phases` (name, id, start, end), `days` (date → id) for that trip, scrubbed

`INSTRUCTIONS` gains, verbatim:

> To change something, call propose_changes with the user's own words as `quote`, show the preview, and wait: call commit_changes only after the user says yes in a later message (or taps Confirm). Record only what the user stated; never infer a booking, payment, vote or choice. Talk to Waypoint in ISO dates and 24-hour times; show times to the user as 9:40 am. "Undo that" → revert_change.

- [ ] **Step 1:** Write the failing `gate.test.ts`:
  - `writesEnabled({})` is true
  - `writesEnabled({ MCP_WRITES: 'off' })` is false
  - `assertCanWrite` throws each reason above for a viewer, `ai_write: false` and `ai_access: false`
- [ ] **Step 2:** Write the failing e2e cases in `mcp-writes.spec.ts`:
  - `get_item` on an owner-created Porto item includes `Added by <owner display name>` and no email
  - `tools/list` includes `describe` and `propose_changes`
  - `describe` with the Porto trip returns its members by name with ids and no emails (assert none of `PLANTED_EMAILS` appear)
- [ ] **Step 3:** Run both. Expected: FAIL.
- [ ] **Step 4:** Implement. Store the env flag in `$env/dynamic/private`.
- [ ] **Step 5:** Run both again (PASS), then `pnpm check`.
- [ ] **Step 6:** Commit `feat(#503): write gate, describe tool`.

### Task 6: Ops → planned changes; proposal store

**Files:**

- Create: `src/lib/server/mcp/writes/types.ts`, `src/lib/server/mcp/writes/compile.ts`, `src/lib/server/mcp/writes/proposals.ts`
- Test: `src/lib/server/mcp/writes/compile.test.ts`, `src/lib/server/mcp/writes/proposals.test.ts`

**Interfaces:**

- Produces (`types.ts`):

```ts
export type WriteOp =
	| { action: 'create'; collection: string; ref?: string; data: Record<string, unknown> }
	| { action: 'update'; collection: string; id: string; data: Record<string, unknown> };
export type Outcome = 'saved' | 'suggested' | 'idea';
export interface PlannedChange {
	action: 'create' | 'update';
	collection: string;
	id: string; // update target, or pre-generated 15-char PB id for a create
	via: 'record' | 'suggestion';
	before: Record<string, unknown> | null; // only the touched fields; null for create
	after: Record<string, unknown>; // normalised values that will be written
	outcome: Outcome;
	title: string; // record title/name for the card
}
export interface Proposal {
	id: string;
	userId: string;
	connectionId: string;
	tripId: string;
	quote: string;
	changes: PlannedChange[];
	cascade: Cascade | null;
	expiresAt: number;
	committedChangeId?: string;
}
export type CommittedChange = PlannedChange & { committed: boolean; suggestionId?: string };
```

- `compileOps(loader: RecordLoader, trip: TripRef, ops: WriteOp[]): Promise<PlannedChange[]>`. The loader is injected so tests use fakes: `interface RecordLoader { get(collection, id): Promise<Record<string, unknown> | null>; tripIdOf(collection, record): Promise<string> }`. It throws a plain-words `Error` on refusal.
- `proposals.ts`:
  - `saveProposal(p: Omit<Proposal, 'id' | 'expiresAt'>, now?: number): Proposal`
  - `takeProposal(id: string, userId: string, connectionId: string, now?: number): Proposal | 'expired' | 'not_yours'`
  - `markCommitted(id: string, changeId: string): void`
  - The store is an in-memory `Map`, swept on each save, the same pattern as `oauth/pending.ts`.
- `staleFields(change: PlannedChange, current: Record<string, unknown> | null): string[]` lists the fields whose current value ≠ `before`. A missing record counts as all fields stale.

- [ ] **Step 1:** Write failing `compile.test.ts` cases (fake loader, Porto-like fixtures):
  - `0 ops` throws `Nothing to change.`; 51 ops throws `At most 50 changes at once.`
  - a blocked collection or field throws the `blockedReason` text
  - an update whose record belongs to another trip throws `That record isn't in <trip title>.` (Review Focus 1)
  - item create with `date: '2026-11-03'` resolves to that day's id; a date outside the trip throws `2026-11-30 is outside <trip title> (2026-11-01 → 2026-11-08).`
  - `start_time: '09:40'` becomes `2026-11-03 09:40:00.000Z`
  - a `ref` create gets a 15-char id, and a later op's value `"$ref:<name>"` is replaced with it
  - author fields from `stamp` are filled with the caller's user or member id
  - an owner's item create gives outcome `saved`. A traveler's item create gives `via: 'suggestion'` with outcome `idea` when `auto_approve_suggestions` is true and `suggested` when false.
  - a traveler's item update throws `Only the trip's owners can edit items. I can leave a comment for them instead.`
  - `before` holds only the touched fields
- [ ] **Step 2:** Write failing `proposals.test.ts`:
  - save then take returns the proposal
  - after 15 min it returns `'expired'`
  - another user or connection gets `'not_yours'`
  - `staleFields` returns `['title']` when only the title changed, and all fields when the record is null
- [ ] **Step 3:** Run `pnpm vitest run src/lib/server/mcp/writes`. Expected: FAIL.
- [ ] **Step 4:** Implement both files.
- [ ] **Step 5:** Re-run. Expected: PASS.
- [ ] **Step 6:** Commit `feat(#503): compile write ops, proposal store`.

### Task 7: Cascade preview for trip dates and phases

**Files:**

- Create: `src/lib/server/mcp/writes/cascade.ts`
- Test: `src/lib/server/mcp/writes/cascade.test.ts`

**Interfaces:**

- Consumes `retilePhases`, `PhaseStart` and `TiledPhase` from `src/lib/itinerary/phase-tiling.ts`.
- Produces:

```ts
export interface Cascade {
	tripBefore: [string, string] | null;
	tripAfter: [string, string] | null; // ISO dates
	daysAdded: string[];
	daysRemoved: string[];
	phases: { name: string; before: [string, string] | null; after: [string, string] | null }[];
	moves: { title: string; from: string; to: string }[]; // items/ideas re-homed, by phase name
}
export function cascadeFor(
	changes: PlannedChange[],
	snapshot: { trip: Trip; phases: Phase[]; days: Day[]; items: Item[] }
): Cascade | null;
```

Returns null when no change touches `trips.start_date`/`end_date` or `phases.start_date`. It must mirror what `trips.pb.js` / `phases.pb.js` do on commit.

- [ ] **Step 1:** Write failing tests using the same scenarios as `backend/test-tiling.mjs`:
  - extend: the last phase grows, and the new day is listed in `daysAdded`
  - shrink: the phase starting on the new end merges into its predecessor, and its ideas are listed in `moves`
  - later start: the first phase is pinned and earlier phases merge
  - a pruned-day item lands in a surviving phase
  - non-date changes return null
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(#503): cascade preview`.

### Task 8: propose_changes + the preview card

**Files:**

- Create: `src/lib/server/mcp/tools/propose-changes.ts`, `src/lib/server/mcp/writes/preview.ts`
- Modify: `src/lib/server/mcp/present.ts` (`Card.changes?`, `structuredContent.proposal?`), `src/lib/server/mcp/card-html.ts` (diff rows, quote, outcome line, calendar, Confirm button), `src/lib/server/mcp/tools/index.ts`
- Test: `src/lib/server/mcp/writes/preview.test.ts`, `tests/e2e/mcp-writes.spec.ts`

**Interfaces:**

- Consumes `compileOps`, `saveProposal`, `cascadeFor`, `assertCanWrite`.
- Produces:
  - `propose_changes({ trip: string; quote: string; ops: WriteOp[] })` returns `structuredContent` = `{ heading, cards, proposal: { id, quote, outcome: string, calendar?: { before: [string,string]; after: [string,string] } } }`.
  - `Card.changes?: { field: string; from: string; to: string }[]`
  - `previewCards(changes: PlannedChange[], cascade: Cascade | null, trip: Trip): Card[]` gives one card per change: emoji from `EMOJI` for items, field labels via `titleCase`, times via `formatClock`, dates via `formatCalendarDate`. Cascade lines come first as their own card ("Day 9 removed", "2 ideas move to Lisbon").
- Card view: changed rows show `from` struck and `to` highlighted, then the quote in quotes and the outcome line. `proposal.calendar` renders two small month grids with the before/after ranges shaded; the text fallback is `Mon 3 Nov → Tue 4 Nov`.
- The Confirm button renders only when the `ui/initialize` result's `hostCapabilities.serverTools` is present. It calls `tools/call` `commit_changes { proposal_id }` and re-renders with the result.

- [ ] **Step 1:** Write failing `preview.test.ts`:
  - an update shows `{ field: 'Start time', from: '9:00 am', to: '9:40 am' }`
  - a traveler create's card carries outcome `Sent to the owners as a suggestion` (auto-approve off) or `Added as an idea` (on)
  - an owner change carries `Saved`
  - a cascade adds a first card listing removed days and moves
  - a note containing `x@y.com` comes out scrubbed (Global Constraints)
- [ ] **Step 2:** Write failing e2e cases:
  - owner `propose_changes` (Porto, rename an item, quote `"call it Lunch at Taberna"`) returns a proposal id, a card with that change, and the quote; the item is **unchanged** in PB
  - a viewer gets `isError` `Viewers can't change this trip.`
  - an `ai_write: false` trip gets `AI changes are turned off for this trip by its owner.` (add that trip to `mcp-seed.ts`)
- [ ] **Step 3:** Run. Expected: FAIL.
- [ ] **Step 4:** Implement.
- [ ] **Step 5:** Run (PASS), then `pnpm check`.
- [ ] **Step 6:** Commit `feat(#503): propose_changes and preview card`.

### Task 9: commit_changes

**Files:**

- Create: `src/lib/server/mcp/tools/commit-changes.ts`, `src/lib/server/mcp/writes/commit.ts`
- Modify: `src/lib/server/mcp/tools/index.ts`, `src/lib/server/mcp/context.ts` (`McpContext.connectionId: string`), `src/routes/mcp/+server.ts` (pass `grant.connectionId`)
- Test: `tests/e2e/mcp-writes.spec.ts`

**Interfaces:**

- Consumes `takeProposal`, `markCommitted`, `staleFields`, `assertCanWrite`, `writesEnabled`, and `adminPb()` (writing the audit row).
- Produces:
  - `commitProposal(ctx: McpContext, proposalId: string): Promise<{ changeId: string; changes: CommittedChange[]; outcome: string }>`
  - `commit_changes({ proposal_id: string })`
- Order:
  1. Run `takeProposal`. On `expired` or `not_yours`, refuse.
  2. If `committedChangeId` is set, return `Already saved` with no write.
  3. Re-check `writesEnabled` and `assertCanWrite`, re-reading the trip.
  4. Re-read every update target. Any `staleFields` → refuse with `<title> changed since the preview (<fields>). Ask me to propose again.`
  5. Send one `pb.createBatch()` with all `via: 'record'` changes, creates using their pre-generated ids. A batch error writes nothing and returns PB's message, scrubbed.
  6. Post each `via: 'suggestion'` change to `/api/suggestions/create` with the user's token.
  7. Write the `ai_changes` row (user, connection, trip, quote, changes).
  8. Run `markCommitted`.

- [ ] **Step 1:** Write failing e2e cases (serial, after Task 8's propose):
  - **commit:** the item title changes in PB and an `ai_changes` row exists for the owner with the quote
  - **double commit:** committing the same id again returns `Already saved`, with exactly one `ai_changes` row (Review Focus 2)
  - **stale:** propose, change the item's title via the owner's PB REST, then commit → refused, title untouched
  - **other user:** the traveler commits the owner's proposal id → refused (Review Focus 3)
  - **switch flipped:** propose, set `ai_write` false via the owner's PB, commit → refused (Review Focus 4)
  - **all-or-nothing:** a 2-op proposal where op 2 violates a hook (e.g. an item end before its start) → batch fails and op 1 is not written
  - **traveler add, auto-approve off:** creates a pending suggestion, no item, outcome `Sent to the owners as a suggestion`
  - **cascade:** an owner trip-date shrink commits and the phases match the preview's `cascade.phases`
- [ ] **Step 2:** Run `pnpm test:e2e:clean -- mcp-writes`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run (PASS), then the full `pnpm test:e2e:clean -- mcp-` to check v3.1 read specs are unaffected.
- [ ] **Step 5:** Commit `feat(#503): commit_changes`.

### Task 10: Revert, in chat and in account settings

**Files:**

- Create: `src/lib/server/mcp/writes/revert.ts`, `src/lib/server/mcp/tools/revert-change.ts`
- Modify: `src/lib/server/mcp/tools/index.ts`, `src/routes/(app)/account/+page.server.ts` (load last-30-days `ai_changes`; action `revertAiChange`), `src/routes/(app)/account/+page.svelte` (Recent AI changes inside Connected apps, a `<details>` collapsed by default)
- Test: `src/lib/server/mcp/writes/revert.test.ts`, `tests/e2e/mcp-writes.spec.ts`, `tests/e2e/connected-apps.spec.ts`

**Interfaces:**

- Produces:
  - `revertChange(pb: PocketBase, userId: string, changeId?: string): Promise<{ restored: string[]; skipped: string[] }>`. Without a `changeId` it reverts the user's latest un-reverted change. It runs with the **user's** PB client and sets `reverted_at` via `adminPb()`.
  - `inverseOf(change: CommittedChange, current: Record<string, unknown> | null): { data: Record<string, unknown> | null; delete: boolean; skipped: string[] }` (pure)
  - `revert_change({ change_id?: string })`
- Rules:
  - An update restores each field whose current value still equals `after`, and skips the rest.
  - A record create deletes the record.
  - A suggestion create deletes the suggestion if it's still pending, else skips with `already approved — remove the item in the app`.
  - A cascade appends the skip line `phases re-tile from the restored dates; ideas moved earlier stay where they are`.
  - Only the author can revert; a second revert of the same change returns `Already undone`.

- [ ] **Step 1:** Write failing `revert.test.ts` for `inverseOf`:
  - an untouched update restores all fields
  - a field changed since is skipped by name
  - a null current record is skipped as `<title> was deleted` (Review Focus 5)
  - a create gives `delete: true`
- [ ] **Step 2:** Write failing e2e cases:
  - **chat undo:** `revert_change` with no id restores the Task 9 rename and sets `reverted_at`
  - **author only:** the traveler can't revert the owner's change
  - **account page:** shows "Recent AI changes" collapsed. Expanding it lists the change with its quote and a time in `9:40 am` form. Revert works there and the row then reads `Undone`. Use `goto` with `networkidle` before clicking.
- [ ] **Step 3:** Run. Expected: FAIL.
- [ ] **Step 4:** Implement.
- [ ] **Step 5:** Run (PASS), then `pnpm check` and `pnpm verify:visual '/account' --widths 375`.
- [ ] **Step 6:** Commit `feat(#503): revert_change and Recent AI changes`.

### Task 11: v3.1 hardening minors (#512)

**Files:**

- Modify: `src/lib/server/mcp/oauth/store.ts`, `src/routes/oauth/authorize/+page.server.ts`, `src/routes/oauth/token/+server.ts` (if the resource check lands there), `src/lib/server/mcp/tools/get-trip.ts`, `src/lib/server/mcp/admin-pb.ts`
- Test: `src/lib/server/mcp/oauth/*.test.ts`, `tests/e2e/mcp-oauth.spec.ts`, `tests/e2e/mcp-tools.spec.ts`

**Interfaces:** No new exports beyond `sweepExpiredTokens(now?: number): Promise<number>` in `store.ts`.

- [ ] **Step 1:** Write the failing tests:
  - **refresh race:** two concurrent refreshes with one token give exactly one success (rotation guarded by a conditional update on the old row: an update filtered `id && revoked = false`, with a 404 treated as the loser)
  - **sweep:** `sweepExpiredTokens` deletes expired access tokens and rotated refresh rows, and keeps live ones. Call it on every rotation, throttled to once an hour.
  - **resource:** an authorize `resource` other than `<origin>/mcp` is refused `invalid_target`
  - **get_trip cap:** a 45-night trip still shows goals and ideas (put goals/ideas before nights, or collapse consecutive same-lodging nights into one range card)
  - **e2e:** a member removed from a trip no longer sees it in `list_trips`
  - **e2e:** a red-eye landing today shows in `get_day`
  - **cache:** the `userPb` cache evicts entries past expiry (cap 100 entries)
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run, then `pnpm test:e2e:clean -- mcp-`. Expected: PASS.
- [ ] **Step 5:** Commit `fix(#512): v3.1 hardening minors`.

### Task 12: Release wiring

**Files:**

- Modify: `docs/DEPLOY_RUNBOOK.md` (`MCP_WRITES` env; pre-deploy dry-run for duplicate phase `start_date` from the #411 review M2), `src/lib/server/mcp/server.ts` (server version `3.2.0`), `src/lib/server/mcp/card-html.ts` (appInfo version `3.2.0`), `package.json` version `3.2.0`

- [ ] **Step 1:** Make the edits.
- [ ] **Step 2:** Run the full gate: `pnpm check`, `pnpm vitest run`, `bash scripts/backend-harnesses.sh`, `pnpm test:e2e:clean`. Expected: all green. A known-flaky spec that passes alone is noted, not ignored.
- [ ] **Step 3:** Commit `chore: v3.2.0`.
