# Timezone Consistency — All Times Trip-Local (Issue #40) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every time in Waypoint trip-local — creation, "now" logic, "today" derivation, and display all interpreted in `trip.timezone` — and fix the latent bug where item times are stored on a 1970 date so the Now/Today logic never matches real data.

**Architecture:** Naive trip-local wall-clock model (decided by maintainer). Item `start_time`/`end_time` store the **real day date + typed time** as a naive-local string written with a `Z` suffix (so PocketBase round-trips it as `YYYY-MM-DD HH:MM:00.000Z`). The same naive string is never converted to a true instant. "Current moment" is obtained via `tripNow(tz)` — a `Date` whose **UTC fields equal the wall clock in the trip's timezone** — so comparing it against item times (also parsed as UTC-naive) is an apples-to-apples wall-clock comparison. No timezone-math dependency: `Intl.DateTimeFormat` with a `sv-SE` locale yields an ISO-like `YYYY-MM-DD HH:MM:SS` rendering of "now in tz", which we parse back as UTC. Display helpers already string-slice the stored value and use `timeZone: 'UTC'`, so they become correct once storage carries the real date.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, PocketBase, Vitest, Playwright. No new dependencies.

---

## Why this is the model (read before starting)

Current state (audited):
- `timeToDatetime(time)` ([src/lib/shell/format.ts:15](../../../src/lib/shell/format.ts)) returns `"1970-01-01 ${time}:00.000Z"` — **the date is hard-coded to 1970**. The owning day lives only in the `day` relation.
- The "now" logic compares those against a real instant:
  - [src/lib/trip-mode/now-state.ts](../../../src/lib/trip-mode/now-state.ts) `findCurrentItem`: `now >= start && now < end` → `2026… >= 1970… && 2026… < 1970…` → **always false**.
  - `findNextTimedItem`: `start > now` → `1970… > 2026…` → **always false**.
- Net effect: the Now view can never reach `mid-event`/`between-things`; it always falls through to `day-wrapped`. Unit tests pass because their fixtures use full real datetimes, not the 1970-pinned production format.

The fix has two halves:
1. **Storage** carries the real date (Tasks 1–2).
2. **"Now"/"today"** are computed in trip-local time and fed into the existing pure functions, whose `getUTC*`/`toISOString` calls become *correct* when the `Date` they receive is `tripNow(tz)` (Tasks 3–6).

Display (Task 7) needs almost no change — verify, don't rewrite.

---

## File Structure

- **Create** `src/lib/shell/trip-time.ts` — the only new module. Holds `tripNow`, `tripToday`, `tripTz`, `combineDateTime`. Pure, dependency-free, unit-tested.
- **Create** `src/lib/shell/trip-time.test.ts` — unit tests for the above.
- **Modify (write path):** `src/routes/(app)/trips/[slug]/items/new/+page.server.ts`, `src/routes/(app)/trips/[slug]/items/[itemId]/edit/+page.server.ts` — combine day date + time on save.
- **Modify (now/today derivation):** `src/routes/(app)/trips/[slug]/now/+page.server.ts`, `src/routes/(app)/trips/[slug]/today/+page.server.ts`, `src/routes/(app)/trips/[slug]/today/upcoming/+page.server.ts`, `src/routes/(app)/trips/+page.server.ts`.
- **Modify (client today derivation):** `src/lib/shell/components/ContextRail.svelte`, `src/lib/shell/components/AppShell.svelte`.
- **Verify-only (display):** `src/lib/shell/format.ts`, `src/lib/shell/trip-nav.ts`, `src/lib/shell/components/DayNav.svelte`, `src/lib/trip-mode/components/TodayTimeline.svelte`.
- **Tests touched:** `src/lib/trip-mode/now-state.test.ts` (add regression test).

The pure functions in `now-state.ts`, `trip-mode.ts`, `activation.ts` are **not edited** — they already use `getUTC*`/`toISOString`, which become correct once callers pass `tripNow(tz)`. This is intentional: minimize blast radius.

---

## Task 1: Core trip-time utility module

**Files:**
- Create: `src/lib/shell/trip-time.ts`
- Test: `src/lib/shell/trip-time.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/shell/trip-time.test.ts
import { describe, it, expect } from 'vitest';
import { tripNow, tripToday, tripTz, combineDateTime } from './trip-time';

describe('tripTz', () => {
	it('returns the trip timezone when set', () => {
		expect(tripTz({ timezone: 'Europe/Madrid' })).toBe('Europe/Madrid');
	});
	it('falls back to UTC when blank', () => {
		expect(tripTz({ timezone: '' })).toBe('UTC');
		expect(tripTz({ timezone: undefined as unknown as string })).toBe('UTC');
	});
});

describe('tripNow', () => {
	// 2026-06-08T22:30:00Z. In Madrid (UTC+2 in summer) the wall clock is 00:30 on Jun 9.
	const instant = new Date('2026-06-08T22:30:00.000Z');

	it('returns a Date whose UTC fields equal the trip-local wall clock', () => {
		const n = tripNow('Europe/Madrid', instant);
		expect(n.getUTCFullYear()).toBe(2026);
		expect(n.getUTCMonth()).toBe(5); // June (0-indexed)
		expect(n.getUTCDate()).toBe(9); // rolled past midnight in Madrid
		expect(n.getUTCHours()).toBe(0);
		expect(n.getUTCMinutes()).toBe(30);
	});

	it('is identity (UTC fields) when tz is UTC', () => {
		const n = tripNow('UTC', instant);
		expect(n.getUTCDate()).toBe(8);
		expect(n.getUTCHours()).toBe(22);
	});
});

describe('tripToday', () => {
	const instant = new Date('2026-06-08T22:30:00.000Z');
	it('gives the trip-local calendar date', () => {
		expect(tripToday('Europe/Madrid', instant)).toBe('2026-06-09');
		expect(tripToday('America/Detroit', instant)).toBe('2026-06-08'); // UTC-4, still 18:30 Jun 8
		expect(tripToday('UTC', instant)).toBe('2026-06-08');
	});
});

describe('combineDateTime', () => {
	it('combines a day date and a time-of-day into a naive-local UTC-suffixed string', () => {
		expect(combineDateTime('2026-06-08', '18:00')).toBe('2026-06-08 18:00:00.000Z');
	});
	it('accepts a day date that carries its own time/zone suffix', () => {
		expect(combineDateTime('2026-06-08 00:00:00.000Z', '09:15')).toBe('2026-06-08 09:15:00.000Z');
	});
	it('returns empty string when either part is missing', () => {
		expect(combineDateTime('', '18:00')).toBe('');
		expect(combineDateTime('2026-06-08', '')).toBe('');
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/shell/trip-time.test.ts`
Expected: FAIL — `Failed to resolve import "./trip-time"`.

- [ ] **Step 3: Implement the module**

```ts
// src/lib/shell/trip-time.ts

/** Resolve the effective timezone for a trip, defaulting to UTC when unset. */
export function tripTz(trip: { timezone?: string }): string {
	return trip.timezone && trip.timezone.trim() ? trip.timezone : 'UTC';
}

/**
 * "Now" expressed as a Date whose UTC fields equal the wall clock in `tz`.
 * This makes it directly comparable to item times, which are stored as
 * naive-local strings parsed as UTC. Uses the sv-SE locale because it renders
 * as ISO-like `YYYY-MM-DD HH:MM:SS`.
 */
export function tripNow(tz: string, now: Date = new Date()): Date {
	const fmt = new Intl.DateTimeFormat('sv-SE', {
		timeZone: tz,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	});
	// sv-SE -> "2026-06-09 00:30:00"
	const s = fmt.format(now).replace(' ', 'T');
	return new Date(s + 'Z');
}

/** Current calendar date in `tz` as `YYYY-MM-DD`. */
export function tripToday(tz: string, now: Date = new Date()): string {
	return tripNow(tz, now).toISOString().split('T')[0];
}

/**
 * Combine a day's date with a time-of-day into the stored naive-local format
 * `YYYY-MM-DD HH:MM:00.000Z`. Returns '' if either part is missing.
 */
export function combineDateTime(dayDate: string, time: string): string {
	if (!dayDate || !time) return '';
	const date = dayDate.split(/[T ]/)[0];
	return `${date} ${time}:00.000Z`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/shell/trip-time.test.ts`
Expected: PASS (all 9 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shell/trip-time.ts src/lib/shell/trip-time.test.ts
git commit -m "feat(#40): trip-local time utilities (tripNow, tripToday, tripTz, combineDateTime)"
```

---

## Task 2: Fix the write path — store the real date

The item create/edit actions currently call `timeToDatetime(startTime)` which produces a 1970 date. Replace with `combineDateTime(dayDate, startTime)`, fetching the owning day's date. Items with no day (parking-lot/unplanned) have no date to anchor to → store `''`.

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/items/new/+page.server.ts` (around line 145)
- Modify: `src/routes/(app)/trips/[slug]/items/[itemId]/edit/+page.server.ts` (around lines 116–117)

- [ ] **Step 1: Update the create action**

In `src/routes/(app)/trips/[slug]/items/new/+page.server.ts`:

Replace the import on line 4:
```ts
import { datetimeToTime } from '$lib/shell/format';
import { combineDateTime } from '$lib/shell/trip-time';
```

After `const day = data.get('day')?.toString() || '';` (line 89) and after `startTime`/`endTime` are read (lines 103–104), resolve the day's date. Add this block immediately before the `payload` object (line 133):
```ts
		// Resolve the owning day's date so item times carry the real calendar
		// date (naive trip-local), not a 1970 placeholder. No day = no anchor.
		let dayDate = '';
		if (day) {
			try {
				const dayRec = await locals.pb.collection('days').getOne(day);
				dayDate = String(dayRec.date || '');
			} catch {
				dayDate = '';
			}
		}
```

Change the payload lines 145–146 from:
```ts
			start_time: timeToDatetime(startTime),
			end_time: timeToDatetime(endTime),
```
to:
```ts
			start_time: combineDateTime(dayDate, startTime),
			end_time: combineDateTime(dayDate, endTime),
```

- [ ] **Step 2: Update the edit action**

In `src/routes/(app)/trips/[slug]/items/[itemId]/edit/+page.server.ts`:

Replace the import on line 4:
```ts
import { datetimeToTime } from '$lib/shell/format';
import { combineDateTime } from '$lib/shell/trip-time';
```

Before the payload is built (near line 116), resolve `dayDate` the same way (the edit action has the submitted `day` value — read it the same way the create action does; if the local variable is named differently, match it):
```ts
		let dayDate = '';
		if (day) {
			try {
				const dayRec = await locals.pb.collection('days').getOne(day);
				dayDate = String(dayRec.date || '');
			} catch {
				dayDate = '';
			}
		}
```

Change lines 116–117 from:
```ts
				start_time: timeToDatetime(startTime),
				end_time: timeToDatetime(endTime),
```
to:
```ts
				start_time: combineDateTime(dayDate, startTime),
				end_time: combineDateTime(dayDate, endTime),
```

> Note: `datetimeToTime` is still used to populate the form's time-of-day input from a stored datetime — it string-matches `HH:MM`, so it keeps working with the new format. Keep that import.

- [ ] **Step 3: Verify nothing references the removed import**

Run: `grep -rn "timeToDatetime" src`
Expected: no results (the function may remain in `format.ts` for now, but no call sites). If `format.ts` still exports it and `pnpm check` is clean, leave it; a follow-up can delete it.

- [ ] **Step 4: Typecheck**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/trips/[slug]/items/new/+page.server.ts" "src/routes/(app)/trips/[slug]/items/[itemId]/edit/+page.server.ts"
git commit -m "fix(#40): store item times on the real day date, not 1970"
```

---

## Task 3: Regression test proving the Now logic works with real data

Lock in the bug fix with a test that uses the **stored format** (real date + time) and a `tripNow`-style now.

**Files:**
- Modify: `src/lib/trip-mode/now-state.test.ts`

- [ ] **Step 1: Add a failing-then-passing regression test**

Append to `src/lib/trip-mode/now-state.test.ts` (reuse the file's existing `makeItem` helper; if its signature differs, adapt the call to set `start_time`/`end_time`/`status`):

```ts
import { tripNow } from '$lib/shell/trip-time';

describe('now-state with real stored datetimes (regression for 1970 bug)', () => {
	it('reaches mid-event when an item spans the current trip-local moment', () => {
		// Instant: 2026-06-08T16:00:00Z. Madrid wall clock = 18:00 Jun 8.
		const now = tripNow('Europe/Madrid', new Date('2026-06-08T16:00:00.000Z'));
		const items = [
			makeItem({
				start_time: '2026-06-08 17:30:00.000Z',
				end_time: '2026-06-08 19:00:00.000Z',
				status: 'planned'
			})
		];
		const state = getNowViewState(items, now, true);
		expect(state.kind).toBe('mid-event');
	});

	it('reaches between-things when the next item is later today', () => {
		const now = tripNow('Europe/Madrid', new Date('2026-06-08T16:00:00.000Z'));
		const items = [
			makeItem({
				start_time: '2026-06-08 20:00:00.000Z',
				end_time: '2026-06-08 21:00:00.000Z',
				status: 'planned'
			})
		];
		const state = getNowViewState(items, now, true);
		expect(state.kind).toBe('between-things');
	});
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm vitest run src/lib/trip-mode/now-state.test.ts`
Expected: PASS. (These pass without touching `now-state.ts` because the pure logic was always correct — it was the *stored data* that was wrong. The test guards against regressions to the storage/`tripNow` contract.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/trip-mode/now-state.test.ts
git commit -m "test(#40): regression test for Now logic against real stored datetimes"
```

---

## Task 4: Feed trip-local "now" into server loads

Each server load that derives "today"/"now" must do so in the trip's timezone and pass `tripNow(tz).toISOString()` to the client.

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/now/+page.server.ts`
- Modify: `src/routes/(app)/trips/[slug]/today/+page.server.ts`
- Modify: `src/routes/(app)/trips/[slug]/today/upcoming/+page.server.ts`

- [ ] **Step 1: now/+page.server.ts**

At the top add:
```ts
import { tripNow, tripTz } from '$lib/shell/trip-time';
```
Replace `const now = new Date();` (line 7) with:
```ts
	const now = tripNow(tripTz(trip));
```
The rest of the file already uses `now.toISOString()` and `now.setUTCDate(...)`, which now operate on trip-local fields. The returned `now: now.toISOString()` is correct for the client. No other change.

- [ ] **Step 2: today/+page.server.ts**

Add the same import. Replace `const now = new Date();` (line 7) with `const now = tripNow(tripTz(trip));`. The existing `todayStr`/upcoming-day loop and `now: now.toISOString()` return become trip-local. No other change.

- [ ] **Step 3: today/upcoming/+page.server.ts**

Add the same import. Replace `const now = new Date();` (line 7) with `const now = tripNow(tripTz(trip));`. Ensure `trip` is in scope (it comes from `await parent()` like the sibling loads); if not already destructured, add it.

- [ ] **Step 4: Typecheck**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/trips/[slug]/now/+page.server.ts" "src/routes/(app)/trips/[slug]/today/+page.server.ts" "src/routes/(app)/trips/[slug]/today/upcoming/+page.server.ts"
git commit -m "fix(#40): derive trip-mode now/today in trip timezone (server loads)"
```

---

## Task 5: Trip-local "today" in the trips list and shell components

**Files:**
- Modify: `src/routes/(app)/trips/+page.server.ts`
- Modify: `src/lib/shell/components/ContextRail.svelte`
- Modify: `src/lib/shell/components/AppShell.svelte`

- [ ] **Step 1: trips/+page.server.ts (per-trip timezone)**

The list sorts/flags trips by "now". Each trip has its own timezone, so compute per trip. Add:
```ts
import { tripToday, tripTz } from '$lib/shell/trip-time';
```
Remove the single `const now = new Date().toISOString().split('T')[0];` (line 11). Where a trip's active/upcoming/past status is computed (inside the `.map`/`.sort` over memberships), derive its own today:
```ts
		const today = tripToday(tripTz(trip)); // trip is the per-membership Trip
```
Use `today` in place of the removed `now` for that trip's date comparisons. (If `now` was referenced in the sort comparator across two trips, compute `tripToday(tripTz(a.trip))` / `tripToday(tripTz(b.trip))` inline for each side.)

- [ ] **Step 2: ContextRail.svelte**

This component receives `days` and (per the trip layout) has access to the trip. Add the import in the `<script>`:
```ts
	import { tripToday, tripTz } from '$lib/shell/trip-time';
```
Replace line 25:
```ts
	const today = $derived(new Date().toISOString().split('T')[0]);
```
with (use the component's trip prop — confirm its name; the trip layout passes `trip`):
```ts
	const today = $derived(tripToday(tripTz(trip)));
```
If `trip` is not already a prop of ContextRail, add it to the `$props()` destructure and pass it from the parent (`AppShell`/trip layout) which already has `trip` in scope.

- [ ] **Step 3: AppShell.svelte**

Add the import:
```ts
	import { tripToday, tripTz } from '$lib/shell/trip-time';
```
Replace the body of `todayDayId` (lines 50–54):
```ts
	const todayDayId = $derived.by(() => {
		const todayStr = tripToday(tripTz(trip));
		const day = days.find((d) => d.date?.split(/[T ]/)[0] === todayStr);
		return day?.id ?? null;
	});
```
`trip` is already available in AppShell (it renders trip chrome); if not, add it to `$props()`.

- [ ] **Step 4: Typecheck**

Run: `pnpm check`
Expected: 0 errors. (If a component lacks `trip`, the error will name it — thread the prop through from the trip `+layout.svelte`.)

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/trips/+page.server.ts" src/lib/shell/components/ContextRail.svelte src/lib/shell/components/AppShell.svelte
git commit -m "fix(#40): trip-local today in trips list, ContextRail, AppShell"
```

---

## Task 6: Display verification (no rewrite expected)

Confirm display helpers render trip-local correctly now that storage carries the real date. These operate on the stored string with `timeZone: 'UTC'`, so they are already correct under the naive-local model. This task is **verify + add a guard test**, not rewrite.

**Files:**
- Verify-only: `src/lib/shell/format.ts` (`formatTime`, `formatTimeRange`), `src/lib/shell/trip-nav.ts` (`formatTripDate`), `src/lib/shell/components/DayNav.svelte`, `src/lib/trip-mode/components/TodayTimeline.svelte`
- Modify: `src/lib/shell/format.test.ts`

- [ ] **Step 1: Add a display guard test**

Append to `src/lib/shell/format.test.ts`:
```ts
import { formatTime, formatTimeRange } from './format';

describe('formatTime with real-dated stored values', () => {
	it('renders the wall-clock time from a full naive-local datetime', () => {
		expect(formatTime('2026-06-08 18:00:00.000Z')).toBe('6:00 PM');
		expect(formatTime('2026-06-08 09:05:00.000Z')).toBe('9:05 AM');
	});
	it('renders a range', () => {
		expect(formatTimeRange('2026-06-08 17:30:00.000Z', '2026-06-08 19:00:00.000Z')).toBe(
			'5:30 PM – 7:00 PM'
		);
	});
});
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run src/lib/shell/format.test.ts`
Expected: PASS (proves `formatTime` is date-agnostic and correct).

- [ ] **Step 3: Manual visual check**

Read `src/lib/shell/components/DayNav.svelte` and `src/lib/trip-mode/components/TodayTimeline.svelte`. Confirm every time/date render goes through `formatTime`/`formatTripDate`/`toLocale*` with `timeZone: 'UTC'` (operating on the stored naive string). If any constructs a `Date` from `start_time` and reads **local** fields (no `timeZone: 'UTC'`), fix that single call to pass `{ timeZone: 'UTC' }`. Note in the commit which, if any, were changed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/shell/format.test.ts
git commit -m "test(#40): guard formatTime/formatTimeRange against real-dated stored values"
```

---

## Task 7: Full verification pass

- [ ] **Step 1: Typecheck**

Run: `pnpm check`
Expected: 0 errors, 0 warnings.

- [ ] **Step 2: Unit tests**

Run: `pnpm vitest run`
Expected: all green, including the new `trip-time`, `now-state` regression, and `format` guard tests.

- [ ] **Step 3: E2E (trip-mode is the critical path)**

Run: `pnpm test:e2e tests/e2e/trip-mode-views.spec.ts`
Expected: PASS. If the spec seeds items, confirm it now exercises the real-dated format; if it hard-codes 1970 datetimes, update the seed to use real dates + the trip's date range.

- [ ] **Step 4: Manual preview at 375px**

Start the dev server (`pnpm dev` + `./backend/start.sh`), open a trip whose dates include "today", and verify via preview tools:
- Now view shows `mid-event` / `between-things` when an item brackets the current trip-local time (previously always `day-wrapped`).
- Today view marks the correct current item.
- Create an item at 6:00 PM on a day; reopen — it still reads 6:00 PM and sits on the right day.

- [ ] **Step 5: Final commit / PR**

```bash
git add -A
git commit -m "chore(#40): verification pass — timezone trip-local complete"
```

Open a PR referencing #40. In the description, call out the **headline fix**: item times were stored on a 1970 date, so the Now/Today "current item" logic never matched real data; this restores it and makes all times trip-local.

---

## Out of scope (do not do here)

- Per-item timezone UI. Flights already carry `start_tz`/`end_tz` from the lookup API; everything else inherits `trip.timezone`. Cross-tz flight *display* (showing departure in origin tz, arrival in destination tz) is a separate enhancement.
- Multi-day items / end-date spanning — that is **Issue #41**, the next session. This plan deliberately makes #41 trivial by storing real dates.
- Deleting the now-unused `timeToDatetime` from `format.ts` — leave for a cleanup PR unless `pnpm check` flags it.
- DST-boundary exactness for true instants — not applicable under the naive-local model.

## Self-review notes

- **Spec coverage:** Schema (timezone fields already exist — verified, no migration needed) ✓; time interpretation (Tasks 1,3,4,5) ✓; time display (Task 6) ✓; time input/storage (Task 2) ✓; trip-mode now/today (Tasks 3,4) ✓; trip-creation timezone capture (already present via `Intl…resolvedOptions().timeZone`, fallback handled by `tripTz`) ✓.
- **Type consistency:** `tripNow(tz, now?)`, `tripToday(tz, now?)`, `tripTz(trip)`, `combineDateTime(dayDate, time)` — names used identically across all tasks.
- **No migration:** `trips.timezone`, `items.start_tz`, `items.end_tz` already exist ([0002_trips.js](../../../backend/pb_migrations/0002_trips.js), [0006_items.js](../../../backend/pb_migrations/0006_items.js)). Existing rows keep 1970-dated times until edited; acceptable (no historical "now" logic runs on past trips). If a backfill is wanted, add an append-only migration in a follow-up — not required here.
