# Day View Timeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat item list on day pages with a continuous timeline layout where anchored items pin by time, untimed items flow between them via sort_order, and drag-to-reorder repositions items.

**Architecture:** Two pure-logic modules (`timeline.ts` for interleaving, `sort-order.ts` for gap-based ordering) with dense Vitest coverage, server actions for reorder/parking-lot moves, and a `DayTimeline.svelte` component that renders the timeline with drag-and-drop. Parking lot renders at bottom on mobile, in ContextRail on desktop.

**Tech Stack:** SvelteKit + TypeScript, Vitest, Tailwind v4, HTML5 Drag & Touch events

---

### Task 1: Timeline interleaving logic

**Files:**
- Create: `src/lib/itinerary/timeline.ts`
- Create: `src/lib/itinerary/timeline.test.ts`

This is pure logic — given an array of items for a day, produce an ordered timeline with anchored items at time positions, untimed items flowing between them, and time-slot dividers.

- [ ] **Step 1: Define types and write the first failing test**

In `src/lib/itinerary/timeline.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildTimeline } from './timeline';
import type { TimelineEntry } from './timeline';
import type { Item } from '$lib/types';
import type { RecordModel } from 'pocketbase';

const base: Omit<Item, 'id' | 'sort_order' | 'start_time' | 'end_time' | 'title' | 'type' | 'status'> & Partial<RecordModel> = {
	trip: 't', phase: 'p', day: 'd', subtype: '', description: '',
	location_name: '', location_address: '', location_coords: null,
	google_place_id: '', start_tz: '', end_tz: '', booked: false,
	booked_by: '', paid_by: '', confirmation_codes: [], reservation_url: '',
	free_cancellation: false, cost_estimate_usd: 0, cost_actual_usd: 0,
	assigned_to: [], parent_item: '', created_by: '',
	collectionId: '', collectionName: 'items', created: '', updated: '',
};

function makeItem(overrides: Partial<Item> & { id: string }): Item {
	return {
		...base,
		sort_order: 0, start_time: '', end_time: '', title: '', type: 'activity', status: 'planned',
		...overrides,
	} as Item;
}

describe('buildTimeline', () => {
	it('returns empty array for no items', () => {
		expect(buildTimeline([])).toEqual([]);
	});

	it('sorts anchored items by start_time', () => {
		const items = [
			makeItem({ id: 'b', title: 'Lunch', start_time: '2026-06-15 12:00:00.000Z', sort_order: 200 }),
			makeItem({ id: 'a', title: 'Breakfast', start_time: '2026-06-15 08:00:00.000Z', sort_order: 100 }),
		];
		const timeline = buildTimeline(items);
		const itemEntries = timeline.filter((e): e is TimelineEntry & { kind: 'item' } => e.kind === 'item');
		expect(itemEntries.map((e) => e.item.id)).toEqual(['a', 'b']);
	});

	it('places untimed items between anchored items by sort_order', () => {
		const items = [
			makeItem({ id: 'anchor1', start_time: '2026-06-15 09:00:00.000Z', sort_order: 100 }),
			makeItem({ id: 'untimed1', sort_order: 150 }),
			makeItem({ id: 'untimed2', sort_order: 200 }),
			makeItem({ id: 'anchor2', start_time: '2026-06-15 14:00:00.000Z', sort_order: 300 }),
		];
		const timeline = buildTimeline(items);
		const itemIds = timeline.filter((e) => e.kind === 'item').map((e) => (e as any).item.id);
		expect(itemIds).toEqual(['anchor1', 'untimed1', 'untimed2', 'anchor2']);
	});

	it('puts all untimed items at end when no anchored items exist', () => {
		const items = [
			makeItem({ id: 'c', sort_order: 300 }),
			makeItem({ id: 'a', sort_order: 100 }),
			makeItem({ id: 'b', sort_order: 200 }),
		];
		const timeline = buildTimeline(items);
		const itemIds = timeline.filter((e) => e.kind === 'item').map((e) => (e as any).item.id);
		expect(itemIds).toEqual(['a', 'b', 'c']);
	});

	it('handles single anchored item with no untimed', () => {
		const items = [makeItem({ id: 'a', start_time: '2026-06-15 10:00:00.000Z', sort_order: 100 })];
		const timeline = buildTimeline(items);
		expect(timeline.filter((e) => e.kind === 'item')).toHaveLength(1);
	});

	it('handles single untimed item', () => {
		const items = [makeItem({ id: 'a', sort_order: 100 })];
		const timeline = buildTimeline(items);
		expect(timeline.filter((e) => e.kind === 'item')).toHaveLength(1);
	});

	it('places untimed items before first anchor if sort_order is lower', () => {
		const items = [
			makeItem({ id: 'untimed', sort_order: 50 }),
			makeItem({ id: 'anchor', start_time: '2026-06-15 10:00:00.000Z', sort_order: 100 }),
		];
		const timeline = buildTimeline(items);
		const itemIds = timeline.filter((e) => e.kind === 'item').map((e) => (e as any).item.id);
		expect(itemIds).toEqual(['untimed', 'anchor']);
	});

	it('places untimed items after last anchor if sort_order is higher', () => {
		const items = [
			makeItem({ id: 'anchor', start_time: '2026-06-15 10:00:00.000Z', sort_order: 100 }),
			makeItem({ id: 'untimed', sort_order: 200 }),
		];
		const timeline = buildTimeline(items);
		const itemIds = timeline.filter((e) => e.kind === 'item').map((e) => (e as any).item.id);
		expect(itemIds).toEqual(['anchor', 'untimed']);
	});

	it('inserts time-slot dividers between morning/afternoon/evening', () => {
		const items = [
			makeItem({ id: 'morning', start_time: '2026-06-15 09:00:00.000Z', sort_order: 100 }),
			makeItem({ id: 'evening', start_time: '2026-06-15 19:00:00.000Z', sort_order: 200 }),
		];
		const timeline = buildTimeline(items);
		const dividers = timeline.filter((e) => e.kind === 'divider');
		expect(dividers.length).toBeGreaterThanOrEqual(1);
		expect(dividers.some((d) => (d as any).label === 'Evening')).toBe(true);
	});

	it('does not insert divider if all items in same slot', () => {
		const items = [
			makeItem({ id: 'a', start_time: '2026-06-15 09:00:00.000Z', sort_order: 100 }),
			makeItem({ id: 'b', start_time: '2026-06-15 10:00:00.000Z', sort_order: 200 }),
		];
		const timeline = buildTimeline(items);
		const dividers = timeline.filter((e) => e.kind === 'divider');
		expect(dividers).toHaveLength(0);
	});
});

describe('detectOverlaps', () => {
	it('returns empty for non-overlapping items', () => {
		const { detectOverlaps } = await import('./timeline');
		const items = [
			makeItem({ id: 'a', start_time: '2026-06-15 09:00:00.000Z', end_time: '2026-06-15 10:00:00.000Z' }),
			makeItem({ id: 'b', start_time: '2026-06-15 11:00:00.000Z', end_time: '2026-06-15 12:00:00.000Z' }),
		];
		expect(detectOverlaps(items)).toEqual(new Set());
	});

	it('detects overlapping anchored items', () => {
		const { detectOverlaps } = await import('./timeline');
		const items = [
			makeItem({ id: 'a', start_time: '2026-06-15 09:00:00.000Z', end_time: '2026-06-15 11:00:00.000Z' }),
			makeItem({ id: 'b', start_time: '2026-06-15 10:00:00.000Z', end_time: '2026-06-15 12:00:00.000Z' }),
		];
		const overlaps = detectOverlaps(items);
		expect(overlaps.has('a')).toBe(true);
		expect(overlaps.has('b')).toBe(true);
	});

	it('ignores items without end_time', () => {
		const { detectOverlaps } = await import('./timeline');
		const items = [
			makeItem({ id: 'a', start_time: '2026-06-15 09:00:00.000Z' }),
			makeItem({ id: 'b', start_time: '2026-06-15 09:30:00.000Z' }),
		];
		expect(detectOverlaps(items)).toEqual(new Set());
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/itinerary/timeline.test.ts`
Expected: FAIL — module `./timeline` does not exist.

- [ ] **Step 3: Implement `buildTimeline` and `detectOverlaps`**

In `src/lib/itinerary/timeline.ts`:

```ts
import type { Item } from '$lib/types';

export interface TimelineItemEntry {
	kind: 'item';
	item: Item;
	anchored: boolean;
}

export interface TimelineDividerEntry {
	kind: 'divider';
	label: 'Morning' | 'Afternoon' | 'Evening';
}

export type TimelineEntry = TimelineItemEntry | TimelineDividerEntry;

function parseTime(dt: string): Date {
	if (!dt) return new Date(0);
	return new Date(dt.replace(' ', 'T'));
}

function getTimeSlot(dt: string): 'morning' | 'afternoon' | 'evening' {
	const hour = parseTime(dt).getUTCHours();
	if (hour < 12) return 'morning';
	if (hour < 17) return 'afternoon';
	return 'evening';
}

const SLOT_LABELS: Record<string, 'Morning' | 'Afternoon' | 'Evening'> = {
	morning: 'Morning',
	afternoon: 'Afternoon',
	evening: 'Evening',
};

/**
 * Build an ordered timeline from a day's items.
 *
 * Anchored items (have start_time) are pinned by time.
 * Untimed items flow between anchored items based on sort_order.
 * Time-slot dividers (Morning/Afternoon/Evening) inserted at boundaries.
 */
export function buildTimeline(items: Item[]): TimelineEntry[] {
	if (items.length === 0) return [];

	const anchored = items
		.filter((i) => i.start_time)
		.sort((a, b) => parseTime(a.start_time).getTime() - parseTime(b.start_time).getTime());

	const untimed = items
		.filter((i) => !i.start_time)
		.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

	if (anchored.length === 0) {
		// All untimed — just return sorted by sort_order
		return untimed.map((item) => ({ kind: 'item' as const, item, anchored: false }));
	}

	// Interleave: place untimed items into gaps between anchored items by sort_order
	const result: TimelineEntry[] = [];
	let untimedIdx = 0;

	for (let i = 0; i < anchored.length; i++) {
		const anchor = anchored[i];
		const anchorOrder = anchor.sort_order ?? 0;

		// Place untimed items whose sort_order falls before this anchor
		while (untimedIdx < untimed.length && (untimed[untimedIdx].sort_order ?? 0) < anchorOrder) {
			result.push({ kind: 'item', item: untimed[untimedIdx], anchored: false });
			untimedIdx++;
		}

		result.push({ kind: 'item', item: anchor, anchored: true });
	}

	// Remaining untimed after last anchor
	while (untimedIdx < untimed.length) {
		result.push({ kind: 'item', item: untimed[untimedIdx], anchored: false });
		untimedIdx++;
	}

	// Insert time-slot dividers between items that cross slot boundaries
	return insertDividers(result);
}

function insertDividers(entries: TimelineEntry[]): TimelineEntry[] {
	if (entries.length === 0) return entries;

	const result: TimelineEntry[] = [];
	let lastSlot: string | null = null;

	for (const entry of entries) {
		if (entry.kind === 'item' && entry.anchored && entry.item.start_time) {
			const slot = getTimeSlot(entry.item.start_time);
			if (lastSlot !== null && slot !== lastSlot) {
				result.push({ kind: 'divider', label: SLOT_LABELS[slot] });
			}
			lastSlot = slot;
		}
		result.push(entry);
	}

	return result;
}

/**
 * Detect overlapping anchored items.
 * Returns a Set of item IDs that overlap with at least one other item.
 * Only considers items with both start_time and end_time.
 */
export function detectOverlaps(items: Item[]): Set<string> {
	const timed = items
		.filter((i) => i.start_time && i.end_time)
		.sort((a, b) => parseTime(a.start_time).getTime() - parseTime(b.start_time).getTime());

	const overlapping = new Set<string>();

	for (let i = 0; i < timed.length; i++) {
		for (let j = i + 1; j < timed.length; j++) {
			const endI = parseTime(timed[i].end_time).getTime();
			const startJ = parseTime(timed[j].start_time).getTime();
			if (startJ < endI) {
				overlapping.add(timed[i].id);
				overlapping.add(timed[j].id);
			} else {
				break; // sorted — no further overlaps possible for i
			}
		}
	}

	return overlapping;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/itinerary/timeline.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/itinerary/timeline.ts src/lib/itinerary/timeline.test.ts
git commit -m "feat(#32): add timeline interleaving logic with overlap detection"
```

---

### Task 2: Sort-order gap operations

**Files:**
- Create: `src/lib/itinerary/sort-order.ts`
- Create: `src/lib/itinerary/sort-order.test.ts`

Pure logic for gap-based sort_order management: initial assignment, midpoint insertion, and rebalancing when gaps close.

- [ ] **Step 1: Write failing tests**

In `src/lib/itinerary/sort-order.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nextSortOrder, insertBetween, rebalance, GAP } from './sort-order';

describe('nextSortOrder', () => {
	it('returns GAP for empty list', () => {
		expect(nextSortOrder([])).toBe(GAP);
	});

	it('returns max + GAP', () => {
		expect(nextSortOrder([100, 200, 300])).toBe(300 + GAP);
	});

	it('handles unsorted input', () => {
		expect(nextSortOrder([300, 100, 200])).toBe(300 + GAP);
	});
});

describe('insertBetween', () => {
	it('returns midpoint of two values', () => {
		expect(insertBetween(100, 200)).toBe(150);
	});

	it('floors to integer', () => {
		expect(insertBetween(100, 201)).toBe(150);
	});

	it('returns midpoint even with small gap', () => {
		expect(insertBetween(100, 102)).toBe(101);
	});

	it('returns null when gap is 1 (needs rebalance)', () => {
		expect(insertBetween(100, 101)).toBeNull();
	});

	it('returns null when values are equal', () => {
		expect(insertBetween(100, 100)).toBeNull();
	});

	it('handles zero as before', () => {
		expect(insertBetween(0, 100)).toBe(50);
	});

	it('inserts before first item (before = null)', () => {
		expect(insertBetween(null, 100)).toBe(50);
	});

	it('inserts after last item (after = null)', () => {
		expect(insertBetween(100, null)).toBe(100 + GAP);
	});
});

describe('rebalance', () => {
	it('assigns gap-based orders to items', () => {
		const ids = ['a', 'b', 'c'];
		const result = rebalance(ids);
		expect(result).toEqual([
			{ id: 'a', sort_order: GAP },
			{ id: 'b', sort_order: GAP * 2 },
			{ id: 'c', sort_order: GAP * 3 },
		]);
	});

	it('handles single item', () => {
		expect(rebalance(['a'])).toEqual([{ id: 'a', sort_order: GAP }]);
	});

	it('handles empty list', () => {
		expect(rebalance([])).toEqual([]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/itinerary/sort-order.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement sort-order operations**

In `src/lib/itinerary/sort-order.ts`:

```ts
/** Gap between sort_order values. New items get multiples of GAP. */
export const GAP = 100;

/**
 * Get the next sort_order for appending an item to a list.
 * Returns max existing + GAP, or GAP if list is empty.
 */
export function nextSortOrder(existing: number[]): number {
	if (existing.length === 0) return GAP;
	return Math.max(...existing) + GAP;
}

/**
 * Calculate sort_order to insert between two values.
 * Returns null if gap is too small (needs rebalance).
 * Pass null for `before` to insert at start, null for `after` to insert at end.
 */
export function insertBetween(before: number | null, after: number | null): number | null {
	if (before === null && after === null) return GAP;
	if (before === null) return Math.floor(after! / 2);
	if (after === null) return before + GAP;

	const mid = Math.floor((before + after) / 2);
	if (mid <= before) return null; // gap too small
	return mid;
}

/**
 * Rebalance sort_order values for a list of item IDs (in desired order).
 * Returns new sort_order assignments with even GAP spacing.
 */
export function rebalance(ids: string[]): { id: string; sort_order: number }[] {
	return ids.map((id, i) => ({ id, sort_order: (i + 1) * GAP }));
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/itinerary/sort-order.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/itinerary/sort-order.ts src/lib/itinerary/sort-order.test.ts
git commit -m "feat(#32): add sort-order gap operations — insert, rebalance"
```

---

### Task 3: Server actions for reorder and parking lot

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/days/[dayId]/+page.server.ts`
- Modify: `src/routes/(app)/trips/[slug]/items/new/+page.server.ts`

Add server actions for drag interactions and update item creation to use gap-based sort_order.

- [ ] **Step 1: Add reorder, pullToPlan, and pushToParking actions to `+page.server.ts`**

Add these actions to the existing `actions` object in `src/routes/(app)/trips/[slug]/days/[dayId]/+page.server.ts`:

```ts
import { rebalance, insertBetween, GAP } from '$lib/itinerary/sort-order';

// ... existing load function stays the same ...

// Add to the existing `actions` object:

	reorder: async ({ request, params, locals }) => {
		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		const beforeOrder = data.get('before_order')?.toString();
		const afterOrder = data.get('after_order')?.toString();

		if (!itemId) return fail(400, { error: 'Missing item ID.' });

		const before = beforeOrder ? Number(beforeOrder) : null;
		const after = afterOrder ? Number(afterOrder) : null;

		let newOrder = insertBetween(before, after);

		if (newOrder === null) {
			// Gap too small — rebalance all items on this day
			const { trip } = await locals.pb.collection('trips').getOne(params.slug, { fields: 'id' });
			const dayItems = await locals.pb.collection('items').getFullList<Item>({
				filter: `day = "${params.dayId}"`,
				sort: 'sort_order',
				fields: 'id,sort_order'
			});

			// Find where the dragged item should go
			const orderedIds = dayItems.filter((i) => i.id !== itemId).map((i) => i.id);
			let insertIdx = 0;
			if (after !== null) {
				const afterIdx = dayItems.findIndex((i) => i.sort_order === after);
				insertIdx = afterIdx >= 0 ? afterIdx : orderedIds.length;
			} else if (before !== null) {
				const beforeIdx = dayItems.findIndex((i) => i.sort_order === before);
				insertIdx = beforeIdx >= 0 ? beforeIdx + 1 : orderedIds.length;
			}
			orderedIds.splice(insertIdx, 0, itemId);

			const updates = rebalance(orderedIds);
			await Promise.all(
				updates.map((u) => locals.pb.collection('items').update(u.id, { sort_order: u.sort_order }))
			);
			return { success: true };
		}

		try {
			await locals.pb.collection('items').update(itemId, { sort_order: newOrder });
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to reorder.';
			return fail(500, { error: message });
		}
	},

	pullToPlan: async ({ request, params, locals }) => {
		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		if (!itemId) return fail(400, { error: 'Missing item ID.' });

		// Get current max sort_order for this day
		const dayItems = await locals.pb.collection('items').getFullList({
			filter: `day = "${params.dayId}"`,
			sort: '-sort_order',
			fields: 'sort_order'
		});
		const newOrder = dayItems.length > 0 ? Number(dayItems[0].sort_order) + GAP : GAP;

		try {
			await locals.pb.collection('items').update(itemId, {
				day: params.dayId,
				status: 'planned',
				sort_order: newOrder
			});
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to add item to day.';
			return fail(500, { error: message });
		}
	},

	pushToParking: async ({ request, locals }) => {
		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		if (!itemId) return fail(400, { error: 'Missing item ID.' });

		try {
			await locals.pb.collection('items').update(itemId, {
				day: '',
				status: 'unplanned',
				sort_order: 0
			});
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to remove item from day.';
			return fail(500, { error: message });
		}
	},
```

Also add the import at the top of the file:
```ts
import { rebalance, insertBetween, GAP } from '$lib/itinerary/sort-order';
```

- [ ] **Step 2: Load parking lot items in the page load function**

Add to the `load` function in the same file, after loading `items`:

```ts
	// Load unplanned items for this trip's phases (parking lot)
	const dayPhases = phasesForDay(day, phases);
	const phaseIds = dayPhases.map((p) => p.id);
	const parkingLotItems =
		phaseIds.length > 0
			? await locals.pb.collection('items').getFullList<Item>({
					filter: `trip = "${trip.id}" && status = "unplanned" && (${phaseIds.map((id) => `phase = "${id}"`).join(' || ')})`,
					sort: 'sort_order'
				})
			: [];
```

Update the return to include `parkingLotItems`:
```ts
	return { day, dayItems: items, dayPhases, voteCounts, parkingLotItems, days: await locals.pb.collection('days').getFullList<Day>({ filter: `trip = "${trip.id}"`, sort: 'date' }) };
```

Wait — `days` is already loaded via the parent layout. Check if we need to re-fetch. If parent already provides `days`, use that:

```ts
	return { day, dayItems: items, dayPhases, voteCounts, parkingLotItems };
```

- [ ] **Step 3: Update item creation to use gap-based sort_order**

In `src/routes/(app)/trips/[slug]/items/new/+page.server.ts`, update the sort_order calculation (~line 206-211):

Replace:
```ts
const existingItems = await locals.pb.collection('items').getFullList({
	filter: `trip = "${trip.id}" && day = "${day}"`,
	sort: '-sort_order',
	fields: 'sort_order'
});
const nextSortOrder = existingItems.length > 0 ? Number(existingItems[0]['sort_order']) + 1 : 0;
```

With:
```ts
import { nextSortOrder as calcNextSortOrder } from '$lib/itinerary/sort-order';

// ... in the action:
const existingItems = await locals.pb.collection('items').getFullList({
	filter: `trip = "${trip.id}" && day = "${day}"`,
	fields: 'sort_order'
});
const nextOrder = calcNextSortOrder(existingItems.map((i) => Number(i.sort_order)));
```

And change the create call to use `sort_order: nextOrder`.

- [ ] **Step 4: Commit**

```bash
git add src/routes/\(app\)/trips/\[slug\]/days/\[dayId\]/+page.server.ts src/routes/\(app\)/trips/\[slug\]/items/new/+page.server.ts
git commit -m "feat(#32): add reorder/pullToPlan/pushToParking server actions, gap-based sort_order"
```

---

### Task 4: DayTimeline Svelte component

**Files:**
- Create: `src/lib/itinerary/components/DayTimeline.svelte`
- Create: `src/lib/itinerary/components/TimelineItemCard.svelte`
- Modify: `src/routes/(app)/trips/[slug]/days/[dayId]/+page.svelte`

Build the visual timeline component and replace the flat list in the day page.

- [ ] **Step 1: Create `TimelineItemCard.svelte`**

In `src/lib/itinerary/components/TimelineItemCard.svelte`:

```svelte
<script lang="ts">
	import type { Item } from '$lib/types';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import Card from '$lib/ui/Card.svelte';
	import { titleCase, formatTime } from '$lib/shell/format';

	let {
		item,
		tripSlug,
		anchored = false,
		overlapping = false,
		draggable = false,
	}: {
		item: Item;
		tripSlug: string;
		anchored?: boolean;
		overlapping?: boolean;
		draggable?: boolean;
	} = $props();
</script>

<div
	class="group relative"
	class:opacity-90={overlapping}
>
	{#if anchored && item.start_time}
		<div class="text-ink-muted absolute -left-16 top-3 hidden text-xs font-mono md-desktop:block">
			{formatTime(item.start_time)}
		</div>
	{/if}

	<Card href="/trips/{tripSlug}/items/{item.id}">
		<div class="flex items-start gap-3 p-3" class:border-l-2={overlapping} class:border-gold={overlapping}>
			{#if draggable && !anchored}
				<div class="text-line flex shrink-0 cursor-grab items-center" aria-label="Drag to reorder">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
						<circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
						<circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
						<circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
					</svg>
				</div>
			{/if}
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
			</div>
		</div>
	</Card>
</div>
```

- [ ] **Step 2: Create `DayTimeline.svelte`**

In `src/lib/itinerary/components/DayTimeline.svelte`:

```svelte
<script lang="ts">
	import type { Item } from '$lib/types';
	import { buildTimeline, detectOverlaps } from '$lib/itinerary/timeline';
	import TimelineItemCard from './TimelineItemCard.svelte';
	import SectionH from '$lib/ui/SectionH.svelte';

	let {
		items,
		tripSlug,
		dayId,
	}: {
		items: Item[];
		tripSlug: string;
		dayId: string;
	} = $props();

	const timeline = $derived(buildTimeline(items));
	const overlaps = $derived(detectOverlaps(items));
</script>

{#if timeline.length === 0}
	<a
		href="/trips/{tripSlug}/items/new?day={dayId}"
		class="border-line text-ink-muted hover:border-ink-muted hover:text-ink-soft block rounded-lg border border-dashed px-3 py-2 text-xs"
	>
		Empty. Tap to add one.
	</a>
{:else}
	<div class="space-y-2">
		{#each timeline as entry}
			{#if entry.kind === 'divider'}
				<div class="flex items-center gap-3 py-1">
					<div class="border-line flex-1 border-t"></div>
					<span class="text-ink-muted text-[11px] font-medium uppercase tracking-wider">{entry.label}</span>
					<div class="border-line flex-1 border-t"></div>
				</div>
			{:else if entry.kind === 'item'}
				<TimelineItemCard
					item={entry.item}
					{tripSlug}
					anchored={entry.anchored}
					overlapping={overlaps.has(entry.item.id)}
					draggable={true}
				/>
			{/if}
		{/each}
	</div>
{/if}
```

- [ ] **Step 3: Update `+page.svelte` to use DayTimeline**

In `src/routes/(app)/trips/[slug]/days/[dayId]/+page.svelte`:

Replace the `<!-- Items -->` section with:

```svelte
<script lang="ts">
	// Add to imports:
	import DayTimeline from '$lib/itinerary/components/DayTimeline.svelte';
	import ParkingLotSection from '$lib/itinerary/components/ParkingLotSection.svelte';

	// Remove unused imports: Item, Pill (if only used in item cards), TypeIcon, titleCase, formatTime
	// Keep: enhance, NavBar, Card, Button, SectionH, FAB, toast, DayNav, PhaseChip
</script>

<!-- Replace the Items section with: -->
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
		items={data.dayItems}
		tripSlug={data.trip.slug}
		dayId={data.day.id}
	/>
</section>

<!-- Parking lot (mobile) -->
{#if data.parkingLotItems && data.parkingLotItems.length > 0}
	<section class="space-y-1.5 lg-desktop:hidden">
		<SectionH>Ideas</SectionH>
		<ParkingLotSection
			items={data.parkingLotItems}
			phases={data.dayPhases}
			tripSlug={data.trip.slug}
		/>
	</section>
{/if}
```

- [ ] **Step 4: Run `pnpm check`**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/itinerary/components/DayTimeline.svelte src/lib/itinerary/components/TimelineItemCard.svelte src/routes/\(app\)/trips/\[slug\]/days/\[dayId\]/+page.svelte
git commit -m "feat(#32): add DayTimeline component with time-slot dividers and overlap indicators"
```

---

### Task 5: Drag-and-drop interactions

**Files:**
- Create: `src/lib/itinerary/components/DragDropTimeline.svelte`
- Modify: `src/lib/itinerary/components/DayTimeline.svelte`
- Modify: `src/routes/(app)/trips/[slug]/days/[dayId]/+page.svelte`

Add touch and mouse drag-and-drop for reordering items and moving between timeline and parking lot. Uses HTML5 drag events with touch polyfill approach (long-press to initiate on mobile).

- [ ] **Step 1: Create drag-drop action helper**

In `src/lib/itinerary/components/DragDropTimeline.svelte`:

This wrapper component handles drag state and drop zone logic. It wraps DayTimeline and ParkingLotSection.

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Item } from '$lib/types';

	let {
		dayItems,
		parkingLotItems = [],
		tripSlug,
		dayId,
		children,
	}: {
		dayItems: Item[];
		parkingLotItems?: Item[];
		tripSlug: string;
		dayId: string;
		children: any;
	} = $props();

	let draggedItemId = $state<string | null>(null);
	let dropTarget = $state<{ before: number | null; after: number | null } | null>(null);
	let dragAction = $state<'reorder' | 'pullToPlan' | 'pushToParking' | null>(null);

	// Form refs for submitting actions
	let reorderForm = $state<HTMLFormElement>();
	let pullForm = $state<HTMLFormElement>();
	let pushForm = $state<HTMLFormElement>();

	function handleDragStart(itemId: string) {
		draggedItemId = itemId;
	}

	function handleDragOver(beforeOrder: number | null, afterOrder: number | null) {
		dropTarget = { before: beforeOrder, after: afterOrder };
	}

	function handleDropOnTimeline() {
		if (!draggedItemId || !dropTarget) return;

		const isParkingItem = parkingLotItems.some((i) => i.id === draggedItemId);

		if (isParkingItem) {
			// Pull from parking lot to timeline
			dragAction = 'pullToPlan';
		} else {
			// Reorder within timeline
			dragAction = 'reorder';
		}

		// Submit the appropriate form on next tick
		setTimeout(() => {
			if (dragAction === 'pullToPlan') pullForm?.requestSubmit();
			else if (dragAction === 'reorder') reorderForm?.requestSubmit();
			reset();
		}, 0);
	}

	function handleDropOnParking() {
		if (!draggedItemId) return;
		dragAction = 'pushToParking';
		setTimeout(() => {
			pushForm?.requestSubmit();
			reset();
		}, 0);
	}

	function reset() {
		draggedItemId = null;
		dropTarget = null;
		dragAction = null;
	}
</script>

<!-- Hidden forms for server actions -->
<form bind:this={reorderForm} method="POST" action="?/reorder" use:enhance class="hidden">
	<input type="hidden" name="item_id" value={draggedItemId ?? ''} />
	<input type="hidden" name="before_order" value={dropTarget?.before?.toString() ?? ''} />
	<input type="hidden" name="after_order" value={dropTarget?.after?.toString() ?? ''} />
</form>

<form bind:this={pullForm} method="POST" action="?/pullToPlan" use:enhance class="hidden">
	<input type="hidden" name="item_id" value={draggedItemId ?? ''} />
</form>

<form bind:this={pushForm} method="POST" action="?/pushToParking" use:enhance class="hidden">
	<input type="hidden" name="item_id" value={draggedItemId ?? ''} />
</form>

{@render children({
	draggedItemId,
	onDragStart: handleDragStart,
	onDragOver: handleDragOver,
	onDropTimeline: handleDropOnTimeline,
	onDropParking: handleDropOnParking,
	onDragEnd: reset,
})}
```

- [ ] **Step 2: Update DayTimeline.svelte with drag handlers**

Add drag event attributes to TimelineItemCard wrappers in DayTimeline.svelte. Each item gets `draggable="true"` and drag event handlers. Between items, invisible drop zones accept drops and report the `before_order` / `after_order` of adjacent items.

Add drag attributes to each item entry in the `{#each}` loop:

```svelte
{:else if entry.kind === 'item'}
	<!-- Drop zone before this item -->
	<div
		class="h-1 transition-all"
		class:h-8={draggedItemId && draggedItemId !== entry.item.id}
		class:bg-moss-tint={/* drop target indicator */false}
		role="listitem"
		ondragover={(e) => { e.preventDefault(); onDragOver(prevOrder, entry.item.sort_order); }}
		ondrop={() => onDropTimeline()}
	></div>

	<div
		draggable={!entry.anchored}
		ondragstart={() => onDragStart(entry.item.id)}
		ondragend={() => onDragEnd()}
	>
		<TimelineItemCard ... />
	</div>
{/if}
```

The exact implementation should wire `onDragStart`, `onDragOver`, `onDropTimeline`, `onDropParking`, and `onDragEnd` from the parent DragDropTimeline through component props.

- [ ] **Step 3: Update `+page.svelte` to use DragDropTimeline wrapper**

Wrap the timeline and parking lot sections with `DragDropTimeline`:

```svelte
<DragDropTimeline
	dayItems={data.dayItems}
	parkingLotItems={data.parkingLotItems}
	tripSlug={data.trip.slug}
	dayId={data.day.id}
>
	{#snippet children({ draggedItemId, onDragStart, onDragOver, onDropTimeline, onDropParking, onDragEnd })}
		<section class="space-y-1.5">
			<SectionH>Items</SectionH>
			<DayTimeline
				items={data.dayItems}
				tripSlug={data.trip.slug}
				dayId={data.day.id}
				{draggedItemId}
				{onDragStart}
				{onDragOver}
				{onDropTimeline}
				{onDragEnd}
			/>
		</section>

		{#if data.parkingLotItems.length > 0}
			<section
				class="space-y-1.5 lg-desktop:hidden"
				ondragover={(e) => e.preventDefault()}
				ondrop={() => onDropParking()}
			>
				<SectionH>Ideas</SectionH>
				<ParkingLotSection items={data.parkingLotItems} phases={data.dayPhases} tripSlug={data.trip.slug} />
			</section>
		{/if}
	{/snippet}
</DragDropTimeline>
```

- [ ] **Step 4: Run `pnpm check`**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/itinerary/components/DragDropTimeline.svelte src/lib/itinerary/components/DayTimeline.svelte src/routes/\(app\)/trips/\[slug\]/days/\[dayId\]/+page.svelte
git commit -m "feat(#32): add drag-and-drop for timeline reorder and parking lot moves"
```

---

### Task 6: Desktop parking lot in ContextRail

**Files:**
- Modify: `src/lib/shell/components/ContextRail.svelte`
- Modify: `src/routes/(app)/trips/[slug]/+layout.server.ts`

On desktop (lg-desktop), show unplanned items in the ContextRail when viewing a day page. The parking lot section at the bottom of the mobile page is hidden on desktop (`lg-desktop:hidden` already set in Task 4).

- [ ] **Step 1: Update layout server to load unplanned items**

In `src/routes/(app)/trips/[slug]/+layout.server.ts`, add unplanned items to the layout data so ContextRail has access:

```ts
const parkingLotItems = await locals.pb.collection('items').getFullList<Item>({
	filter: `trip = "${trip.id}" && status = "unplanned"`,
	sort: 'sort_order'
});
```

Add to the return object: `parkingLotItems`.

- [ ] **Step 2: Update ContextRail to show parking lot on day pages**

In `src/lib/shell/components/ContextRail.svelte`, add a new prop for parking lot items and render them when on a day page:

```svelte
<script lang="ts">
	// Add to props:
	import ParkingLotSection from '$lib/itinerary/components/ParkingLotSection.svelte';
	import type { Item } from '$lib/types';

	let {
		// existing props...
		parkingLotItems = [],
	}: {
		// existing types...
		parkingLotItems?: Item[];
	} = $props();

	// Detect if on a day page
	const isDayPage = $derived(page.url.pathname.includes('/days/'));
</script>

<!-- Add inside the itinerary context section, after "Up Next": -->
{#if isDayPage && parkingLotItems.length > 0}
	<div class="border-line space-y-2 border-t px-5 py-4">
		<h3 class="text-ink-soft text-xs font-semibold uppercase tracking-wider">Ideas</h3>
		<ParkingLotSection items={parkingLotItems} phases={phases} tripSlug={slug} />
	</div>
{/if}
```

- [ ] **Step 3: Wire parkingLotItems through the layout component**

In the trip layout component that renders ContextRail, pass the new data through:

```svelte
<ContextRail {slug} {trip} {phases} {days} parkingLotItems={data.parkingLotItems} />
```

- [ ] **Step 4: Run `pnpm check`**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shell/components/ContextRail.svelte src/routes/\(app\)/trips/\[slug\]/+layout.server.ts
git commit -m "feat(#32): show parking lot in ContextRail on desktop day pages"
```

---

### Task 7: Final verification and visual polish

**Files:**
- No new files — verification pass

- [ ] **Step 1: Run all tests**

```bash
pnpm vitest run
```
Expected: All tests pass (including new timeline and sort-order tests).

- [ ] **Step 2: Run type check**

```bash
pnpm check
```
Expected: 0 errors.

- [ ] **Step 3: Grep for stale references**

```bash
grep -rn 'slotOrder\|itemsForSlot\|sortBySlotThenTime' src/ --include='*.ts' --include='*.svelte' | grep -v node_modules | grep -v '.svelte-kit'
```
Expected: No results.

- [ ] **Step 4: Verify E2E test still passes**

```bash
pnpm test:e2e
```
Expected: Existing E2E tests pass. (New E2E tests for drag interactions are noted in the issue but deferred — drag E2E requires complex touch simulation.)

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "feat(#32): final verification and polish"
```
