# Phase Tiling MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Issue:** #323 · **Decision record:** ADR-0021 (`docs/adr/0021-phases-tile-the-trip.md`)

**Goal:** Make phases tile the trip — every day in exactly one phase (two on a shared travel day), no gaps, no arbitrary overlap — by defining a phase by its **start day** and deriving its end from the next phase's start. Eliminates the vestigial whole-trip "Trip" phase that made every day a two-zone "Travel day".

**Architecture:** **Boundary model.** A phase is a start-boundary; its `end_date` is a *maintained denormalized* field = the next phase's `start_date` (shared boundary day), or the trip's `end_date` for the last phase. A single pure function (`retilePhases`) computes the whole layout from the sorted starts; a thin server helper persists the diff after every create/edit/delete. Tiling is therefore *structural* — overlaps and gaps are impossible by construction. `end_date` stays a real stored field, so the day-rebucket hooks, clone, import, and export read it unchanged. The phase form drops the end-date picker (set name + start day only). No schema migration; no PB-hook rewrite (the existing `phases.pb.js` rebucket already derives `day.phases` from phase ranges, so correct ranges ⇒ correct day membership for free).

**Tech Stack:** SvelteKit form actions + `$lib` pure modules (Vitest), PocketBase (existing `phases`/`days`/`items` collections + `phases.pb.js` rebucket hooks, unchanged), TypeScript, Tailwind v4.

---

## Background the engineer needs

- **Phases collection** (`phases`): `trip`, `name`, `location`, `country_code`, `start_date`, `end_date`, `order`. Dates store as PB datetimes `'YYYY-MM-DD 00:00:00.000Z'`. There is NO `created_by` field (schema 0004). Role-gated owner/co_owner via `backend/pb_hooks/phases.pb.js` (don't touch the gate).
- **Day↔phase bucketing is already derived:** `backend/pb_hooks/phases.pb.js` re-buckets every `day.phases` multi-relation from phase date-ranges on phase create/update/delete (each day gets every phase whose `[start_date, end_date]` contains it). **So once phase ranges tile correctly, day membership and the "Travel day" two-zone split follow automatically — do not change this hook.**
- **Auto-seed:** `backend/pb_hooks/trips.pb.js:108` seeds one phase named `"Trip"`, `start=tripStart`, `end=tripEnd`, `order=0` on trip create (a trip must always have ≥1 phase). Under the boundary model this is the correct *initial* single tile; the bug was only that it *persisted at whole-trip span* after sub-phases were added — fixed because the create action now retiles. We also rename the seed default to `"Phase 1"` (Task 5) so a sole-phase trip doesn't carry the misleading "Trip" label.
- **Delete hook (`phases.pb.js`) already enforces** (keep): can't delete the last phase (#217); can't delete a phase that still holds `status="unplanned"` items (#196, "Move N ideas first"). Planned items are NOT blocked — but PB clears their `item.phase` to `""` on delete (no cascade), so Task 4 must re-home planned items *before* the delete.
- **Dates are lexically comparable** as `'YYYY-MM-DD'` strings (`'2027-04-19' < '2027-04-21'`). Use string compare throughout; never `new Date()` math for ordering.
- **Trip range** is on `data.trip.start_date` / `end_date` (PB datetime; slice to 10 chars for the day).

## File structure

- **Create:** `src/lib/itinerary/phase-tiling.ts` — pure tiling core (retile + validation). One responsibility: compute the tiled layout and validate proposed boundaries.
- **Create:** `src/lib/itinerary/phase-tiling.test.ts` — Vitest for the core.
- **Create:** `src/lib/itinerary/phase-tiling.server.ts` — thin server helper `applyRetile(pb, tripId, tripEnd)` (persists the diff). Separate file because it imports the PB client type and must never be bundled to the browser.
- **Modify:** `src/routes/(app)/trips/[slug]/phases/+page.server.ts` — `create` (start-only + retile); retire `reorder`; `delete` (re-home + retile).
- **Modify:** `src/routes/(app)/trips/[slug]/phases/[phaseId]/+page.server.ts` — `update` (start-only + retile).
- **Modify:** `src/routes/(app)/trips/[slug]/phases/+page.svelte` — create form: drop end picker; remove reorder up/down buttons.
- **Modify:** `src/routes/(app)/trips/[slug]/phases/[phaseId]/+page.svelte` — edit form: drop end picker; first-phase start locked.
- **Modify:** `backend/pb_hooks/trips.pb.js` — seed phase name `"Trip"` → `"Phase 1"`.
- **Modify:** `docs/SPEC.md` — phases/days notes (tiling invariant + shared boundary).
- **Modify:** `backend/test-rules.mjs` (only if a new rule is added — none expected; the gate is unchanged).

---

## Task 1: Pure tiling core (`phase-tiling.ts`)

**Files:**
- Create: `src/lib/itinerary/phase-tiling.ts`
- Test: `src/lib/itinerary/phase-tiling.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/itinerary/phase-tiling.test.ts
import { describe, it, expect } from 'vitest';
import { toDay, retilePhases, validateNewPhaseStart, validateMovePhaseStart } from './phase-tiling';

describe('toDay', () => {
  it('normalises a PB datetime to YYYY-MM-DD', () => {
    expect(toDay('2027-04-19 00:00:00.000Z')).toBe('2027-04-19');
    expect(toDay('2027-04-19')).toBe('2027-04-19');
  });
});

describe('retilePhases', () => {
  it('sets each end to the next phase start, last to trip end, order by start', () => {
    const out = retilePhases(
      [
        { id: 'krabi', start_date: '2027-04-21' },
        { id: 'trip', start_date: '2027-04-17' },
        { id: 'khao', start_date: '2027-04-19' }
      ],
      '2027-04-24'
    );
    expect(out).toEqual([
      { id: 'trip', start: '2027-04-17', end: '2027-04-19', order: 0 },
      { id: 'khao', start: '2027-04-19', end: '2027-04-21', order: 1 },
      { id: 'krabi', start: '2027-04-21', end: '2027-04-24', order: 2 }
    ]);
  });

  it('a sole phase spans the whole trip', () => {
    expect(retilePhases([{ id: 'a', start_date: '2027-04-17' }], '2027-04-24')).toEqual([
      { id: 'a', start: '2027-04-17', end: '2027-04-24', order: 0 }
    ]);
  });
});

describe('validateNewPhaseStart', () => {
  const tripStart = '2027-04-17', tripEnd = '2027-04-24', starts = ['2027-04-17', '2027-04-19'];
  it('accepts a day strictly inside the trip not already a boundary', () => {
    expect(validateNewPhaseStart('2027-04-21', tripStart, tripEnd, starts)).toBeNull();
  });
  it('rejects the trip start, the trip end, and an existing boundary', () => {
    expect(validateNewPhaseStart('2027-04-17', tripStart, tripEnd, starts)).toMatch(/after the trip begins/);
    expect(validateNewPhaseStart('2027-04-24', tripStart, tripEnd, starts)).toMatch(/before the trip ends/);
    expect(validateNewPhaseStart('2027-04-19', tripStart, tripEnd, starts)).toMatch(/already starts/);
  });
});

describe('validateMovePhaseStart', () => {
  // tiled: trip 17–19, khao 19–21, krabi 21–24
  const tiled = [
    { id: 'trip', start: '2027-04-17', end: '2027-04-19', order: 0 },
    { id: 'khao', start: '2027-04-19', end: '2027-04-21', order: 1 },
    { id: 'krabi', start: '2027-04-21', end: '2027-04-24', order: 2 }
  ];
  it('lets a middle phase move strictly between its neighbours’ starts', () => {
    expect(validateMovePhaseStart('khao', '2027-04-20', tiled, '2027-04-17', '2027-04-24')).toBeNull();
  });
  it('rejects moving onto or past a neighbour boundary', () => {
    expect(validateMovePhaseStart('khao', '2027-04-17', tiled, '2027-04-17', '2027-04-24')).toMatch(/between/);
    expect(validateMovePhaseStart('khao', '2027-04-21', tiled, '2027-04-17', '2027-04-24')).toMatch(/between/);
  });
  it('forbids moving the first phase off the trip start', () => {
    expect(validateMovePhaseStart('trip', '2027-04-18', tiled, '2027-04-17', '2027-04-24')).toMatch(/first phase/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/itinerary/phase-tiling.test.ts`
Expected: FAIL — module not found / functions undefined.

- [ ] **Step 3: Implement the module**

```ts
// src/lib/itinerary/phase-tiling.ts

/** Normalise a PB date or datetime to a bare 'YYYY-MM-DD' day. */
export function toDay(d: string): string {
  return d.slice(0, 10);
}

export interface PhaseStart {
  id: string;
  start_date: string; // PB datetime or 'YYYY-MM-DD'
}

export interface TiledPhase {
  id: string;
  start: string; // 'YYYY-MM-DD'
  end: string; // 'YYYY-MM-DD'
  order: number;
}

/**
 * The tiled layout for a trip's phases: sort by start; each phase's end is the
 * NEXT phase's start (the shared travel/boundary day); the last phase's end is
 * the trip end; order = position. This is the single source of truth for a
 * trip's phase ranges — phases store only their start meaningfully; end + order
 * are derived from this and persisted by applyRetile (see phase-tiling.server).
 */
export function retilePhases(phases: PhaseStart[], tripEnd: string): TiledPhase[] {
  const sorted = phases
    .map((p) => ({ id: p.id, start: toDay(p.start_date) }))
    .sort((a, b) => a.start.localeCompare(b.start));
  const end = toDay(tripEnd);
  return sorted.map((p, i) => ({
    id: p.id,
    start: p.start,
    end: i < sorted.length - 1 ? sorted[i + 1].start : end,
    order: i
  }));
}

/**
 * Validate a proposed start day for a NEW phase. It must fall strictly inside
 * the trip (so it splits an existing segment, leaving ≥1 day on each side) and
 * not coincide with an existing phase boundary. Returns an error message or null.
 */
export function validateNewPhaseStart(
  start: string,
  tripStart: string,
  tripEnd: string,
  existingStarts: string[]
): string | null {
  const s = toDay(start);
  if (s <= toDay(tripStart)) return 'A new phase must start after the trip begins.';
  if (s >= toDay(tripEnd)) return 'A new phase must start before the trip ends.';
  if (existingStarts.map(toDay).includes(s)) return 'A phase already starts on that day.';
  return null;
}

/**
 * Validate moving an EXISTING phase's start. The first phase (lowest start) is
 * pinned to the trip start and cannot move. Any other phase's new start must lie
 * strictly between the previous phase's start and the next boundary (next phase's
 * start, or the trip end for the last phase). Returns an error message or null.
 */
export function validateMovePhaseStart(
  phaseId: string,
  newStart: string,
  tiled: TiledPhase[],
  tripStart: string,
  tripEnd: string
): string | null {
  const s = toDay(newStart);
  const ordered = [...tiled].sort((a, b) => a.start.localeCompare(b.start));
  const idx = ordered.findIndex((p) => p.id === phaseId);
  if (idx === -1) return 'Phase not found.';
  if (idx === 0) {
    return s === toDay(tripStart) ? null : 'The first phase must start when the trip begins.';
  }
  const lower = ordered[idx - 1].start;
  const upper = idx < ordered.length - 1 ? ordered[idx + 1].start : toDay(tripEnd);
  if (s <= lower || s >= upper) {
    return `This phase must start between ${lower} and ${upper}.`;
  }
  return null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run src/lib/itinerary/phase-tiling.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/itinerary/phase-tiling.ts src/lib/itinerary/phase-tiling.test.ts
git commit -m "feat(#323): pure phase-tiling core (retile + boundary validation)"
```

---

## Task 2: Server retile helper + start-only `create`

**Files:**
- Create: `src/lib/itinerary/phase-tiling.server.ts`
- Modify: `src/routes/(app)/trips/[slug]/phases/+page.server.ts:42-90` (`create`)
- Modify: `src/routes/(app)/trips/[slug]/phases/+page.svelte:155-182` (create form date inputs)

- [ ] **Step 1: Write the server helper** (no unit test — thin PB I/O glue; covered by e2e in Task 6)

```ts
// src/lib/itinerary/phase-tiling.server.ts
import type { TypedPocketBase } from '$lib/shell/pb'; // existing client type; if absent, use `import('pocketbase').default`
import { retilePhases, type PhaseStart } from './phase-tiling';

/**
 * Recompute and persist the tiled layout for a trip's phases. Fetches all
 * phases, computes the boundary-model end_date + order for each, and updates
 * only the records whose end or order changed. Call after any phase create,
 * start-edit, or delete. The phases.pb.js update hook re-buckets days off the
 * new ranges, so day membership follows automatically.
 *
 * `tripEnd` is the trip's end_date (PB datetime or YYYY-MM-DD).
 */
export async function applyRetile(
  pb: TypedPocketBase,
  tripId: string,
  tripEnd: string
): Promise<void> {
  const phases = await pb.collection('phases').getFullList({
    filter: `trip = "${tripId}"`,
    fields: 'id,start_date,end_date,order'
  });
  const tiled = retilePhases(phases as PhaseStart[], tripEnd);
  const byId = new Map(phases.map((p) => [p.id, p]));
  for (const t of tiled) {
    const cur = byId.get(t.id);
    if (!cur) continue;
    const curEnd = String(cur.end_date).slice(0, 10);
    const curOrder = Number(cur.order);
    if (curEnd === t.end && curOrder === t.order) continue; // no change
    await pb.collection('phases').update(t.id, {
      end_date: t.end + ' 00:00:00.000Z',
      order: t.order
    });
  }
}
```

- [ ] **Step 2: Rewrite the `create` action to be start-only + retile**

Replace the body of `create` in `phases/+page.server.ts` (the existing version reads `end_date` from the form and validates start<end within-range). New version: no end from the form; validate the start via `validateNewPhaseStart`; create with a placeholder end (`applyRetile` fixes it); then retile.

```ts
// top of file — add imports
import { validateNewPhaseStart, toDay } from '$lib/itinerary/phase-tiling';
import { applyRetile } from '$lib/itinerary/phase-tiling.server';

// create action
create: async ({ request, locals, params }) => {
  const trip = await locals.pb
    .collection('trips')
    .getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
  const data = await request.formData();
  const name = data.get('name')?.toString().trim();
  const location = data.get('location')?.toString().trim() || '';
  const countryCode = data.get('country_code')?.toString().trim() || '';
  const startDate = data.get('start_date')?.toString();
  if (!name) return fail(400, { error: 'Phase name is required.' });
  if (!startDate) return fail(400, { error: 'A start day is required.' });

  const tripStart = toDay(String(trip['start_date']));
  const tripEnd = toDay(String(trip['end_date']));

  const existing = await locals.pb.collection('phases').getFullList({
    filter: `trip = "${trip.id}"`,
    fields: 'start_date'
  });
  const validationError = validateNewPhaseStart(
    startDate,
    tripStart,
    tripEnd,
    existing.map((p) => String(p['start_date']))
  );
  if (validationError) return fail(400, { error: validationError });

  try {
    // Placeholder end = trip end; applyRetile immediately corrects it to the
    // next phase's start. order also corrected by applyRetile.
    await locals.pb.collection('phases').create({
      trip: trip.id,
      name,
      location,
      country_code: countryCode,
      start_date: toDay(startDate) + ' 00:00:00.000Z',
      end_date: tripEnd + ' 00:00:00.000Z',
      order: 0
    });
    await applyRetile(locals.pb, trip.id, tripEnd);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create phase.';
    return fail(500, { error: message });
  }
},
```

- [ ] **Step 3: Make the create form start-only**

In `phases/+page.svelte`, replace the two-column start/end grid (lines 155–182) with a single Start input + a helper line. Remove the End `<input>` entirely.

```svelte
<div>
  <label for="start_date" class="text-ink-soft block text-sm font-medium">Starts</label>
  <input
    type="date"
    id="start_date"
    name="start_date"
    required
    value={tripStart}
    min={tripStart || undefined}
    max={tripEnd || undefined}
    class="border-line bg-surface text-ink mt-1 block w-full min-w-0 rounded-md border px-3 py-2 text-sm"
  />
  <p class="text-ink-muted mt-1 text-xs">Runs until the next phase begins (or the end of the trip).</p>
</div>
```

- [ ] **Step 4: Verify** — `pnpm check` (0 errors) and a manual create at 375px (Task 6 adds the e2e). Confirm: on a fresh trip, "Add phase" shows only a Starts picker; creating one re-tiles (the seed phase's end shrinks to the new start).

- [ ] **Step 5: Commit**

```bash
git add src/lib/itinerary/phase-tiling.server.ts \
  "src/routes/(app)/trips/[slug]/phases/+page.server.ts" \
  "src/routes/(app)/trips/[slug]/phases/+page.svelte"
git commit -m "feat(#323): start-only phase create + retile (kills whole-trip overlap)"
```

> **Slice A boundary (Tasks 1–2): the dogfood bug is fixed for any trip where you add a phase.** Ship/verify here before Slice B if executing incrementally.

---

## Task 3: Start-only `update` (move a boundary)

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/phases/[phaseId]/+page.server.ts:117-156` (`update`)
- Modify: `src/routes/(app)/trips/[slug]/phases/[phaseId]/+page.svelte` (edit form date inputs — mirror Task 2 Step 3; additionally, **lock the start when this is the first phase**)

- [ ] **Step 1: Rewrite `update` to validate + retile**

```ts
// imports
import { retilePhases, validateMovePhaseStart, toDay } from '$lib/itinerary/phase-tiling';
import { applyRetile } from '$lib/itinerary/phase-tiling.server';

update: async ({ request, params, locals }) => {
  const trip = await locals.pb
    .collection('trips')
    .getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
  const data = await request.formData();
  const name = data.get('name')?.toString().trim();
  const location = data.get('location')?.toString().trim() || '';
  const countryCode = data.get('country_code')?.toString().trim() || '';
  const startDate = data.get('start_date')?.toString();
  if (!name) return fail(400, { error: 'Phase name is required.' });
  if (!startDate) return fail(400, { error: 'A start day is required.' });

  const tripStart = toDay(String(trip['start_date']));
  const tripEnd = toDay(String(trip['end_date']));

  const all = await locals.pb.collection('phases').getFullList({
    filter: `trip = "${trip.id}"`,
    fields: 'id,start_date,end_date,order'
  });
  const tiled = retilePhases(all as { id: string; start_date: string }[], tripEnd);
  const moveError = validateMovePhaseStart(params.phaseId, startDate, tiled, tripStart, tripEnd);
  if (moveError) return fail(400, { error: moveError });

  try {
    await locals.pb.collection('phases').update(params.phaseId, {
      name,
      location,
      country_code: countryCode,
      start_date: toDay(startDate) + ' 00:00:00.000Z'
    });
    await applyRetile(locals.pb, trip.id, tripEnd);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update phase.';
    return fail(500, { error: message });
  }
  throw redirect(303, `/trips/${params.slug}/phases`);
},
```

- [ ] **Step 2: Edit form — drop the end picker; lock the first phase's start**

Read `[phaseId]/+page.svelte`. Replace its start/end inputs with the same single Starts input as Task 2 Step 3. Add: when the phase being edited is the trip's first phase (its `start_date` equals the trip start), render the Starts input `disabled` with a note "The first phase always starts when the trip begins." (The page's `load` already returns `phase`; compare `toDay(phase.start_date) === toDay(trip.start_date)` — pass `trip` through `load` if not already present.)

- [ ] **Step 3: Verify** — `pnpm check`; manually move a middle phase's start and confirm both its neighbours' ranges adjust and the days re-bucket.

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(#323): start-only phase edit moves the boundary + retiles"
```

---

## Task 4: `delete` re-homes planned items, then merges

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/phases/+page.server.ts:129-157` (`delete`)

The phases.pb.js delete hook already blocks deleting the last phase and any phase holding unplanned ideas. PLANNED items, though, lose their `phase` (PB clears it, no cascade). Re-home them to the previous neighbour (the phase the deleted span merges into) BEFORE deleting, then retile.

- [ ] **Step 1: Rewrite `delete`**

```ts
import { retilePhases, toDay } from '$lib/itinerary/phase-tiling';
import { applyRetile } from '$lib/itinerary/phase-tiling.server';

delete: async ({ request, locals, params }) => {
  const data = await request.formData();
  const phaseId = data.get('phase_id')?.toString();
  if (!phaseId) return fail(400, { error: 'Missing phase ID.' });

  try {
    const trip = await locals.pb
      .collection('trips')
      .getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
    const tripEnd = toDay(String(trip['end_date']));

    // Determine the merge target: the previous phase by start order. If deleting
    // the first phase, merge forward into the next one instead.
    const all = await locals.pb.collection('phases').getFullList({
      filter: `trip = "${trip.id}"`,
      fields: 'id,start_date'
    });
    const tiled = retilePhases(all as { id: string; start_date: string }[], tripEnd);
    const idx = tiled.findIndex((p) => p.id === phaseId);
    const target = idx > 0 ? tiled[idx - 1] : tiled[idx + 1]; // undefined only if it's the last phase (hook blocks that)

    // Re-home this phase's PLANNED items to the merge target so they aren't
    // stranded phase-less. (Unplanned items are blocked by the delete hook.)
    if (target) {
      const planned = await locals.pb.collection('items').getFullList({
        filter: `phase = "${phaseId}" && status != "unplanned"`,
        fields: 'id'
      });
      for (const it of planned) {
        await locals.pb.collection('items').update(it.id, { phase: target.id });
      }
    }

    await locals.pb.collection('phases').delete(phaseId);
    await applyRetile(locals.pb, trip.id, tripEnd);
    return { success: true };
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; response?: { message?: string } };
    const hookMessage = e.response?.message; // #196 "Move N ideas first"
    if (hookMessage) {
      return fail(e.status && e.status >= 400 && e.status < 500 ? e.status : 400, { error: hookMessage });
    }
    return fail(500, { error: e.message || 'Failed to delete phase.' });
  }
},
```

- [ ] **Step 2: Verify** — delete a middle phase; confirm its planned items now belong to the previous phase, the previous phase's end extends to the deleted phase's old end, and no day is left phase-less. `pnpm check`.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(#323): phase delete merges into neighbour + re-homes planned items"
```

---

## Task 5: Retire reorder; rename the seed default

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/phases/+page.server.ts` (remove the `reorder` action)
- Modify: `src/routes/(app)/trips/[slug]/phases/+page.svelte:230-262` (remove the up/down reorder forms)
- Modify: `backend/pb_hooks/trips.pb.js:119` (`'Trip'` → `'Phase 1'`)

Order is now derived from start (boundary model), so manual reorder is meaningless and would desync `order` from the tiling.

- [ ] **Step 1: Remove the `reorder` action** from `phases/+page.server.ts` (the whole `reorder: async (...) => {...}` block).
- [ ] **Step 2: Remove the two reorder `<form action="?/reorder">` blocks** (up + down chevrons) from `phases/+page.svelte`; keep the delete control. The `{#each data.phases as phase, i}` index `i` is still fine for list rendering.
- [ ] **Step 3: Rename the seed default** in `trips.pb.js`: `seedPhase.set('name', 'Phase 1');`
- [ ] **Step 4: Verify** — `pnpm check`; the phases list renders with no up/down arrows; a brand-new trip's sole phase is named "Phase 1".
- [ ] **Step 5: Commit**

```bash
git commit -am "feat(#323): retire phase reorder (order derived from start); seed → 'Phase 1'"
```

---

## Task 6: Rules + e2e + SPEC reconciliation

**Files:**
- Modify: `docs/SPEC.md` (phases/days notes)
- Create: `tests/e2e/phase-tiling.spec.ts`
- Run: `backend/test-rules.mjs` (expect unchanged pass count — the role gate is untouched)

- [ ] **Step 1: SPEC reconciliation** — in `docs/SPEC.md`, update the `phases` section: phases tile the trip; a phase is defined by its start day, end derived = next phase's start (shared boundary day), last → trip end; `order` derived from start; no manual reorder; no arbitrary overlap. Update the `days` note: a day belongs to exactly one phase, or two on a shared boundary (travel) day. Cross-reference ADR-0021.

- [ ] **Step 2: Write the e2e** (`tests/e2e/phase-tiling.spec.ts`) following the established harness patterns (cerebrum: rules-fixture EMAILS must include `non_member`; resolve ids from `memberIds`; deterministic slug; `:visible` scoping; submit via `input.press('Enter')` if a button is behind the FAB). Cover, on a fresh isolated PB (`:8097`):
  1. New trip seeds exactly one phase named "Phase 1" spanning the whole trip; its day view shows NO "Travel day" pill and ONE parking zone.
  2. Add a phase starting mid-trip → the seed phase's end shrinks to the new start; the boundary day shows the "Travel day" pill + two zones; every other day shows one.
  3. Add a third phase → three tiled segments, two travel days, no day with >2 phases and no phase-less day.
  4. Delete the middle phase → its planned item now belongs to the previous phase; no phase-less day remains.

```ts
// tests/e2e/phase-tiling.spec.ts — skeleton; fill assertions per the harness patterns above
import { test, expect } from '@playwright/test';
// ...set up via /api/dev/rules-fixture (include non_member), derive slug + ids,
// drive the phases UI, assert day.phases membership via the day view's
// "Travel day" pill + parking zone count (scope `:visible`).
```

- [ ] **Step 3: Run the full gate on a fresh PB**

Run:
```bash
pnpm check
pnpm vitest run src/lib/itinerary/phase-tiling.test.ts
PUBLIC_PB_URL=http://127.0.0.1:8097 pnpm test:rules     # via scripts/e2e-clean-pb.sh; expect unchanged count
pnpm test:e2e:clean
```
Expected: check 0 errors; tiling unit green; rules unchanged (gate untouched); e2e green incl. the new spec.

- [ ] **Step 4: Commit**

```bash
git add docs/SPEC.md tests/e2e/phase-tiling.spec.ts
git commit -m "test(#323): phase-tiling e2e + SPEC reconciliation (ADR-0021)"
```

---

## Self-review (run against ADR-0021 before handing off)

1. **Spec coverage:** tiling invariant (Task 1+2), shared travel day kept (derived ends → boundary day in two phases; Task 1), add=split via boundary insert (Task 2), delete=merge + item re-home (Task 4), start-only form / "fewer taps" (Tasks 2–3), seed no longer whole-trip-misleading (Task 5), no migration / manual existing-data cleanup (out of scope by decision — the new editor reshapes existing trips when the owner edits them). ✅ all mapped.
2. **Placeholder scan:** the only stub is the e2e spec body (Task 6 Step 2) — intentionally a skeleton because the harness fixture wiring is pattern-driven and PB-instance-specific; the assertions are enumerated. Acceptable.
3. **Type consistency:** `toDay`, `retilePhases`/`TiledPhase`, `validateNewPhaseStart`, `validateMovePhaseStart`, `applyRetile(pb, tripId, tripEnd)` are used identically across Tasks 1–4. `start`/`end`/`order` field names match the `phases` schema.

**Known follow-ups (NOT this plan):** V2 drag-divider day-strip editor (separate plan — **open it with a Claude Design generation pass**: `claude.ai/design` browser, no auth, to explore 2–3 day-strip editor directions before committing to a build; the MVP form change here needs no such exploration); #324 empty-zone drop (re-verify after this ships); #325 expand affordance.

## Open questions for the executor / PM
- **applyRetile fires the rebucket hook once per changed phase** (N updates → N rebuckets). Correct but not minimal. If it's slow on long trips, batch later — do NOT prematurely optimise.
- **First-phase start lock** (Task 3 Step 2) assumes the lowest-start phase == trip-start phase. Always true once tiling holds; a legacy trip with a gap before its first phase (pre-fix data) would mislabel — acceptable since Scott reshapes legacy trips manually.
