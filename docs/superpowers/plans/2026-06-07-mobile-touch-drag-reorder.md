# Mobile Touch Drag-to-Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken native HTML5 drag-and-drop in the day timeline with `svelte-dnd-action` so drag-to-reorder, eject-to-parking, and pull-from-parking all work on iOS touch.

**Architecture:** The day page mounts two `dndzone`s — the timeline and the parking lot — of the same drag type so items move between them. Drag is **handle-only** (the existing grip icon) via svelte-dnd-action's `dragDisabled` toggle pattern, so card taps still open detail and vertical swipes still scroll. The orchestrator component owns the two `items` arrays and translates `consider`/`finalize` events into the existing PocketBase form actions (`reorder` / `pullToPlan` / `pushToParking`). Untimed items reorder freely; timed items are pinned to their clock time (an in-timeline drop snaps back) but may be dragged *out* to the parking lot, which strips their time.

**Tech Stack:** SvelteKit (Svelte 5 runes), `svelte-dnd-action`, PocketBase, Vitest. Milestone: [#2 Phase sub-tab redesign](https://github.com/toxroxmysox/Waypoint/milestone/2). Covers **#60** (touch-drag foundation) + **#87** (eject/pull via per-phase day divider). PRD: `docs/PHASE_REDESIGN_PRD.md`.

---

## ⚠️ EXECUTION REVISION 2026-06-11 (#60) — SUPERSEDES everything below

Revised against `docs/PHASE_REDESIGN_PRD.md` + `gh issue view 60` before execution.
The task list below (Tasks 0–10) is kept as **reference sketch**; the authoritative
ordered build for this session is here. Where they disagree, this wins.

### Scope of THIS session (#60 — touch-drag foundation)

WIRED:
- `resolveDrop()` — complete pure deep module, **all 6 branches**, Vitest every branch.
  The single source of drag semantics. Components/actions are thin around it.
- `buildTimelineFlat()` — flat 1:1 list, reuses `buildTimeline` (→ `orderDayItems`,
  the #120 shared core). No reordering reimplemented.
- `neighborsForMove()` — pure before/after `sort_order` helper.
- `svelte-dnd-action` on the day timeline + a **single, always-present** mobile
  parking drop zone (replaces native HTML5 DnD).
- Handle-only drag (handle lifted OUT of the card `<a>`), iOS callout suppression,
  touch + mouse + keyboard.
- Server actions: `pushToParking` clears `start_time`/`end_time`; `pullToPlan`
  position-aware (before/after).
- Wires the #126 inert handle + pull-up affordances in `ParkingLotSection`.

DEFERRED to #87/#88 (flagged in handoff):
- The collapsed **"Parking lot · N"** day divider (tap-to-expand).
- **Per-phase** drop-target splitting on boundary days (one droppable per phase).
  This session passes the day's full phase-id set to `resolveDrop`; the parking
  zone is one zone. Because the day load unions parking items across all the day's
  phases, every shown idea's phase ∈ dayPhases, so `resolveDrop`'s `reject` branch
  is tested but not UI-exercised yet (#87 splits the zone and exercises it).
- **Parking-internal reorder persistence.** `resolveDrop` returns `reorder` for
  parking→parking (module complete), but the day page does NOT persist it (Phase
  Detail is the canonical idea-reorder home, #88). Visual-only this session.

### `resolveDrop()` — signature + branch table

```ts
type Zone = 'timeline' | 'parking';
interface DropContext {
  source: Zone;
  target: Zone;
  item: { phase: string; start_time: string }; // the moved item
  before: number | null;   // neighbor sort_order at drop pos
  after: number | null;
  dayPhases: string[];     // phase ids the TARGET day belongs to
}
type DropAction =
  | { kind: 'reorder';  before: number | null; after: number | null }
  | { kind: 'pull';     before: number | null; after: number | null }
  | { kind: 'push' }
  | { kind: 'reject' }
  | { kind: 'snapback' };
```

| source   | target   | condition                          | action     | meaning                          |
|----------|----------|------------------------------------|------------|----------------------------------|
| timeline | parking  | —                                  | `push`     | eject → unschedule (strip time)  |
| parking  | timeline | `item.phase ∈ dayPhases`           | `pull`     | schedule idea at drop position   |
| parking  | timeline | `item.phase ∉ dayPhases`           | `reject`   | phase is sticky — refuse pull    |
| timeline | timeline | `item.start_time` truthy (timed)   | `snapback` | clock pins it — revert reorder   |
| timeline | timeline | untimed                            | `reorder`  | reorder by `sort_order`          |
| parking  | parking  | —                                  | `reorder`  | (module complete; UI defers #88) |

### Build order (TDD)
1. `resolveDrop` + test (all branches).
2. `buildTimelineFlat` + test (append to `timeline.test.ts`).
3. `neighborsForMove` + test (new `drag-reorder.ts`).
4. Server actions: `pushToParking` strips time; `pullToPlan` position-aware.
5. `.no-callout` utility; lift handle out of `<a>` in `TimelineItemCard` + `ParkingLotSection`.
6. Rewrite `DragDropTimeline` orchestrator (two zones, delegates to `resolveDrop`).
7. `DayTimeline` → `dndzone`; `ParkingLotSection` → optional `dndzone` drop mode.
8. Wire day page (`+page.svelte`): always-render parking zone; new snippet surface.
9. `pnpm check` + `pnpm test:unit`; preview at 375px.

`resolveDrop` lives in `src/lib/itinerary/drag-reorder.ts` alongside `neighborsForMove`.

---

## ⚠️ REVISED 2026-06-07 — read before executing (pre-phase, partially stale)

This plan was written before the parking-lot IA grill. The PRD supersedes it on four points:

1. **Parking Lot is phase-scoped only.** No trip-wide parking lot. The original "always render the parking section" still holds, but the section shows a **phase's** ideas.
2. **Retiring the trip-wide `/parking-lot` page is NOT in this plan** — it's a separate slice (**#86**, refactor·afk). Do not delete that route here.
3. **The day parking surface is a collapsed, per-phase drop divider** (not the single always-expanded "Ideas" section in original Tasks 8–9). When a day spans two phases, render **one droppable per phase**; a cross-phase pull is **rejected** (phase is sticky). **Tasks 8 & 9 below are SUPERSEDED** — treat them as a starting sketch; the per-phase collapsed-divider design in the PRD (§Solution, §Implementation Decisions) is authoritative. They get their own plan revision when **#87** is executed.
4. **Extract a `resolveDrop()` deep module** (PRD's core testable unit) instead of inlining all drag semantics in the orchestrator's finalize handlers. The PRD specifies its signature and branches; Task 6's inline finalize logic below is the sketch it replaces. Add a Vitest suite for it alongside Tasks 1–2.

Split guidance: **#60** = Tasks 0–7 + 10 (infra, reorder, snapback, callout, `buildTimelineFlat`/`neighborsForMove`/`resolveDrop` + tests). **#87** = the per-phase collapsed divider + eject/pull (supersedes Tasks 8–9). Land #60 first.

---

## ⚠️ Assumption A1 (vetoable before execution)

`svelte-dnd-action` requires the **direct children** of a `dndzone` to map 1:1 to the bound `items` array. Today the timeline interleaves Morning/Afternoon/Evening **divider** rows between items (`insertDividers` in `timeline.ts`), which would break that 1:1 mapping.

**Resolution chosen:** dividers move *inside* each draggable item wrapper — when an item begins a new time slot, its slot label renders above its card within the same dndzone child. The flat `items` array stays 1:1 with DOM children; divider labels are cosmetic and re-derive on every render. A new `buildTimelineFlat()` returns each item plus its `anchored` flag and an optional `slotLabel`.

**Alternative if vetoed:** drop slot dividers from the day timeline entirely (simpler, but a visual regression). If you prefer this, delete Task 1's `slotLabel` logic and render no labels.

---

## File Structure

**Create:**
- `src/lib/itinerary/drag-reorder.ts` — pure helpers: `neighborsForMove()` (compute before/after `sort_order` for a moved item from a flat ordered list).
- `src/lib/itinerary/drag-reorder.test.ts` — Vitest for the above.

**Modify:**
- `package.json` — add `svelte-dnd-action`.
- `src/lib/itinerary/timeline.ts` — add `buildTimelineFlat()` (flat ordered items + `anchored` + `slotLabel`).
- `src/lib/itinerary/timeline.test.ts` — add tests for `buildTimelineFlat()` (create file if absent).
- `src/lib/itinerary/components/DragDropTimeline.svelte` — orchestrator: owns both `items` arrays, drag-enable toggles, consider/finalize handlers, hidden forms.
- `src/lib/itinerary/components/DayTimeline.svelte` — apply `use:dndzone`; render slot labels + handle; remove native drag attrs and manual drop-zone divs.
- `src/lib/itinerary/components/TimelineItemCard.svelte` — lift grip handle outside the `<a>`; add no-callout class.
- `src/lib/itinerary/components/ParkingLotSection.svelte` — optional `use:dndzone` drop mode; no-callout class.
- `src/routes/(app)/trips/[slug]/days/[dayId]/+page.svelte` — always render the parking drop zone during drag (even when empty); pass dndzone wiring.
- `src/routes/(app)/trips/[slug]/days/[dayId]/+page.server.ts` — `pushToParking` clears `start_time`/`end_time`; `pullToPlan` accepts optional `before_order`/`after_order`.
- `src/routes/layout.css` — add `.no-callout` utility.

**Do NOT change:** the `reorder` action (reused as-is), `sort-order.ts`, the dedicated `/parking-lot` page.

---

## Task 0: Install svelte-dnd-action

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

Run: `pnpm add svelte-dnd-action`
Expected: `dependencies` gains `svelte-dnd-action` (^0.9.x), pnpm-lock updated.

- [ ] **Step 2: Verify it resolves for Svelte 5**

Run: `pnpm check`
Expected: no new type errors from the import resolution (the package ships its own types).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: add svelte-dnd-action for touch DnD (#60)"
```

---

## Task 1: `buildTimelineFlat()` — flat ordered items with slot labels

`svelte-dnd-action` needs a flat array. This returns the same display order as `buildTimeline()` (timed items by time, untimed by `sort_order`, interleaved) but without separate divider entries — instead each item carries an optional `slotLabel`.

**Files:**
- Modify: `src/lib/itinerary/timeline.ts`
- Test: `src/lib/itinerary/timeline.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/itinerary/timeline.test.ts` (create the file with this header if it does not exist):

```typescript
import { describe, it, expect } from 'vitest';
import { buildTimelineFlat } from './timeline';
import type { Item } from '$lib/types';

function item(over: Partial<Item>): Item {
	return {
		id: Math.random().toString(36).slice(2),
		title: 't',
		type: 'activity',
		start_time: '',
		end_time: '',
		sort_order: 0,
		status: 'planned',
		day: 'd1'
	} as Item;
}

describe('buildTimelineFlat', () => {
	it('returns untimed items in sort_order with no slot labels', () => {
		const a = item({ id: 'a', sort_order: 200 });
		const b = item({ id: 'b', sort_order: 100 });
		const flat = buildTimelineFlat([a, b]);
		expect(flat.map((e) => e.item.id)).toEqual(['b', 'a']);
		expect(flat.every((e) => !e.anchored)).toBe(true);
		expect(flat.every((e) => e.slotLabel === null)).toBe(true);
	});

	it('marks timed items anchored and labels the first item of each slot', () => {
		const morning = item({ id: 'm', start_time: '2026-06-07 09:00:00', sort_order: 100 });
		const evening = item({ id: 'e', start_time: '2026-06-07 19:00:00', sort_order: 200 });
		const flat = buildTimelineFlat([evening, morning]);
		expect(flat.map((e) => e.item.id)).toEqual(['m', 'e']);
		expect(flat.find((e) => e.item.id === 'm')?.slotLabel).toBe('Morning');
		expect(flat.find((e) => e.item.id === 'e')?.slotLabel).toBe('Evening');
		expect(flat.every((e) => e.anchored)).toBe(true);
	});

	it('interleaves an untimed item between timed anchors by sort_order', () => {
		const t1 = item({ id: 't1', start_time: '2026-06-07 09:00:00', sort_order: 100 });
		const u = item({ id: 'u', sort_order: 150 });
		const t2 = item({ id: 't2', start_time: '2026-06-07 11:00:00', sort_order: 200 });
		const flat = buildTimelineFlat([t1, t2, u]);
		expect(flat.map((e) => e.item.id)).toEqual(['t1', 'u', 't2']);
		expect(flat.find((e) => e.item.id === 'u')?.anchored).toBe(false);
		// the untimed item never carries a slot label
		expect(flat.find((e) => e.item.id === 'u')?.slotLabel).toBe(null);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --run src/lib/itinerary/timeline.test.ts`
Expected: FAIL — `buildTimelineFlat is not a function`.

- [ ] **Step 3: Implement `buildTimelineFlat`**

Add to `src/lib/itinerary/timeline.ts` (reuse the existing private `parseTime`, `getTimeSlot`, `SLOT_LABELS`):

```typescript
export interface FlatTimelineEntry {
	item: Item;
	anchored: boolean;
	slotLabel: 'Morning' | 'Afternoon' | 'Evening' | null;
}

export function buildTimelineFlat(items: Item[]): FlatTimelineEntry[] {
	// Reuse buildTimeline's interleaving, then flatten: drop divider entries and
	// fold each slot change into a slotLabel on the next timed item.
	const entries = buildTimeline(items);
	const result: FlatTimelineEntry[] = [];
	let pendingLabel: 'Morning' | 'Afternoon' | 'Evening' | null = null;
	let labeledFirstSlot = false;

	for (const entry of entries) {
		if (entry.kind === 'divider') {
			pendingLabel = entry.label;
			continue;
		}
		let slotLabel: FlatTimelineEntry['slotLabel'] = null;
		if (entry.anchored && entry.item.start_time) {
			if (pendingLabel) {
				slotLabel = pendingLabel;
				pendingLabel = null;
			} else if (!labeledFirstSlot) {
				slotLabel = SLOT_LABELS[getTimeSlot(entry.item.start_time)];
			}
			labeledFirstSlot = true;
		}
		result.push({ item: entry.item, anchored: entry.anchored, slotLabel });
	}

	return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- --run src/lib/itinerary/timeline.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/itinerary/timeline.ts src/lib/itinerary/timeline.test.ts
git commit -m "feat: buildTimelineFlat for flat dnd list with slot labels (#60)"
```

---

## Task 2: `neighborsForMove()` — derive before/after sort_order from a dropped order

After a drop, svelte-dnd-action gives the new flat order. To persist via the existing `reorder` action we need the moved item's neighbors' `sort_order` values.

**Files:**
- Create: `src/lib/itinerary/drag-reorder.ts`
- Test: `src/lib/itinerary/drag-reorder.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/itinerary/drag-reorder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { neighborsForMove } from './drag-reorder';

const ordered = (...pairs: [string, number][]) =>
	pairs.map(([id, sort_order]) => ({ id, sort_order }));

describe('neighborsForMove', () => {
	it('returns surrounding sort_orders for a middle drop', () => {
		const list = ordered(['a', 100], ['x', 150], ['b', 200]);
		expect(neighborsForMove(list, 'x')).toEqual({ before: 100, after: 200 });
	});

	it('returns null before when dropped first', () => {
		const list = ordered(['x', 50], ['a', 100], ['b', 200]);
		expect(neighborsForMove(list, 'x')).toEqual({ before: null, after: 100 });
	});

	it('returns null after when dropped last', () => {
		const list = ordered(['a', 100], ['b', 200], ['x', 250]);
		expect(neighborsForMove(list, 'x')).toEqual({ before: 200, after: null });
	});

	it('returns both null for a single-item list', () => {
		expect(neighborsForMove(ordered(['x', 100]), 'x')).toEqual({ before: null, after: null });
	});

	it('returns null/null when id absent', () => {
		expect(neighborsForMove(ordered(['a', 100]), 'x')).toEqual({ before: null, after: null });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- --run src/lib/itinerary/drag-reorder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/itinerary/drag-reorder.ts`:

```typescript
export interface OrderedRef {
	id: string;
	sort_order: number;
}

/**
 * Given a flat list in its dropped display order, return the sort_order values
 * immediately before and after `movedId`. Used to feed the `reorder` /
 * `pullToPlan` server actions (which call insertBetween(before, after)).
 */
export function neighborsForMove(
	ordered: OrderedRef[],
	movedId: string
): { before: number | null; after: number | null } {
	const idx = ordered.findIndex((o) => o.id === movedId);
	if (idx === -1) return { before: null, after: null };
	const before = idx > 0 ? ordered[idx - 1].sort_order : null;
	const after = idx < ordered.length - 1 ? ordered[idx + 1].sort_order : null;
	return { before, after };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- --run src/lib/itinerary/drag-reorder.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/itinerary/drag-reorder.ts src/lib/itinerary/drag-reorder.test.ts
git commit -m "feat: neighborsForMove helper for dnd reorder (#60)"
```

---

## Task 3: Server actions — strip time on park, accept drop position on pull

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/days/[dayId]/+page.server.ts`

- [ ] **Step 1: Strip time in `pushToParking`**

Replace the `update` call inside `pushToParking` (currently sets `day`, `status`, `sort_order`) with:

```typescript
			await locals.pb.collection('items').update(itemId, {
				day: '',
				status: 'unplanned',
				sort_order: 0,
				start_time: '',
				end_time: ''
			});
```

- [ ] **Step 2: Honor drop position in `pullToPlan`**

Replace the body of `pullToPlan` (after the `itemId` guard) with a position-aware version that reuses `insertBetween` / `rebalance`:

```typescript
		const beforeRaw = data.get('before_order')?.toString();
		const afterRaw = data.get('after_order')?.toString();
		const before = beforeRaw && !isNaN(Number(beforeRaw)) ? Number(beforeRaw) : null;
		const after = afterRaw && !isNaN(Number(afterRaw)) ? Number(afterRaw) : null;

		let newOrder: number | null;
		if (before === null && after === null) {
			// No position info — append to end (legacy behavior).
			const tail = await locals.pb.collection('items').getFullList({
				filter: `day = "${params.dayId}"`,
				sort: '-sort_order',
				fields: 'sort_order'
			});
			newOrder = tail.length > 0 ? Number(tail[0].sort_order) + GAP : GAP;
		} else {
			newOrder = insertBetween(before, after);
		}

		try {
			if (newOrder === null) {
				// Gap collapsed — rebalance the day then place the item at the end.
				const dayItems = await locals.pb.collection('items').getFullList<Item>({
					filter: `day = "${params.dayId}"`,
					sort: 'sort_order',
					fields: 'id,sort_order'
				});
				const updates = rebalance([...dayItems.map((i) => i.id), itemId]);
				await Promise.all(
					updates.map((u) => locals.pb.collection('items').update(u.id, { sort_order: u.sort_order }))
				);
				await locals.pb.collection('items').update(itemId, { day: params.dayId, status: 'planned' });
			} else {
				await locals.pb.collection('items').update(itemId, {
					day: params.dayId,
					status: 'planned',
					sort_order: newOrder
				});
			}
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to add item to day.';
			return fail(500, { error: message });
		}
```

Confirm `insertBetween` is imported at the top of the file (alongside `GAP`, `rebalance`). If not, add it:

```typescript
import { GAP, insertBetween, rebalance } from '$lib/itinerary/sort-order';
```

- [ ] **Step 3: Type-check**

Run: `pnpm check`
Expected: no errors in `+page.server.ts`.

- [ ] **Step 4: Commit**

```bash
git add "src/routes/(app)/trips/[slug]/days/[dayId]/+page.server.ts"
git commit -m "feat: park strips time, pull honors drop position (#60)"
```

---

## Task 4: `.no-callout` utility + suppress iOS callout on cards

**Files:**
- Modify: `src/routes/layout.css`
- Modify: `src/lib/itinerary/components/TimelineItemCard.svelte`
- Modify: `src/lib/itinerary/components/ParkingLotSection.svelte`

- [ ] **Step 1: Add the utility**

Append to `src/routes/layout.css`:

```css
/* Suppress iOS long-press callout ("Open in New Tab") on internal app cards
   that double as drag sources. See issue #60. */
.no-callout {
	-webkit-touch-callout: none;
	-webkit-user-select: none;
	user-select: none;
}
```

- [ ] **Step 2: Apply to the timeline card wrapper**

In `TimelineItemCard.svelte`, add `no-callout` to the outer wrapper class (line ~28):

```svelte
<div
	class="group relative no-callout"
	class:opacity-90={overlapping}
>
```

- [ ] **Step 3: Apply to parking cards**

In `ParkingLotSection.svelte`, add `no-callout` to the `<Card>` wrapper. Change the `<Card href=...>` opening tag (line ~32) to include a class:

```svelte
				<Card href="/trips/{tripSlug}/items/{item.id}" class="no-callout">
```

(`Card.svelte` already forwards `class` via the `klass` prop.)

- [ ] **Step 4: Verify build**

Run: `pnpm check`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/layout.css src/lib/itinerary/components/TimelineItemCard.svelte src/lib/itinerary/components/ParkingLotSection.svelte
git commit -m "fix: suppress iOS long-press callout on item cards (#60)"
```

---

## Task 5: Lift the grip handle outside the card link

The handle currently sits inside the `<Card href>` `<a>`, so pressing it also navigates. Move it to a sibling of the `<Card>` so the handle and the link are separate hit targets.

**Files:**
- Modify: `src/lib/itinerary/components/TimelineItemCard.svelte`

- [ ] **Step 1: Restructure the card to put the handle beside the link**

Replace the markup (the `<div class="group relative …">…</div>` block) so the grip is a sibling of `<Card>`, laid out as a flex row. The handle receives a `start`-drag callback and stops propagation. New props `onHandlePointerDown` and `dragHandleId` are added:

```svelte
<script lang="ts">
	import type { Item, Vote, TripMember } from '$lib/types';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import Card from '$lib/ui/Card.svelte';
	import VoteStacks from '$lib/collaboration/components/VoteStacks.svelte';
	import { titleCase, formatTime } from '$lib/shell/format';

	let {
		item,
		tripSlug,
		anchored = false,
		overlapping = false,
		draggable = false,
		votes = [],
		members = [],
		onHandlePointerDown = () => {}
	}: {
		item: Item;
		tripSlug: string;
		anchored?: boolean;
		overlapping?: boolean;
		draggable?: boolean;
		votes?: Vote[];
		members?: TripMember[];
		onHandlePointerDown?: (e: Event) => void;
	} = $props();
</script>

<div class="group relative flex items-stretch gap-1 no-callout" class:opacity-90={overlapping}>
	{#if anchored && item.start_time}
		<div class="text-ink-muted absolute -left-16 top-3 hidden text-xs font-mono md-desktop:block">
			{formatTime(item.start_time)}
		</div>
	{/if}

	{#if draggable}
		<button
			type="button"
			class="text-line flex shrink-0 cursor-grab touch-none items-center px-1"
			aria-label="Drag to reorder"
			onpointerdown={(e) => { e.stopPropagation(); onHandlePointerDown(e); }}
			onmousedown={(e) => { e.stopPropagation(); onHandlePointerDown(e); }}
			ontouchstart={(e) => { e.stopPropagation(); onHandlePointerDown(e); }}
		>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
				<circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
				<circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
				<circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
			</svg>
		</button>
	{/if}

	<div class="min-w-0 flex-1">
		<Card href="/trips/{tripSlug}/items/{item.id}">
			<div class="flex items-start gap-3 p-3" class:border-l-2={overlapping} class:border-gold={overlapping}>
				<TypeIcon type={item.type} sub={item.subtype} size={32} />
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<h4 class="text-ink truncate text-sm font-semibold">{item.title}</h4>
						{#if item.booked}
							<Pill variant="booked" size="sm">Booked</Pill>
						{/if}
					</div>
					{#if item.start_time || item.location_name}
						<p class="text-ink-muted mt-0.5 text-[12px]">
							{#if item.start_time}
								<span class="font-mono">{formatTime(item.start_time)}{item.end_time ? ` – ${formatTime(item.end_time)}` : ''}</span>
							{/if}
							{#if item.start_time && item.location_name}<span class="text-line">·</span>{/if}
							{#if item.location_name}{item.location_name}{/if}
						</p>
					{/if}
					{#if item.subtype}
						<p class="text-ink-muted mt-1 text-[11px] uppercase tracking-wide">{titleCase(item.subtype)}</p>
					{/if}
					{#if votes.length}
						<div class="mt-1.5">
							<VoteStacks {votes} {members} size={18} />
						</div>
					{/if}
				</div>
			</div>
		</Card>
	</div>
</div>
```

Note: `draggable` now shows the handle for **both** timed and untimed items (timed items can be dragged out to parking). The `touch-none` class sets `touch-action: none` on the handle so the browser doesn't treat the press as a scroll.

- [ ] **Step 2: Type-check**

Run: `pnpm check`
Expected: no errors (the old `draggable && !anchored` handle condition is gone; the parent now decides when to pass `draggable`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/itinerary/components/TimelineItemCard.svelte
git commit -m "refactor: grip handle is a sibling of the card link (#60)"
```

---

## Task 6: Convert the orchestrator to svelte-dnd-action

Rewrite `DragDropTimeline.svelte` to own both zones' `items` arrays, the per-zone `dragDisabled` flags, the consider/finalize handlers, and the hidden persistence forms. It exposes everything the child renderers need through the existing `children` snippet.

**Files:**
- Modify: `src/lib/itinerary/components/DragDropTimeline.svelte`

- [ ] **Step 1: Replace the component**

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import { SOURCES, TRIGGERS } from 'svelte-dnd-action';
	import type { Snippet } from 'svelte';
	import type { Item } from '$lib/types';
	import { neighborsForMove } from '$lib/itinerary/drag-reorder';

	let {
		dayItems,
		parkingLotItems = [],
		tripSlug,
		dayId,
		children
	}: {
		dayItems: Item[];
		parkingLotItems?: Item[];
		tripSlug: string;
		dayId: string;
		children: Snippet<[{
			timelineItems: Item[];
			parkingItems: Item[];
			timelineDragDisabled: boolean;
			parkingDragDisabled: boolean;
			startDrag: () => void;
			onTimelineConsider: (e: CustomEvent<DndEvent<Item>>) => void;
			onTimelineFinalize: (e: CustomEvent<DndEvent<Item>>) => void;
			onParkingConsider: (e: CustomEvent<DndEvent<Item>>) => void;
			onParkingFinalize: (e: CustomEvent<DndEvent<Item>>) => void;
		}]>;
	} = $props();

	// Local working copies that svelte-dnd-action mutates during drag. Re-seed
	// from server truth whenever the page data changes (after a form action).
	let timelineItems = $state<Item[]>([]);
	let parkingItems = $state<Item[]>([]);
	$effect(() => { timelineItems = [...dayItems]; });
	$effect(() => { parkingItems = [...parkingLotItems]; });

	let timelineDragDisabled = $state(true);
	let parkingDragDisabled = $state(true);

	let reorderForm = $state<HTMLFormElement | undefined>(undefined);
	let pullForm = $state<HTMLFormElement | undefined>(undefined);
	let pushForm = $state<HTMLFormElement | undefined>(undefined);

	// Hidden-form payload, set just before requestSubmit().
	let formItemId = $state('');
	let formBefore = $state('');
	let formAfter = $state('');

	// A handle press enables BOTH zones (the pressed item lives in one of them;
	// svelte-dnd-action grabs whatever is under the pointer).
	function startDrag() {
		timelineDragDisabled = false;
		parkingDragDisabled = false;
	}

	function maybeReDisable(source: number) {
		// Re-lock after a pointer drag so stray taps never start a drag. Keyboard
		// drags re-lock on DRAG_STOPPED instead (handled in consider).
		if (source === SOURCES.POINTER) {
			timelineDragDisabled = true;
			parkingDragDisabled = true;
		}
	}

	function refs(items: Item[]) {
		return items.map((i) => ({ id: i.id, sort_order: i.sort_order ?? 0 }));
	}

	function submitReorder(itemId: string, before: number | null, after: number | null) {
		formItemId = itemId;
		formBefore = before?.toString() ?? '';
		formAfter = after?.toString() ?? '';
		queueMicrotask(() => reorderForm?.requestSubmit());
	}

	function submitPull(itemId: string, before: number | null, after: number | null) {
		formItemId = itemId;
		formBefore = before?.toString() ?? '';
		formAfter = after?.toString() ?? '';
		queueMicrotask(() => pullForm?.requestSubmit());
	}

	function submitPush(itemId: string) {
		formItemId = itemId;
		queueMicrotask(() => pushForm?.requestSubmit());
	}

	function onTimelineConsider(e: CustomEvent<DndEvent<Item>>) {
		timelineItems = e.detail.items;
		const { source, trigger } = e.detail.info;
		if (source === SOURCES.KEYBOARD && trigger === TRIGGERS.DRAG_STOPPED) {
			timelineDragDisabled = true;
			parkingDragDisabled = true;
		}
	}

	function onTimelineFinalize(e: CustomEvent<DndEvent<Item>>) {
		const next = e.detail.items;
		const movedId = e.detail.info.id;
		const wasInTimeline = dayItems.some((i) => i.id === movedId);
		const stillInTimeline = next.some((i) => i.id === movedId);

		timelineItems = next;

		if (stillInTimeline) {
			const moved = next.find((i) => i.id === movedId)!;
			if (!wasInTimeline) {
				// Pulled from parking → schedule it at the drop position.
				const { before, after } = neighborsForMove(refs(next), movedId);
				submitPull(movedId, before, after);
			} else if (moved.start_time) {
				// Timed item reordered in place → not allowed; snap back to truth.
				timelineItems = [...dayItems];
			} else {
				// Untimed reorder.
				const { before, after } = neighborsForMove(refs(next), movedId);
				submitReorder(movedId, before, after);
			}
		}
		// If it left the timeline, the parking zone's finalize handles the push.
		maybeReDisable(e.detail.info.source);
	}

	function onParkingConsider(e: CustomEvent<DndEvent<Item>>) {
		parkingItems = e.detail.items;
		const { source, trigger } = e.detail.info;
		if (source === SOURCES.KEYBOARD && trigger === TRIGGERS.DRAG_STOPPED) {
			timelineDragDisabled = true;
			parkingDragDisabled = true;
		}
	}

	function onParkingFinalize(e: CustomEvent<DndEvent<Item>>) {
		const next = e.detail.items;
		const movedId = e.detail.info.id;
		const wasInParking = parkingLotItems.some((i) => i.id === movedId);
		const nowInParking = next.some((i) => i.id === movedId);

		parkingItems = next;

		if (nowInParking && !wasInParking) {
			// Ejected from timeline → park it (server strips the time).
			submitPush(movedId);
		}
		maybeReDisable(e.detail.info.source);
	}
</script>

<!-- Hidden forms for server actions -->
<form bind:this={reorderForm} method="POST" action="?/reorder" use:enhance class="hidden">
	<input type="hidden" name="item_id" value={formItemId} />
	<input type="hidden" name="before_order" value={formBefore} />
	<input type="hidden" name="after_order" value={formAfter} />
</form>

<form bind:this={pullForm} method="POST" action="?/pullToPlan" use:enhance class="hidden">
	<input type="hidden" name="item_id" value={formItemId} />
	<input type="hidden" name="before_order" value={formBefore} />
	<input type="hidden" name="after_order" value={formAfter} />
</form>

<form bind:this={pushForm} method="POST" action="?/pushToParking" use:enhance class="hidden">
	<input type="hidden" name="item_id" value={formItemId} />
</form>

{@render children({
	timelineItems,
	parkingItems,
	timelineDragDisabled,
	parkingDragDisabled,
	startDrag,
	onTimelineConsider,
	onTimelineFinalize,
	onParkingConsider,
	onParkingFinalize
})}
```

`DndEvent` is a global type shipped by svelte-dnd-action (`src/types`); if `pnpm check` cannot find it, add `import type { DndEvent } from 'svelte-dnd-action';` and use `DndEvent<Item>`.

- [ ] **Step 2: Type-check (will fail at call site — expected until Task 7/8)**

Run: `pnpm check`
Expected: errors only in `DayTimeline.svelte` / `+page.svelte` (old snippet signature). Those are fixed next.

- [ ] **Step 3: Commit**

```bash
git add src/lib/itinerary/components/DragDropTimeline.svelte
git commit -m "feat: dnd orchestrator with two zones + form persistence (#60)"
```

---

## Task 7: Apply `dndzone` in DayTimeline

**Files:**
- Modify: `src/lib/itinerary/components/DayTimeline.svelte`

- [ ] **Step 1: Replace the component**

```svelte
<script lang="ts">
	import { dndzone } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import type { Item, Vote, TripMember } from '$lib/types';
	import { buildTimelineFlat } from '$lib/itinerary/timeline';
	import { detectOverlaps } from '$lib/itinerary/timeline';
	import TimelineItemCard from './TimelineItemCard.svelte';

	let {
		items,
		tripSlug,
		dayId,
		dragDisabled = true,
		votesByItem = {},
		members = [],
		startDrag = () => {},
		onConsider = () => {},
		onFinalize = () => {}
	}: {
		items: Item[];
		tripSlug: string;
		dayId: string;
		dragDisabled?: boolean;
		votesByItem?: Record<string, Vote[]>;
		members?: TripMember[];
		startDrag?: () => void;
		onConsider?: (e: CustomEvent) => void;
		onFinalize?: (e: CustomEvent) => void;
	} = $props();

	const flatById = $derived(
		new Map(buildTimelineFlat(items).map((e) => [e.item.id, e]))
	);
	const overlaps = $derived(detectOverlaps(items));
	const FLIP_MS = 150;
</script>

{#if items.length === 0}
	<a
		href="/trips/{tripSlug}/items/new?day={dayId}"
		class="border-line text-ink-muted hover:border-ink-muted hover:text-ink-soft block rounded-lg border border-dashed px-3 py-2 text-xs"
	>
		Empty. Tap to add one.
	</a>
{:else}
	<section
		class="space-y-2"
		use:dndzone={{ items, dragDisabled, flipDurationMs: FLIP_MS, dropTargetStyle: {} }}
		onconsider={onConsider}
		onfinalize={onFinalize}
	>
		{#each items as item (item.id)}
			{@const meta = flatById.get(item.id)}
			<div animate:flip={{ duration: FLIP_MS }}>
				{#if meta?.slotLabel}
					<div class="flex items-center gap-3 py-1">
						<div class="border-line flex-1 border-t"></div>
						<span class="text-ink-muted text-[11px] font-medium uppercase tracking-wider">{meta.slotLabel}</span>
						<div class="border-line flex-1 border-t"></div>
					</div>
				{/if}
				<TimelineItemCard
					{item}
					{tripSlug}
					anchored={meta?.anchored ?? false}
					overlapping={overlaps.has(item.id)}
					draggable={true}
					votes={votesByItem[item.id] ?? []}
					{members}
					onHandlePointerDown={startDrag}
				/>
			</div>
		{/each}
	</section>
{/if}
```

Notes:
- `items` is bound by reference; svelte-dnd-action reorders it through `onConsider`/`onFinalize` (which the parent owns).
- The `{#each}` is keyed by `item.id` (svelte-dnd-action requirement) and animated with `flip`.
- Every draggable child is a single `<div>` containing the optional slot label + card — preserving the 1:1 child↔item mapping (Assumption A1).

- [ ] **Step 2: Commit**

```bash
git add src/lib/itinerary/components/DayTimeline.svelte
git commit -m "feat: DayTimeline renders a dndzone with slot labels (#60)"
```

---

## Task 8: Parking zone — always a drop target, draggable items

**Files:**
- Modify: `src/lib/itinerary/components/ParkingLotSection.svelte`

Add an optional drag mode. When `dndEnabled`, the section becomes a `dndzone` (always rendered by the caller, even when empty) and its cards expose drag handles.

- [ ] **Step 1: Replace the component**

```svelte
<script lang="ts">
	import { dndzone } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import type { Item, Phase, Vote, TripMember } from '$lib/types';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import Card from '$lib/ui/Card.svelte';
	import VoteStacks from '$lib/collaboration/components/VoteStacks.svelte';
	import { titleCase } from '$lib/shell/format';

	let {
		items,
		phases,
		tripSlug,
		votesByItem = {},
		members = [],
		dndEnabled = false,
		dragDisabled = true,
		startDrag = () => {},
		onConsider = () => {},
		onFinalize = () => {}
	}: {
		items: Item[];
		phases: Phase[];
		tripSlug: string;
		votesByItem?: Record<string, Vote[]>;
		members?: TripMember[];
		dndEnabled?: boolean;
		dragDisabled?: boolean;
		startDrag?: () => void;
		onConsider?: (e: CustomEvent) => void;
		onFinalize?: (e: CustomEvent) => void;
	} = $props();

	const unplannedItems = $derived(dndEnabled ? items : items.filter((i) => i.status === 'unplanned'));
	const FLIP_MS = 150;
</script>

{#if !dndEnabled && unplannedItems.length === 0}
	<p class="text-ink-muted text-sm italic">No parking lot items.</p>
{:else if dndEnabled}
	<section
		class="min-h-[3rem] space-y-1.5 rounded-lg"
		use:dndzone={{ items, dragDisabled, flipDurationMs: FLIP_MS, dropTargetStyle: {} }}
		onconsider={onConsider}
		onfinalize={onFinalize}
	>
		{#each items as item (item.id)}
			<div animate:flip={{ duration: FLIP_MS }} class="no-callout flex items-stretch gap-1">
				<button
					type="button"
					class="text-line flex shrink-0 cursor-grab touch-none items-center px-1"
					aria-label="Drag to reorder"
					onpointerdown={(e) => { e.stopPropagation(); startDrag(); }}
					onmousedown={(e) => { e.stopPropagation(); startDrag(); }}
					ontouchstart={(e) => { e.stopPropagation(); startDrag(); }}
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
						<circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
						<circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
						<circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
					</svg>
				</button>
				<div class="min-w-0 flex-1">
					<Card href="/trips/{tripSlug}/items/{item.id}" class="no-callout">
						<div class="flex items-center gap-3 px-3 py-2">
							<TypeIcon type={item.type} size={18} />
							<div class="min-w-0 flex-1">
								<p class="text-ink truncate text-sm" title={item.title}>{item.title}</p>
								{#if item.location_name}
									<p class="text-ink-muted truncate text-xs">{item.location_name}</p>
								{/if}
								{#if votesByItem[item.id]?.length}
									<div class="mt-1.5">
										<VoteStacks votes={votesByItem[item.id]} {members} size={18} />
									</div>
								{/if}
							</div>
							<span class="bg-paper text-ink-muted shrink-0 rounded px-1.5 py-0.5 text-[11px]">
								{titleCase(item.type)}
							</span>
						</div>
					</Card>
				</div>
			</div>
		{/each}
		{#if unplannedItems.length === 0}
			<p class="text-ink-muted px-2 py-3 text-center text-xs italic">Drag an item here to unschedule it.</p>
		{/if}
	</section>
{:else}
	<section class="space-y-1.5">
		{#each unplannedItems as item (item.id)}
			<Card href="/trips/{tripSlug}/items/{item.id}" class="no-callout">
				<div class="flex items-center gap-3 px-3 py-2">
					<TypeIcon type={item.type} size={18} />
					<div class="min-w-0 flex-1">
						<p class="text-ink truncate text-sm" title={item.title}>{item.title}</p>
						{#if item.location_name}
							<p class="text-ink-muted truncate text-xs">{item.location_name}</p>
						{/if}
						{#if votesByItem[item.id]?.length}
							<div class="mt-1.5">
								<VoteStacks votes={votesByItem[item.id]} {members} size={18} />
							</div>
						{/if}
					</div>
					<span class="bg-paper text-ink-muted shrink-0 rounded px-1.5 py-0.5 text-[11px]">
						{titleCase(item.type)}
					</span>
				</div>
			</Card>
		{/each}
	</section>
{/if}
```

The non-dnd branch (dedicated `/parking-lot` page, desktop rail) is unchanged in behavior. The dnd branch always renders the section with an empty-state prompt so there's a drop target even when parking is empty.

- [ ] **Step 2: Commit**

```bash
git add src/lib/itinerary/components/ParkingLotSection.svelte
git commit -m "feat: parking lot drag mode with persistent empty drop target (#60)"
```

---

## Task 9: Wire the day page

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/days/[dayId]/+page.svelte`

- [ ] **Step 1: Replace the DragDropTimeline block**

Replace the existing `<DragDropTimeline …>` snippet block (the one wiring `onDragStart`/`onDropParking` etc.) with the new prop surface. The mobile parking section now **always renders** (remove the `length > 0` gate) so it's a drop target when empty:

```svelte
	<DragDropTimeline
		dayItems={data.dayItems}
		parkingLotItems={data.parkingLotItems}
		tripSlug={data.trip.slug}
		dayId={data.day.id}
	>
		{#snippet children({ timelineItems, parkingItems, timelineDragDisabled, parkingDragDisabled, startDrag, onTimelineConsider, onTimelineFinalize, onParkingConsider, onParkingFinalize })}
			<!-- Items -->
			<section class="space-y-1.5">
				<SectionH>
					{#snippet right()}
						<a
							href="/trips/{data.trip.slug}/items/new?day={data.day.id}"
							class="text-ink-muted hover:text-ink-soft"
							aria-label="Add item"
						>
							+ Add
						</a>
					{/snippet}
					Items
				</SectionH>

				<DayTimeline
					items={timelineItems}
					tripSlug={data.trip.slug}
					dayId={data.day.id}
					votesByItem={data.votesByItem}
					members={data.members}
					dragDisabled={timelineDragDisabled}
					{startDrag}
					onConsider={onTimelineConsider}
					onFinalize={onTimelineFinalize}
				/>
			</section>

			<!-- Parking lot (mobile/tablet) — always rendered as a drop target -->
			<section class="space-y-1.5 lg-desktop:hidden">
				<SectionH>Parking Lot</SectionH>
				<ParkingLotSection
					items={parkingItems}
					phases={data.dayPhases}
					tripSlug={data.trip.slug}
					dndEnabled={true}
					dragDisabled={parkingDragDisabled}
					{startDrag}
					onConsider={onParkingConsider}
					onFinalize={onParkingFinalize}
				/>
			</section>
		{/snippet}
	</DragDropTimeline>
```

(Renamed the section header from "Ideas" to "Parking Lot" to reconcile the naming split — finding #2 from the parking-lot audit.)

- [ ] **Step 2: Full type-check**

Run: `pnpm check`
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Run unit tests**

Run: `pnpm test:unit -- --run`
Expected: all pass (including Tasks 1–2).

- [ ] **Step 4: Commit**

```bash
git add "src/routes/(app)/trips/[slug]/days/[dayId]/+page.svelte"
git commit -m "feat: wire day page to touch dnd, persistent parking drop zone (#60)"
```

---

## Task 10: Manual mobile verification (preview tools)

Native DnD touch behavior can't be reliably E2E-tested; verify by hand at 375px.

- [ ] **Step 1: Start the backend and dev server**

Run: `./backend/start.sh` (separate shell) and `pnpm dev`. Use preview tools; resize to 375px.

- [ ] **Step 2: Verify each gesture on a day with both timed and untimed items**

Check, capturing a screenshot/snapshot for each:
- Drag handle on an **untimed** item → reorder within the day → order persists after reload.
- Drag an untimed item **down into the Parking Lot** → it moves to parking; the timeline loses it.
- Drag a **timed** item into the Parking Lot → it parks AND its time is gone (reopen detail: no start/end time).
- Attempt to reorder a **timed** item within the timeline → it snaps back to its time anchor.
- Drag a parking item **up into the timeline** at a chosen position → it lands there as an untimed item.
- With parking **empty**, the "Parking Lot" section still shows and accepts a dropped item.
- **Tap** (not drag) a card body → opens item detail (handle didn't hijack the tap).
- **Long-press** a card body → no iOS "Open in New Tab" callout.

- [ ] **Step 3: Check console/network**

Use preview console + network tools: confirm `?/reorder`, `?/pullToPlan`, `?/pushToParking` POST 200 on the matching gestures, no client errors.

- [ ] **Step 4: Desktop regression**

Resize to desktop width: timeline + ContextRail parking still render; mouse drag of the handle still reorders.

- [ ] **Step 5: Commit any fixes, then update OpenWolf logs**

Append the iOS-DnD root cause to `.wolf/cerebrum.md` (Key Learnings) and `.wolf/buglog.json`; record the session in `.wolf/memory.md`; update `.wolf/anatomy.md` for the new `drag-reorder.ts`.

```bash
git add .wolf/
git commit -m "docs: log iOS native-DnD learning + new files (#60)"
```

---

## Self-Review notes (for the executor)

- **Spec coverage:** Goal/Tooling/Affordance (Tasks 5–9), timed-vs-untimed semantics (Task 6 finalize logic), unschedule-strips-time (Task 3), iOS callout (Task 4), persistence via existing form actions (Task 6), empty-parking drop target (Tasks 8–9). All grilled decisions mapped.
- **Type consistency:** `neighborsForMove` returns `{before, after}` (Task 2) consumed in Task 6; `buildTimelineFlat` returns `{item, anchored, slotLabel}` (Task 1) consumed in Task 7; `startDrag`/`onConsider`/`onFinalize` prop names consistent across Tasks 6–9.
- **Known risk:** svelte-dnd-action global `DndEvent` type — if `pnpm check` can't find it, import it explicitly (noted in Task 6 Step 1). If the handle `pointerdown` doesn't start the drag on iOS, fall back to `touchstart` only (already wired) and confirm `touch-action: none` on the handle.
- **Reorder action reused unchanged** — no test changes needed there; new logic is unit-tested in Tasks 1–2.
```