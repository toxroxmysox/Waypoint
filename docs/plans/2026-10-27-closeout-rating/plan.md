# Closeout Rating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use svw:executing-plans (small plans) or svw:subagent-driven-development (large plans) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Closeout resolves each activity as Recommend / Don't recommend / Didn't do, a closed trip gets a rating walk, and ratings show on the Record, the Public Archive and Claude's reads.

**Architecture:** One optional `rating` field on `items`, valid only on `done` items (a PB model hook clears it otherwise). A pure `closeout-outcome` module maps a button to `{ status, rating }`. The existing closeout page runs in two modes: `walk` (wrap-up, as today) and `rate` (closed trip: ratings only). Travelers get a narrow PB exception so they can actually walk closeout.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, PocketBase 0.27 JSVM hooks + migrations, Vitest, Playwright, node harnesses (`scripts/backend-harnesses.sh`).

**Spec:** `docs/plans/2026-10-27-closeout-rating/grill.md`

**Intent sources:** glossary `CONTEXT.md` (Rating, Item Status, Closeout, Public Archive, Organizer); ADR-0011 (traveler self-assign exception, the pattern Task 2 extends); ADR-0025 (MCP writes). No new ADR.

**Run:** `pnpm verify:visual '/trips/{slug}/closeout'` for the walk; for the rating walk, close the seeded trip via API (`archived: true`, past dates) and open `/trips/{slug}/closeout`. Public view: `/archive/{token}` after publishing. Full gate: `pnpm check && pnpm test:unit && bash scripts/backend-harnesses.sh items && pnpm test:e2e:clean`.

## Global Constraints

- Rating values: `recommend` | `not_recommend` | `''` (not rated). UI copy: **Recommend**, **Don't recommend**, **Didn't do**. Marks: 👍 / 👎.
- Only `done` items carry a rating. Leaving `done` clears it; returning to `done` leaves it unrated.
- Rating editors: owner, co_owner, traveler. Never viewer.
- Rating is set only in closeout (walk or rating walk), and through Claude. Not on Today/Now/day pages, not on the Record view.
- One rating per item; last save wins. No per-member data, no tallies.
- Migrations append-only (next number `0091`). Hooks: inline every helper in the callback body (goja isolation); string-coerce field reads.
- Seed via API in e2e; `waitUntil: 'networkidle'` before clicking; AppShell renders pages twice, so scope locators to the visible copy.
- Removed labels **Done / Swap / Skip** on closeout rows: `grep -rn "Swap\|Skip\|'Done'" tests/` and fix assertions in the same commit.
- 375px screenshot for every UI task (`pnpm verify:visual`).

## Review Focus

1. **Traveler permissions (inference from `items.pb.js`, not yet run):** the update hook locks `status` for travelers and the create hook refuses them, so a traveler's closeout Done/Swap/Finish is refused today. Task 2's first test confirms this RED before fixing it.
2. **Re-running Finish on a closed trip:** today a closed trip's closeout shows the summary with **Finish**, which re-runs `finishCloseout` and can rewrite the publish choice. Rate mode must not offer it (Task 5 test).
3. **Status change by any path clears the rating:** an Organizer editing status in the item form, or Claude setting `considered`, must not leave a stale 👍 (Task 1 harness case covers both API and model paths).
4. **Unrated vs not recommended:** an unrated done item must render no mark, never 👎, on Record and archive (Task 6 unit test).
5. **Viewer by hand-crafted POST:** a viewer posting `?/rate` or `?/resolve` gets 403 even though no buttons render (Task 4 test).

---

### Task 1: `rating` field + done-only invariant

**Files:**
- Create: `backend/pb_migrations/0091_items_rating.js`
- Modify: `backend/pb_hooks/items.pb.js` (model hooks `onRecordCreate` / `onRecordUpdate` near the bottom)
- Modify: `src/lib/itinerary/types.ts` (`ItemRating`, `Item.rating`)
- Test: `backend/test-items.mjs`

**Interfaces:**
- Produces: `export type ItemRating = 'recommend' | 'not_recommend' | ''` and `rating: ItemRating` on `Item` (both in `src/lib/itinerary/types.ts`). PB field `items.rating`: select, single, values `recommend`, `not_recommend`, not required.

- [ ] **Step 1: Write failing harness cases in `backend/test-items.mjs`** (owner client, follow the file's existing case style):
  - `rating: set recommend on a done item` → read back `rating === 'recommend'`.
  - `rating: set on a planned item is cleared` → update `{ status: 'planned', rating: 'recommend' }` → read back `rating === ''`.
  - `rating: done → considered clears it` → done+recommend, then `{ status: 'considered' }` → `rating === ''`.
  - `rating: considered → done stays unrated` → then `{ status: 'done' }` → `rating === ''`.
  - `rating: bad value rejected` → `{ rating: 'meh' }` → 400.
- [ ] **Step 2: Run** `bash scripts/backend-harnesses.sh items` → FAIL (unknown field).
- [ ] **Step 3: Migration `0091_items_rating.js`** adds the select field (down removes it). In both model hooks, before `e.next()`: if `'' + e.record.get('status') !== 'done'` set `rating` to `''`. Add `ItemRating` + `Item.rating`.
- [ ] **Step 4: Run** the harness → PASS; `pnpm check` → 0 errors.
- [ ] **Step 5: Commit** `feat(#576): items.rating, cleared off done`.

### Task 2: Travelers can walk closeout

**Files:**
- Modify: `backend/pb_hooks/items.pb.js` (update hook after the creator exception; create hook)
- Test: `backend/test-items.mjs`

**Interfaces:**
- Consumes: `items.rating` (Task 1).
- Produces: after the trip has ended, a traveler may (a) update an item when the only changed fields are `status` (to `planned` | `done` | `considered`) and/or `rating`; (b) create an item with `status = 'done'` (a swap replacement). "Trip has ended" = `archived` is true, or `end_date` is before today in the trip's `timezone` (compute the trip-local date inline, as `digest-core.js` does). Viewers stay refused.

- [ ] **Step 1: Failing harness cases** (traveler client, trip with past dates):
  - `closeout: traveler marks done + recommend` → 200, read back.
  - `closeout: traveler marks considered` → 200.
  - `closeout: traveler adds a done replacement` → create 200.
  - `closeout: traveler changes title after trip end` → 403 (only status/rating open).
  - `closeout: traveler sets done on an active trip` → 403 (dates spanning today).
  - `closeout: viewer sets rating` → 403.
  - `closeout: traveler rates on an archived trip` → 200.
- [ ] **Step 2: Run** `bash scripts/backend-harnesses.sh items` → the 200 cases FAIL with 403 (confirms Review Focus 1).
- [ ] **Step 3: Implement** the update exception as a locked-field check that skips `status` and `rating` (reuse the hook's `lockedFields` approach, inlined) gated on trip-ended; the create exception gated on role traveler + trip-ended + `status === 'done'`.
- [ ] **Step 4: Run** the harness (all named harnesses: `bash scripts/backend-harnesses.sh items rules suggestions`) → PASS.
- [ ] **Step 5: Commit** `feat(#576): travelers can resolve and rate in closeout`.

### Task 3: Closeout outcome module

**Files:**
- Create: `src/lib/itinerary/closeout-outcome.ts`
- Test: `src/lib/itinerary/closeout-outcome.test.ts`

**Interfaces:**
- Consumes: `ItemStatus`, `ItemRating` (Task 1).
- Produces:
  - `export type CloseoutOutcome = 'recommend' | 'not_recommend' | 'didnt_do'`
  - `export function outcomeUpdate(outcome: CloseoutOutcome): { status: ItemStatus; rating: ItemRating }`
  - `export function parseOutcome(raw: unknown): CloseoutOutcome | null`
  - `export function parseRating(raw: unknown): ItemRating | null` (`''` is valid = clear)
  - `export function itemOutcome(item: Pick<Item, 'status' | 'rating'>): CloseoutOutcome | 'done_unrated' | 'pending'`

- [ ] **Step 1: Failing tests**
```ts
expect(outcomeUpdate('recommend')).toEqual({ status: 'done', rating: 'recommend' });
expect(outcomeUpdate('not_recommend')).toEqual({ status: 'done', rating: 'not_recommend' });
expect(outcomeUpdate('didnt_do')).toEqual({ status: 'considered', rating: '' });
expect(parseOutcome('skip')).toBeNull();
expect(parseRating('')).toBe('');
expect(parseRating('meh')).toBeNull();
expect(itemOutcome({ status: 'done', rating: '' })).toBe('done_unrated');
expect(itemOutcome({ status: 'considered', rating: '' })).toBe('didnt_do');
expect(itemOutcome({ status: 'planned', rating: '' })).toBe('pending');
```
- [ ] **Step 2: Run** `pnpm vitest run src/lib/itinerary/closeout-outcome.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(#576): closeout outcome mapping`.

### Task 4: Closeout server actions

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/closeout/+page.server.ts`
- Test: `tests/e2e/closeout-rating.spec.ts` (created here; Task 5 extends it)

**Interfaces:**
- Consumes: `outcomeUpdate`, `parseOutcome`, `parseRating` (Task 3).
- Produces (form actions; all `fail(403)` for viewers, `fail(400)` on a bad value):
  - `?/resolve` — fields `item_id`, `outcome` → `items.update(item_id, outcomeUpdate(outcome))`. Replaces `markDone`.
  - `?/rate` — fields `item_id`, `rating` (`''` clears) → updates `rating` only; `fail(400)` if the item isn't `done`.
  - Loader adds `mode: 'walk' | 'rate'` (`'rate'` when lifecycle is `closed`).
  - `finishCloseout` → `fail(400, { error: 'This trip is already closed.' })` when the trip is archived.
  - `markDoneAll` and `addReplacement` unchanged (bulk "All done" stays done-unrated; the original of a replacement already goes `considered`).

- [ ] **Step 1: Failing e2e** (seed via API: owner + traveler + viewer, a past-dated trip with 3 planned items):
  - `traveler: Recommend marks done + recommend` — POST through the UI, assert via PB API `status === 'done' && rating === 'recommend'`.
  - `viewer POST ?/rate is refused` — `page.request.post` with the form body → status 403 or `{type:'failure'}` with 403.
  - `finishCloseout on a closed trip is refused`.
- [ ] **Step 2: Run** `pnpm test:e2e:clean closeout-rating` → FAIL.
- [ ] **Step 3: Implement** the actions and loader `mode`.
- [ ] **Step 4: Run** → PASS (the UI-driven case passes once Task 5 lands; mark it `test.fixme` until then and remove the fixme in Task 5).
- [ ] **Step 5: Commit** `feat(#576): closeout resolve/rate actions`.

### Task 5: Closeout rows, rate mode, summary

**Files:**
- Modify: `src/lib/itinerary/components/CloseoutItemRow.svelte`
- Modify: `src/lib/itinerary/components/CloseoutDayCard.svelte`
- Modify: `src/routes/(app)/trips/[slug]/closeout/+page.svelte`
- Test: `tests/e2e/closeout-rating.spec.ts`; grep-fix `tests/e2e/m5-closure.spec.ts`, `closeout-checklist.spec.ts`, others hit by the label grep.

**Interfaces:**
- Consumes: `?/resolve`, `?/rate`, `data.mode` (Task 4); `itemOutcome` (Task 3).
- Produces: `CloseoutItemRow` and `CloseoutDayCard` take `mode: 'walk' | 'rate'`.

Behavior:
- **Walk, pending row:** three identical pills **👍 Recommend · 👎 Don't recommend · Didn't do** (keep the existing 44px pill class). Didn't do posts `outcome=didnt_do`, then shows "Did something else instead?" with **+ Add** (opens the existing `InlineQuickAdd` replacement flow) and **No**.
- **Walk, done row:** trailing shows 👍 / 👎 / `Done`; tapping a resolved done row's trailing is not required (rating change happens in rate mode or by re-walking during wrap-up via the pills on unresolved rows only).
- **Walk, considered row:** trailing `Didn't do`.
- **Rate mode:** done rows show two toggle pills 👍 Recommend / 👎 Don't recommend with the current one pressed (`aria-pressed`); tapping the pressed one posts `rating=''`. Considered rows show `Didn't do`, no controls. No "All done" bulk button, no date adjust, no memory capture (already read-only), no ideas step.
- **Summary:** walk mode counts **Recommended / Not recommended / Done, not rated / Didn't do / Not reviewed yet**. Rate mode replaces the summary + Finish with a **Done rating** link back to `/trips/{slug}`. NavBar title in rate mode: **Rate activities**.

- [ ] **Step 1: Failing e2e** (extend the spec; remove Task 4's fixme):
  - `walk: Didn't do → finish → item absent from What we did, present under What we considered` (the Skip-bug regression).
  - `walk: Didn't do → + Add replacement → replacement is done and shows rating pills in rate mode`.
  - `rate mode: closed trip shows Rate activities, current 👍 pressed, switch to 👎 persists after reload`.
  - `rate mode: tapping the pressed pill clears the rating`.
  - `rate mode: no Finish button`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Run the label grep and fix old assertions.
- [ ] **Step 4: Run** `pnpm check && pnpm test:e2e:clean closeout m5-closure` → PASS. Screenshot `pnpm verify:visual '/trips/{slug}/closeout' --widths 375` (walk) and rate mode on a closed trip.
- [ ] **Step 5: Commit** `feat(#576): closeout rating UI + rate mode`.

### Task 6: Ratings on Record and Public Archive, plus the entry link

**Files:**
- Modify: `src/lib/portability/archive-view.ts` (sanitized item gains `rating`)
- Modify: `src/lib/portability/components/ArchiveDaySection.svelte` (`SanitizedItem.rating`, 👍/👎 mark)
- Modify: `src/lib/portability/components/RecordView.svelte` (prop `canRate`, **Rate activities** link)
- Modify: `src/routes/(app)/trips/[slug]/+page.server.ts` (`canRate` = owner | co_owner | traveler; include `rating` if the record item query limits `fields`)
- Modify: `src/routes/archive/[token]/+page.server.ts` (include `rating` if `fields`-limited)
- Test: `src/lib/portability/archive-view.test.ts`; `tests/e2e/trip-record-view.spec.ts`

**Interfaces:**
- Consumes: `Item.rating` (Task 1).
- Produces: `buildArchiveView(...).doneItems[n].rating: ItemRating`.

- [ ] **Step 1: Failing tests**
  - unit: `doneItems carry rating` — recommend, not_recommend and '' round-trip; considered items carry `''`.
  - e2e: `record shows 👍 on a recommended item, nothing on an unrated one` (assert the accessible label `Recommended` / absence).
  - e2e: `traveler sees Rate activities on the closed record; viewer does not`.
  - e2e: `public archive shows the same marks` (publish via API, open `/archive/{token}`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Mark = emoji with `aria-label="Recommended"` / `"Not recommended"`, trailing the row; unrated renders nothing.
- [ ] **Step 4: Run** `pnpm vitest run src/lib/portability && pnpm test:e2e:clean trip-record-view closeout-rating` → PASS. 375px screenshot of the record.
- [ ] **Step 5: Commit** `feat(#576): ratings on record and archive`.

### Task 7: Claude reads and writes ratings

**Files:**
- Modify: `src/lib/server/mcp/day-data.ts` (`ITEM_FIELDS` += `rating`)
- Modify: `src/lib/server/mcp/tools/get-trip.ts` (only if it builds its own item field list)
- Modify: `src/lib/server/mcp/writes/registry.ts` (items `fields.rating: 'recommend | not_recommend | empty to clear; done items only (closeout)'`)
- Test: the existing MCP tool tests beside those files (follow their names); `CONTEXT.md` unchanged.

**Interfaces:**
- Consumes: `items.rating` (Task 1) and the Task 2 traveler exception (a traveler's AI write obeys the same hook).

- [ ] **Step 1: Failing tests**
  - `get_day includes rating on items`.
  - `propose_changes accepts rating on an item update and the preview shows it`.
  - `propose rating on a planned item → commit leaves it unrated` (hook clears; preview may show it, the committed record has `''`).
- [ ] **Step 2: Run** `pnpm vitest run src/lib/server/mcp` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `pnpm check` 0 errors.
- [ ] **Step 5: Commit** `feat(#576): MCP reads and writes rating`.

### Final gate

- [ ] `pnpm check && pnpm test:unit && bash scripts/backend-harnesses.sh && pnpm test:e2e:clean` all green (residual parallel flakes rerun serially, stated as such).
- [ ] Scott's visual sweep: walk + rate mode + record at 375px.
- [ ] PR body references #576; issue closes on deploy.
