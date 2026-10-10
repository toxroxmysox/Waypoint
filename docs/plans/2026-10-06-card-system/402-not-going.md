# Not going (three-state Going) — storage, rules and endpoint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use svw:executing-plans (small plans) or svw:subagent-driven-development (large plans) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Items store who said "not going" (`not_going`, beside `assigned_to`); the server keeps the two lists exclusive, lets only a member answer for themselves, and the self-assign endpoint takes a target state (going / not going / no answer).

**Architecture:** One append-only migration adds the relation list. `items.pb.js` gets two layers: the existing *request* hooks enforce who may change what (Not going is self-only for every role; viewers can't answer), and a new *model* hook (`onRecordCreate` / `onRecordUpdate`) enforces exclusivity on every save, including internal `e.app.save` calls from departure clean-up and Suggestion approval. The SvelteKit self-assign endpoint writes with PB's `field+` / `field-` modifiers, so it only ever touches the caller's id. *(Corrected in review: the modifiers apply to the record as loaded, so two answers landing within a few ms can lose one. Accepted as rare; assigning "going" already had the same race.)* No UI (that is #440).

**Tech Stack:** PocketBase 0.27 JSVM (goja) hooks + migrations, SvelteKit server route, Vitest, the PB harnesses (`backend/test-rules.mjs`, `backend/test-suggestions.mjs`).

**Spec:** `docs/plans/2026-10-06-card-system/spec.md` §"Schema and API changes" item 4; the build decision in issue #402's body.

**Intent sources:** `docs/adr/0011-item-card-avatars-denote-assignees.md` (amended 2026-10-06); `CONTEXT.md` (Assignment / Going); `docs/ITEM_ASSIGNMENT_PRD.md`; `docs/CARD_SYSTEM.md` D6; `backend/RULES.md`.

**Run:** `E2E_SLOT=2 bash scripts/backend-harnesses.sh rules suggestions` (disposable PB on :8099); `pnpm test:unit --run`; `pnpm check`.

## Global Constraints

- Migration number **0071 only**, one file: `backend/pb_migrations/0071_items_not_going.js`.
- Three states, glossary words: **going**, **not going**, **no answer**. Code values: `'going' | 'not_going' | 'no_answer'`.
- A member is in at most one of `assigned_to` / `not_going`; "setting one clears the other".
- Not going is self-only for every role (owners included). Viewers can't answer.
- Departure clean-up, Suggestion approval and item copying treat `not_going` the way they treat `assigned_to`.
- goja: handler-first signatures, every helper inlined in the callback, `'' + x` string compares, `ApiError.status` never `.code`.
- #450 edits `backend/RULES.md`, `backend/test-rules.mjs` and the trip_members hook concurrently: every addition here sits in its own block labelled `#402`.

## Review Focus

1. **A member answers "not going" while going without removing themselves from `assigned_to`** (raw REST `not_going+`) → they end up not going only. Pinned in Task 2 (`exclusive_going_to_ng`).
2. **An owner assigns going to someone who said not going** (the item form) → the owner's assignment wins and clears their not going, because owners may set others' going. Pinned in Task 2 (`exclusive_owner_assigns_ng_member`).
3. **Reassigning a departed member's answers onto someone who already answered** → the target keeps their own answer; an inherited one never overrides it. Pinned in Task 4 (`reassign_own_answer_wins_*`).
4. **A member referenced only by `not_going` is removed** → tombstoned, never purged (the id would dangle). Pinned in Task 4 (`ng_blocks_purge`).
5. **A Suggestion payload names other members as not going** → only the author's own not going is carried onto the item. Pinned in Task 5.

---

### Task 1: Pure going-state logic

**Files:**
- Modify: `src/lib/itinerary/assignment.ts`
- Test: `src/lib/itinerary/assignment.test.ts`

**Interfaces:**
- Produces:
  - `export type GoingState = 'going' | 'not_going' | 'no_answer'`
  - `export function parseGoingState(raw: unknown): GoingState | null` — exact string match, else `null`.
  - `export function goingStateOf(item: { assigned_to?: readonly string[] | null; not_going?: readonly string[] | null }, memberId: string): GoingState` — going wins if (illegally) in both, mirroring the server.
  - `export function goingPatch(state: GoingState, memberId: string): Record<string, string>` — PB modifier body: going → `{ 'assigned_to+': id, 'not_going-': id }`; not_going → `{ 'not_going+': id, 'assigned_to-': id }`; no_answer → `{ 'assigned_to-': id, 'not_going-': id }`.
  - `canSelfAssign` / `toggleAssignee` stay unchanged.

- [ ] **Step 1: failing tests** — `describe('parseGoingState')`: the three values parse; `'Going'`, `''`, `null`, `undefined`, `1`, `'none'` → `null`. `describe('goingStateOf')`: `{assigned_to:['m1']}`→going; `{not_going:['m1']}`→not_going; `{}` and `{assigned_to:null}`→no_answer; in both → going; another member's answer doesn't leak (`{not_going:['m2']}` for m1 → no_answer). `describe('goingPatch')`: the three exact objects above for `'m1'`; each patch touches only `m1` (every value === `'m1'`).
- [ ] **Step 2:** `pnpm test:unit --run src/lib/itinerary/assignment.test.ts` → FAIL (exports missing).
- [ ] **Step 3:** implement in `assignment.ts`.
- [ ] **Step 4:** same command → PASS.
- [ ] **Step 5:** commit `feat(#402): pure going-state logic`.

### Task 2: Storage + items rules (self-only, viewers out, exclusivity)

**Files:**
- Create: `backend/pb_migrations/0071_items_not_going.js`
- Modify: `backend/pb_hooks/items.pb.js` (create request hook, update request hook, new model hooks)
- Modify: `src/lib/itinerary/types.ts` (`Item.not_going?: string[]`)
- Modify: `src/routes/(app)/trips/[slug]/clone/+page.server.ts` (`not_going: []` beside `assigned_to: []`)
- Test: `backend/test-rules.mjs` (new `#402` block: `NOT_GOING_OPS`, `runNotGoingNovelCases`, `printNotGoingReport`, wired in `main()` after the #219 cases)

**Interfaces:**
- Produces: the `items.not_going` field (relation → `trip_members`, `maxSelect: 50`, not required, no cascade — same shape as `assigned_to`); the exclusivity guarantee every later task relies on.

- [ ] **Step 1: failing harness cells.** Fresh item per case: the owner POSTs `{trip, type:'activity', title}`; seed answers with each member's *own* token. Read back with an owner GET. `other` = traveler for owner/co_owner/viewer, co_owner for traveler.
  - Role matrix, for `owner, co_owner, traveler, viewer` (ops are the cell names):
    - `ng_self` PATCH `{'not_going+': own}` → allow (viewer deny)
    - `ng_other` PATCH `{'not_going+': other}` → deny for all four
    - `going_self` PATCH `{'assigned_to+': own}` → allow (viewer deny)
    - `going_other` PATCH `{'assigned_to+': other}` → allow owner/co_owner, deny traveler/viewer
    - `no_answer_self` (own not going seeded first, except viewer) PATCH `{'not_going-': own}` → allow (viewer deny)
    - `no_answer_other` (other's not going seeded by other) PATCH `{'not_going-': other}` → deny for all four
  - `ng_self` as `non_member` with `{'not_going+': traveler}` → deny.
  - Exclusivity (expected `yes`, actual from the read-back):
    - `exclusive_going_to_ng`: traveler going, then PATCH `{'not_going+': traveler}` → `assigned_to` lacks, `not_going` has traveler.
    - `exclusive_ng_to_going`: traveler not going, then PATCH `{'assigned_to+': traveler}` → `not_going` lacks, `assigned_to` has.
    - `exclusive_swap_one_patch`: traveler going, then PATCH full arrays `{assigned_to: [], not_going: [traveler]}` → allow + not going only.
    - `exclusive_both_at_once`: traveler from no answer PATCHes `{assigned_to:[t], not_going:[t]}` → allow, going only (going wins).
    - `exclusive_owner_assigns_ng_member`: traveler not going, owner PATCH `{'assigned_to+': traveler}` → allow, traveler going only.
  - Guards: `ng_with_other_field` traveler `{'not_going+': own, title:'x'}` → deny; `creator_ng_other` traveler-authored item (owner mints with `created_by: traveler`), traveler `{'not_going+': co_owner}` → deny; `create_ng_other` owner POST with `not_going:[traveler]` → deny; `create_ng_self` owner POST with `not_going:[owner]` → allow.
- [ ] **Step 2:** `E2E_SLOT=2 bash scripts/backend-harnesses.sh rules > log` → the #402 cells FAIL (field unknown: deny cells come back allow, read-backs `no`).
- [ ] **Step 3: migration** `0071_items_not_going.js`: `items.fields.add(new RelationField({ name: 'not_going', collectionId: trip_members.id, maxSelect: 50, required: false, cascadeDelete: false }))`; down `removeByName('not_going')`. Additive `fields.add` (keeps autodate).
- [ ] **Step 4: request hooks** in `items.pb.js`:
  - Create: after the role gate, every id in `not_going` must equal the caller's member id, else `ForbiddenError("Only you can say you're not going.")`.
  - Update: right after resolving `callerMember` and **before** the owner/creator bypasses, compute the `not_going` symmetric difference (original vs submitted). Non-empty and viewer → `ForbiddenError("Viewers can't answer whether they're going.")`; non-empty and not exactly `[me]` → the self-only error. In the traveler branch, the changed-id set is the union of the `assigned_to` and `not_going` differences and must be exactly `[me]`; `not_going` stays out of `lockedFields`.
- [ ] **Step 5: model hooks** `onRecordCreate` + `onRecordUpdate` for `items` (exclusivity, before `e.next()`). For each id in both lists after the change: if it was newly added to `not_going` and *not* newly added to `assigned_to`, drop it from `assigned_to`; otherwise drop it from `not_going` (going wins). On create, "original" is empty, so any overlap resolves to going. Only `set` a list when it changed.
- [ ] **Step 6:** `Item.not_going?: string[]` (optional: fixtures and `fields:`-limited loaders omit it; PB always returns `[]`). Clone: `not_going: []`.
- [ ] **Step 7:** the new field trips the #238 drift cell, so in this task add `['items', 'not_going', 'block_multi']` to `members.pb.js` `MEMBER_RELATION_FIELDS` and `'items.not_going'` to the harness `CANONICAL_MEMBER_RELATIONS` (Task 4 does the rest of the departure work). Rerun rules → all PASS, including the pre-existing #226/#219/matrix and drift cells.
- [ ] **Step 8:** commit `feat(#402): not_going storage, self-only rule, exclusivity`.

### Task 3: Self-assign endpoint takes a target state

**Files:**
- Modify: `src/routes/api/items/[itemId]/assign-self/+server.ts`

**Interfaces:**
- Consumes: Task 1's `parseGoingState`, `goingStateOf`, `goingPatch`, `canSelfAssign`.
- Produces (for #440): `POST /api/items/:itemId/assign-self` body `{ state: 'going' | 'not_going' | 'no_answer' }` → `200 { ok, state, assigned_to, not_going, member_id }`; `400` on an unknown `state`; `403` for viewers ("Viewers can't answer whether they're going.") and non-members; `401` signed out; `404` unknown item.

- [ ] **Step 1:** parse the JSON body tolerantly (empty or invalid body → no state). `state` present but unparseable → `error(400, 'state must be going, not_going or no_answer')`.
- [ ] **Step 2:** no `state` → legacy "+ Me" toggle: `goingStateOf(stored, me) === 'going' ? 'no_answer' : 'going'` (keeps `AssigneeStacks.svelte` working untouched until #440 retires it).
- [ ] **Step 3:** write `goingPatch(state, membership.id)` through `locals.pb` (the user's own auth, so the items hooks still enforce), respond with the updated lists and `goingStateOf(updated, me)`.
- [ ] **Step 4:** `pnpm check` → 0 errors; `pnpm test:unit --run` → all pass.
- [ ] **Step 5:** commit `feat(#402): self-assign endpoint takes a target state`.

### Task 4: Departure clean-up treats `not_going` like `assigned_to`

**Files:**
- Modify: `backend/pb_hooks/members.pb.js` (`/api/members/can-purge`, `/api/members/remove`)
- Test: `backend/test-rules.mjs` (`#402` block: departure cells in `runNotGoingNovelCases`)

- [ ] **Step 1: failing cells** (fresh `setupFixture()` each):
  - `ng_blocks_purge`: traveler deletes their own fixture goal (their only blocking reference), owner probes `GET /api/members/can-purge?member_id=<traveler>` → `zero_ref: true` (control); traveler says not going on the fixture item; probe → `zero_ref: false`; owner removes traveler (keep) → `deleted: false`; item still lists the tombstone in `not_going`. One cell per assertion: `ng_purge_control`, `ng_canpurge_blocks`, `ng_remove_tombstones`, `ng_kept_on_tombstone`.
  - Reassign to co_owner (traveler removed, `disposition: 'reassign'`): item A traveler not going → `not_going == [co_owner]`, `assigned_to == []` (`reassign_moves_ng`); item B traveler not going + co_owner going → co_owner going only (`reassign_own_answer_wins_going`); item C traveler going + co_owner not going → co_owner not going only (`reassign_own_answer_wins_ng`).
  - Cascade (`disposition: 'cascade'`): traveler not going → `not_going == []` (`cascade_clears_ng`).
- [ ] **Step 2:** run rules → these FAIL.
- [ ] **Step 3:** can-purge probes `not_going ~ {:mid}` beside `assigned_to`; `rewriteMulti(col, field, toId, otherField)` skips adding `toId` when the record's `otherField` already holds it; reassign and cascade call it for `not_going` beside `assigned_to` (`assigned_to` passes `'not_going'`, `not_going` passes `'assigned_to'`).
- [ ] **Step 4:** run rules → all PASS.
- [ ] **Step 5:** commit `feat(#402): departure clean-up carries not_going`.

### Task 5: Suggestion approval carries the author's own not going

**Files:**
- Modify: `backend/pb_hooks/suggestions.pb.js` (auto-approve create, review approve)
- Test: `backend/test-suggestions.mjs` (new `#402` section before the summary)

- [ ] **Step 1: failing cases**: (a) owner creates (auto-approved) with payload `assigned_to:[co_owner], not_going:[owner, traveler]` → item `not_going == [owner]`, `assigned_to == [co_owner]`; (b) traveler's pending suggestion with `not_going:[traveler, co_owner]`, owner approves → item `not_going == [traveler]`; (c) owner approves a traveler suggestion whose payload has `assigned_to:[traveler], not_going:[traveler]` → going only.
- [ ] **Step 2:** `bash scripts/backend-harnesses.sh suggestions` → FAIL.
- [ ] **Step 3:** both item-creation sites set `not_going` to `[author member id]` when the payload's `not_going` array contains it, else `[]` (author = caller on auto-approve, the suggestion's `author` on review). Exclusivity comes from Task 2's model hook.
- [ ] **Step 4:** rerun → PASS.
- [ ] **Step 5:** commit `feat(#402): suggestion approval carries the author's not going`.

### Task 6: Docs

**Files:** `backend/RULES.md` (new section `## Going: self-assign and Not going (#226 / #402)` after "Items & Phases role gate (#175)"), `CONTEXT.md` (Assignment: name the `not_going` field, drop "needs #402"), `docs/SPEC.md` (role-matrix row + items schema row for `not_going`).

- [ ] **Step 1:** write the three edits.
- [ ] **Step 2:** commit `docs(#402): rules, glossary, spec for not_going`.

### Final verification

`pnpm check` (0 errors) · `pnpm test:unit --run` (all pass) · `E2E_SLOT=2 bash scripts/backend-harnesses.sh rules suggestions members` (all pass) · `E2E_SLOT=2 pnpm test:e2e:clean` (the field must not break any screen). Final: review by PM.
