# Schema Cleanup: Hard Cut Migration for v3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align PocketBase schema and TypeScript types with CONTEXT.md v3 terminology — remove `slot`, `parking_lot_scope`, `phase.color`; rename `rank` → `sort_order`; add `unplanned` status and `flight` type.

**Architecture:** Single PB migration (append-only) makes all schema changes. TypeScript types updated to match. Mechanical find-and-replace across ~30 source files. No data preservation needed (hard cut). The `slot` concept is fully removed — day views will be rebuilt in #32 with anchor-time-based timeline. Parking lot filtering switches from `parking_lot_scope` to `status === 'unplanned'`.

**Tech Stack:** PocketBase migrations (JS), SvelteKit + TypeScript, Vitest

---

### Task 1: PocketBase migration

**Files:**
- Create: `backend/pb_migrations/0027_v3_schema_cleanup.js`

- [ ] **Step 1: Write the migration file**

```js
/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const items = app.findCollectionByNameOrId('items');

		// Remove slot field
		items.fields.removeByName('slot');

		// Remove parking_lot_scope field
		items.fields.removeByName('parking_lot_scope');

		// Rename rank → sort_order: add new field, copy data, remove old
		items.fields.add(
			new NumberField({
				name: 'sort_order',
				min: 0,
			})
		);

		// Add 'unplanned' to status enum
		const statusField = items.fields.getByName('status');
		statusField.values = ['planned', 'done', 'considered', 'unplanned'];

		// Add 'flight' to type enum
		const typeField = items.fields.getByName('type');
		typeField.values = ['lodging', 'transportation', 'activity', 'meal', 'note', 'checklist', 'flight'];

		// Update indexes: remove slot-based index, add sort_order index
		items.indexes = items.indexes.filter((idx) => !idx.includes('idx_items_trip_day_slot'));
		items.indexes.push('CREATE INDEX idx_items_trip_day_sort ON items (trip, day, sort_order)');

		app.save(items);

		// Copy rank values to sort_order
		app.db().newQuery('UPDATE items SET sort_order = rank').execute();

		// Now remove old rank field
		const itemsRefresh = app.findCollectionByNameOrId('items');
		itemsRefresh.fields.removeByName('rank');
		app.save(itemsRefresh);

		// Remove color from phases
		const phases = app.findCollectionByNameOrId('phases');
		phases.fields.removeByName('color');
		app.save(phases);
	},
	(app) => {
		// Down migration: restore removed fields
		const items = app.findCollectionByNameOrId('items');

		items.fields.add(
			new SelectField({
				name: 'slot',
				values: ['morning', 'afternoon', 'evening', 'anytime'],
				maxSelect: 1,
			})
		);
		items.fields.add(
			new NumberField({
				name: 'rank',
				min: 0,
			})
		);
		items.fields.add(
			new SelectField({
				name: 'parking_lot_scope',
				values: ['none', 'trip', 'phase', 'day'],
				maxSelect: 1,
			})
		);

		// Restore status without 'unplanned'
		const statusField = items.fields.getByName('status');
		statusField.values = ['planned', 'done', 'considered'];

		// Restore type without 'flight'
		const typeField = items.fields.getByName('type');
		typeField.values = ['lodging', 'transportation', 'activity', 'meal', 'note', 'checklist'];

		// Restore index
		items.indexes = items.indexes.filter((idx) => !idx.includes('idx_items_trip_day_sort'));
		items.indexes.push('CREATE INDEX idx_items_trip_day_slot ON items (trip, day, slot)');

		items.fields.removeByName('sort_order');
		app.save(items);

		// Copy sort_order back to rank (already removed sort_order above, so skip)

		const phases = app.findCollectionByNameOrId('phases');
		phases.fields.add(
			new TextField({
				name: 'color',
				max: 7,
			})
		);
		app.save(phases);
	}
);
```

- [ ] **Step 2: Verify migration applies**

Run: `cd backend && ./start.sh`
Expected: PocketBase starts without migration errors. Check admin UI that `items` collection has `sort_order` (not `rank`), no `slot`, no `parking_lot_scope`. `status` includes `unplanned`. `type` includes `flight`. `phases` has no `color`.

Stop the server after verification.

- [ ] **Step 3: Commit**

```bash
git add backend/pb_migrations/0027_v3_schema_cleanup.js
git commit -m "feat(#31): PB migration — remove slot/parking_lot_scope/color, rename rank→sort_order, add unplanned+flight"
```

---

### Task 2: TypeScript types cleanup

**Files:**
- Modify: `src/lib/itinerary/types.ts`
- Modify: `src/lib/portability/types.ts`

- [ ] **Step 1: Update `src/lib/itinerary/types.ts`**

Remove `Slot` type, `ParkingLotScope` type. Add `'unplanned'` to `ItemStatus`, `'flight'` to `ItemType`. Remove `slot`, `parking_lot_scope` from `Item`. Rename `rank` → `sort_order`. Remove `color` from `Phase`.

The file should become:

```ts
import type { RecordModel } from 'pocketbase';

export interface Trip extends RecordModel {
	slug: string;
	title: string;
	start_date: string;
	end_date: string;
	timezone: string;
	location_summary: string;
	countries: string[];
	cover_image: string;
	photo_album_url: string;
	archive_enabled: boolean;
	archive_publish_after_days: number;
	public_share_token: string;
	auto_approve_suggestions: boolean;
	created_by: string;
	archived: boolean;
	vault_password_hash: string;
}

export interface Phase extends RecordModel {
	trip: string;
	name: string;
	location: string;
	country_code: string;
	start_date: string;
	end_date: string;
	order: number;
}

export interface Day extends RecordModel {
	trip: string;
	phases: string[];
	date: string;
	notes: string;
}

export type ItemType = 'lodging' | 'transportation' | 'activity' | 'meal' | 'note' | 'checklist' | 'flight';
export type ItemStatus = 'planned' | 'done' | 'considered' | 'unplanned';

export interface ConfirmationCode {
	label: string;
	value: string;
}

export interface Item extends RecordModel {
	trip: string;
	phase: string;
	day: string;
	type: ItemType;
	subtype: string;
	title: string;
	description: string;
	location_name: string;
	location_address: string;
	location_coords: { lat: number; lng: number } | null;
	google_place_id: string;
	start_time: string;
	end_time: string;
	start_tz: string;
	end_tz: string;
	status: ItemStatus;
	booked: boolean;
	booked_by: string;
	paid_by: string;
	confirmation_codes: ConfirmationCode[];
	reservation_url: string;
	free_cancellation: boolean;
	cost_estimate_usd: number;
	cost_actual_usd: number;
	assigned_to: string[];
	sort_order: number;
	parent_item: string;
	created_by: string;
}

export interface ChecklistItem extends RecordModel {
	item: string;
	text: string;
	checked_by: string;
	checked_at: string;
	order: number;
}
```

- [ ] **Step 2: Update `src/lib/portability/types.ts`**

Remove `slot` from the items array type in `TripExport`. Remove `color` from the phases array type.

In the `phases` array type, remove:
```ts
		color: string;
```

In the `items` array type, remove:
```ts
		slot: string;
```

- [ ] **Step 3: Run `pnpm check`**

Run: `pnpm check`
Expected: MANY errors — every file referencing `slot`, `rank`, `parking_lot_scope`, `Slot`, `ParkingLotScope`, `phase.color` will fail. This is expected and confirms our types are correct. The errors guide the remaining tasks.

- [ ] **Step 4: Commit**

```bash
git add src/lib/itinerary/types.ts src/lib/portability/types.ts
git commit -m "feat(#31): update TypeScript types — remove slot/parking_lot_scope/color, rename rank→sort_order"
```

---

### Task 3: Item fields config cleanup

**Files:**
- Modify: `src/lib/itinerary/item-fields.ts`
- Modify: `src/lib/itinerary/item-fields.test.ts`
- Modify: `src/lib/itinerary/components/ItemFormFields.ts`

- [ ] **Step 1: Update `src/lib/itinerary/item-fields.ts`**

1. Add `flight` entry to `itemFieldConfig`:
```ts
	flight: {
		subtype: false,
		subtypes: [],
		location: true,
		times: true,
		booking: true,
		costs: true,
		confirmationCodes: true,
		checklist: false,
		parentItem: false
	},
```

2. Add `flight` entry to `itemTypeLabels`:
```ts
	flight: 'Flight',
```

3. Remove `slot` from `FieldDefaults` interface — delete the `slot: string;` line.

4. Remove `slot: 'anytime',` from the defaults object inside `getFieldConfig()`.

5. Remove `slot: defaults.slot,` from `buildEmptyFormData()`.

6. Delete the entire `slotOptions` export at the bottom of the file.

- [ ] **Step 2: Update `src/lib/itinerary/components/ItemFormFields.ts`**

Remove `slot: string;` from `ItemFormData` interface.
Remove `preselectedSlot?: string;` from `ItemFormContext` interface.

- [ ] **Step 3: Update tests in `src/lib/itinerary/item-fields.test.ts`**

Remove or update these tests:
- Delete the test `'slot defaults to anytime'` (line ~81-83)
- In the test `'uses defaults from config: slot, status, booked, costs'` — rename to `'uses defaults from config: status, booked, costs'` and remove the `expect(data.slot)` assertion
- In the `'form data has correct shape for each type'` test — remove `expect(typeof data.slot).toBe('string')` assertion
- Add a test for the new `flight` type:
```ts
	it('returns config for flight type', () => {
		const config = getFieldConfig('flight');
		expect(config.visibility.location).toBe(true);
		expect(config.visibility.times).toBe(true);
		expect(config.visibility.booking).toBe(true);
		expect(config.visibility.subtype).toBe(false);
	});
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/lib/itinerary/item-fields.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/itinerary/item-fields.ts src/lib/itinerary/item-fields.test.ts src/lib/itinerary/components/ItemFormFields.ts
git commit -m "feat(#31): update item-fields config — add flight type, remove slot"
```

---

### Task 4: Trip-mode module cleanup

**Files:**
- Modify: `src/lib/trip-mode/trip-mode.ts`
- Modify: `src/lib/trip-mode/trip-mode.test.ts`

- [ ] **Step 1: Update `src/lib/trip-mode/trip-mode.ts`**

Replace `sortBySlotThenTime` with `sortBySortOrder` — items now sort by `sort_order` then `start_time` (no slot).

Delete `SLOT_ORDER` constant.

Replace the `sortBySlotThenTime` function:
```ts
function sortBySortOrder(items: Item[]): Item[] {
	return [...items].sort((a, b) => {
		const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
		if (orderDiff !== 0) return orderDiff;
		return parseDateTime(a.start_time).getTime() - parseDateTime(b.start_time).getTime();
	});
}
```

Replace all 4 calls to `sortBySlotThenTime(...)` with `sortBySortOrder(...)`.

- [ ] **Step 2: Update `src/lib/trip-mode/trip-mode.test.ts`**

In `makeItem` defaults: remove `slot: 'morning'`, remove `parking_lot_scope: 'none'`, rename `rank: 0` to `sort_order: 0`.

Update test descriptions and assertions:
- Rename `'sorts todayItems by slot order then start_time'` → `'sorts todayItems by sort_order then start_time'`
- Remove `slot` from all `makeItem()` calls
- Update the sorting test to use `sort_order` values instead of slot values:
```ts
	it('sorts todayItems by sort_order then start_time', () => {
		const state = getTripModeState(
			[
				makeItem({ id: 'a', day: 'day1', sort_order: 300 }),
				makeItem({ id: 'b', day: 'day1', sort_order: 100, start_time: '2026-10-15 09:00:00.000Z' }),
				makeItem({ id: 'c', day: 'day1', sort_order: 100, start_time: '2026-10-15 10:00:00.000Z' })
			],
			days,
			now
		);
		expect(state.now.todayItems.map((i) => i.id)).toEqual(['b', 'c', 'a']);
	});
```

- Rename `'sorts tomorrowItems by slot order'` → `'sorts tomorrowItems by sort_order'`
- Update to use `sort_order` values
- Rename `'sorts items within each day group by slot then time'` → `'sorts items within each day group by sort_order then time'`
- Update to use `sort_order` values

- [ ] **Step 3: Run tests**

Run: `pnpm vitest run src/lib/trip-mode/`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/trip-mode/
git commit -m "feat(#31): update trip-mode — sort by sort_order instead of slot"
```

---

### Task 5: Export/import/archive cleanup

**Files:**
- Modify: `src/lib/portability/export.ts`
- Modify: `src/lib/portability/export.test.ts`
- Modify: `src/lib/portability/components/ArchiveDaySection.svelte`
- Modify: `src/routes/(app)/trips/import/+page.server.ts`
- Modify: `src/routes/archive/[token]/+page.server.ts`
- Modify: `src/routes/(app)/trips/[slug]/export/+server.ts`

- [ ] **Step 1: Update `src/lib/portability/export.ts`**

Remove `color: p.color || '',` from the phases mapping (line 35).
Remove `slot: item.slot || 'anytime',` from the items mapping (line 54).

- [ ] **Step 2: Update `src/lib/portability/export.test.ts`**

In the mock item data (~line 52): remove `slot: 'morning'`, remove `parking_lot_scope: 'none'`, rename `rank: 0` to `sort_order: 0`.
In the mock phase data (~line 46): remove `color: '#ff0000'`.
Update assertions to not expect `slot` or `color` in the output.

- [ ] **Step 3: Update `src/lib/portability/components/ArchiveDaySection.svelte`**

This component currently groups items by slot. Replace slot-based grouping with sort_order-based flat list.

Remove the `slotOrder` constant and `itemsBySlot` derived.
Replace with a simple sorted list:
```ts
const sortedItems = $derived([...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
```

Replace the slot-grouped template with a flat iteration:
```svelte
{#each sortedItems as item (item.id)}
	<!-- existing item rendering -->
{/each}
```

Remove the `slot` property from the component's item type (line 10).
Remove the `titleCase(slot)` slot header rendering.
Remove the phase color usage (line 66) — use a fixed color token instead: `style="background-color: var(--color-moss-tint); color: var(--color-moss)"`.

- [ ] **Step 4: Update `src/routes/archive/[token]/+page.server.ts`**

Line 47: Change sort from `'day,slot,order'` to `'day,sort_order'`.
Line 55: Remove `slot: item.slot,` from the item mapping.

- [ ] **Step 5: Update `src/routes/(app)/trips/[slug]/export/+server.ts`**

Line 29: Change sort from `'day,slot,rank'` to `'day,sort_order'`.

- [ ] **Step 6: Update `src/routes/(app)/trips/import/+page.server.ts`**

Line 98: Remove `slot: item.slot || 'anytime',` from the import mapping.

- [ ] **Step 7: Run export tests**

Run: `pnpm vitest run src/lib/portability/`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/portability/ src/routes/archive/ src/routes/\(app\)/trips/import/ src/routes/\(app\)/trips/\[slug\]/export/
git commit -m "feat(#31): update export/import/archive — remove slot/color, use sort_order"
```

---

### Task 6: Item CRUD routes cleanup

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/items/new/+page.server.ts`
- Modify: `src/routes/(app)/trips/[slug]/items/new/+page.svelte`
- Modify: `src/routes/(app)/trips/[slug]/items/[itemId]/+page.server.ts`
- Modify: `src/routes/(app)/trips/[slug]/items/[itemId]/+page.svelte`
- Modify: `src/routes/(app)/trips/[slug]/items/[itemId]/edit/+page.server.ts`
- Modify: `src/routes/(app)/trips/[slug]/items/[itemId]/edit/+page.svelte`

- [ ] **Step 1: Update `src/routes/(app)/trips/[slug]/items/new/+page.server.ts`**

1. Remove `Slot` import and `VALID_SLOTS` constant (lines 3, 6)
2. Remove `slotParam` (line 14) and `preselectedSlot` from the returned data (line 71)
3. Remove `const slot = data.get('slot')...` (line 93) and `slot,` from the create payload (line 140)
4. Rename `rank` → `sort_order` everywhere:
   - Line 213-214: Remove slot from the filter query. Change to `filter: \`trip = "${trip.id}" && day = "${day}"\``
   - Line 215: `sort: '-sort_order'`
   - Line 216: `fields: 'sort_order'`
   - Line 218: `const nextSortOrder = existingItems.length > 0 ? Number(existingItems[0]['sort_order']) + 1 : 0;`
   - Line 222: `sort_order: nextSortOrder,`
5. Remove `parking_lot_scope` from the create payload (line 223). Instead, set `status: day ? 'planned' : 'unplanned'` (replace the existing status logic if needed).

- [ ] **Step 2: Update `src/routes/(app)/trips/[slug]/items/new/+page.svelte`**

Remove `preselectedSlot` from the context passed to ItemForm (line ~104).

- [ ] **Step 3: Update `src/routes/(app)/trips/[slug]/items/[itemId]/+page.server.ts`**

1. Line 40: Remove `slot = "${item.slot}" &&` from the filter. Change to `filter: \`day = "${item.day}" && id != "${item.id}"\``
2. Line 41: Change sort to `'sort_order'`
3. Lines 251-284 (promote/demote actions): Rename all `rank` references to `sort_order`
   - Line 251: `targetItem.sort_order === 0`
   - Line 253: comment update
   - Line 255: `sort_order = 0` in filter
   - Line 260: `{ sort_order: targetItem.sort_order }`
   - Line 262: `{ sort_order: 0 }`
   - Line 275: `targetItem.sort_order !== 0`
   - Line 279: `sort_order > 0` in filter
   - Line 280: `sort: 'sort_order'`
   - Line 283: `alts[alts.length - 1].sort_order + 1`
   - Line 284: `{ sort_order: nextSortOrder }`
4. Line 297: Remove `const newSlot = data.get('slot')...`
5. Line 303: Remove `slot: newSlot,` from the move update payload

- [ ] **Step 4: Update `src/routes/(app)/trips/[slug]/items/[itemId]/+page.svelte`**

1. Line 25: `const isAlternate = $derived(data.item.sort_order > 0);`
2. Line 26: `const isPrimary = $derived(data.item.sort_order === 0 && data.alternates.length > 0);`
3. Line 164: Remove `slot: data.item.slot ?? 'anytime',` from initialData
4. Line 209: Change `Rank {alt.rank}` to `#{alt.sort_order}`
5. Line 469: Remove `currentSlot={data.item.slot}` prop

- [ ] **Step 5: Update `src/routes/(app)/trips/[slug]/items/[itemId]/edit/+page.server.ts`**

1. Line 55: Remove `const slot = data.get('slot')...`
2. Line 104: Remove `slot,` from the update payload
3. Line 119: Remove `parking_lot_scope: day ? 'none' : 'trip'` — replace with `status: day ? 'planned' : 'unplanned'` if the intent is to toggle unplanned status on day removal.

- [ ] **Step 6: Update `src/routes/(app)/trips/[slug]/items/[itemId]/edit/+page.svelte`**

Line 37: Remove `slot: data.item.slot ?? 'anytime',` from initialData.

- [ ] **Step 7: Run `pnpm check`**

Run: `pnpm check`
Expected: Errors should be significantly reduced. Remaining errors will be in components and other routes.

- [ ] **Step 8: Commit**

```bash
git add src/routes/\(app\)/trips/\[slug\]/items/
git commit -m "feat(#31): update item CRUD routes — remove slot, rename rank→sort_order"
```

---

### Task 7: ItemForm and MoveItemSheet cleanup

**Files:**
- Modify: `src/lib/itinerary/components/ItemForm.svelte`
- Modify: `src/lib/itinerary/components/MoveItemSheet.svelte`
- Modify: `src/lib/itinerary/components/InlineQuickAdd.svelte`

- [ ] **Step 1: Update `src/lib/itinerary/components/ItemForm.svelte`**

1. Line 2: Remove `slotOptions` from the import: `import { getFieldConfig } from '$lib/itinerary/item-fields';`
2. Line 137: Remove `· {titleCase(initialData.slot)}` from the subtitle display
3. Lines 418-428: Delete the entire Slot `<select>` block (the `<label for="slot">` through closing `</select>`)

- [ ] **Step 2: Update `src/lib/itinerary/components/MoveItemSheet.svelte`**

1. Line 4: Remove `Slot` from the import: `import type { Day, Phase } from '$lib/types';`
2. Remove the `currentSlot` prop (lines 13, 21)
3. Remove `selectedSlot` state (line 27)
4. Delete the `slotOptions` constant (lines 31-37)
5. Remove slot reset in the effect (line 51)
6. Delete the entire slot select UI (lines 87-98)
7. Remove `slot: newSlot` from the form data / hidden input if present

- [ ] **Step 3: Update `src/lib/itinerary/components/InlineQuickAdd.svelte`**

1. Line 9: Remove `slot,` from the destructured props
2. Line 17: Remove `slot: string;` from the type
3. Line 48: Remove `<input type="hidden" name="slot" value={slot} />`

- [ ] **Step 4: Run `pnpm check`**

Run: `pnpm check`
Expected: Fewer errors remaining.

- [ ] **Step 5: Commit**

```bash
git add src/lib/itinerary/components/
git commit -m "feat(#31): remove slot UI from ItemForm, MoveItemSheet, InlineQuickAdd"
```

---

### Task 8: Day view, today page, closeout, and parking lot cleanup

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/days/[dayId]/+page.svelte`
- Modify: `src/routes/(app)/trips/[slug]/days/[dayId]/+page.server.ts`
- Modify: `src/routes/(app)/trips/[slug]/today/+page.svelte`
- Modify: `src/routes/(app)/trips/[slug]/today/+page.server.ts`
- Modify: `src/routes/(app)/trips/[slug]/today/upcoming/+page.server.ts`
- Modify: `src/routes/(app)/trips/[slug]/closeout/+page.server.ts`
- Modify: `src/lib/itinerary/components/CloseoutDayCard.svelte`
- Modify: `src/lib/itinerary/components/CloseoutItemRow.svelte`
- Modify: `src/lib/itinerary/components/ParkingLotSection.svelte`
- Modify: `src/routes/(app)/trips/[slug]/parking-lot/+page.server.ts`

- [ ] **Step 1: Update `src/routes/(app)/trips/[slug]/days/[dayId]/+page.server.ts`**

Line 22: Change sort from `'slot,rank'` to `'sort_order'`.

- [ ] **Step 2: Update `src/routes/(app)/trips/[slug]/days/[dayId]/+page.svelte`**

This currently groups items by slot. Replace with a flat sorted list (items already sorted by sort_order from server).

1. Remove `Slot` import (line 3)
2. Delete `slots` constant (lines 22-28) and `itemsForSlot` function (lines 29-31)
3. Replace the slot-grouped `{#each slots as slot}` template with a flat item list. Keep the existing item card rendering, just remove the slot grouping wrapper and slot headers.
4. Update the "Add item" link: remove `&slot={slot.id}` from the href

- [ ] **Step 3: Update `src/routes/(app)/trips/[slug]/today/+page.svelte`**

Same pattern as day view — replace slot grouping with flat list.

1. Remove `Slot` import (line 2)
2. Delete `slots` constant (lines 22-28) and `itemsForSlot` function (lines 29-31)
3. Replace slot-grouped template with flat iteration over `tripMode.now.todayItems`
4. Line 112: Remove `item.slot` fallback display

- [ ] **Step 4: Update sort strings in server files**

- `src/routes/(app)/trips/[slug]/today/+page.server.ts` line 28: `'day,start_time,sort_order'`
- `src/routes/(app)/trips/[slug]/today/upcoming/+page.server.ts` line 21: `'day,start_time,sort_order'`
- `src/routes/(app)/trips/[slug]/closeout/+page.server.ts` line 14: `'day,sort_order'`

- [ ] **Step 5: Update `src/routes/(app)/trips/[slug]/closeout/+page.server.ts`**

1. Line 55: Remove `const slot = data.get('slot')...`
2. Line 70: Remove `slot,` from the create payload
3. Line 75: Rename `rank: 999` to `sort_order: 999`

- [ ] **Step 6: Update `src/lib/itinerary/components/CloseoutDayCard.svelte`**

Replace slot-based grouping with sort_order-based flat list (same pattern as ArchiveDaySection in Task 5).

1. Delete `slotOrder` constant (line 34) and `itemsBySlot` derived (lines 36-43)
2. Add: `const sortedItems = $derived([...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));`
3. Replace slot-grouped template with flat iteration over `sortedItems`
4. Remove slot header display

- [ ] **Step 7: Update `src/lib/itinerary/components/CloseoutItemRow.svelte`**

Line 100: Remove `slot={item.slot}` prop passed to InlineQuickAdd.

- [ ] **Step 8: Update `src/lib/itinerary/components/ParkingLotSection.svelte`**

Replace `parking_lot_scope`-based filtering with `status`-based filtering.

Lines 20-22: Replace:
```ts
const tripLevel = $derived(items.filter((i) => i.parking_lot_scope === 'trip'));
const phaseLevel = $derived(items.filter((i) => i.parking_lot_scope === 'phase'));
const dayLevel = $derived(items.filter((i) => i.parking_lot_scope === 'day'));
```
With:
```ts
const unplannedItems = $derived(items.filter((i) => i.status === 'unplanned'));
```

Update the template to render a single flat list of unplanned items instead of three scope-based groups.

- [ ] **Step 9: Update `src/routes/(app)/trips/[slug]/parking-lot/+page.server.ts`**

Line 8: Change filter from `parking_lot_scope = "trip" || parking_lot_scope = "phase" || parking_lot_scope = "day"` to `status = "unplanned"`.

- [ ] **Step 10: Run `pnpm check`**

Run: `pnpm check`
Expected: Should be close to zero errors now.

- [ ] **Step 11: Commit**

```bash
git add src/routes/\(app\)/trips/\[slug\]/days/ src/routes/\(app\)/trips/\[slug\]/today/ src/routes/\(app\)/trips/\[slug\]/closeout/ src/routes/\(app\)/trips/\[slug\]/parking-lot/ src/lib/itinerary/components/CloseoutDayCard.svelte src/lib/itinerary/components/CloseoutItemRow.svelte src/lib/itinerary/components/ParkingLotSection.svelte
git commit -m "feat(#31): update day/today/closeout/parking-lot views — remove slot grouping, use sort_order"
```

---

### Task 9: Clone, phases, and remaining references

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/clone/+page.server.ts`
- Modify: `src/routes/(app)/trips/[slug]/phases/[phaseId]/+page.svelte`
- Modify: `src/routes/(app)/trips/[slug]/phases/[phaseId]/+page.server.ts`
- Modify: `backend/pb_hooks/suggestions.pb.js`

- [ ] **Step 1: Update `src/routes/(app)/trips/[slug]/clone/+page.server.ts`**

1. Line 14: Change sort from `'rank'` to `'sort_order'`
2. Line 128: Change sort from `'rank'` to `'sort_order'`
3. Line 140: Remove `slot: item.slot,`
4. Line 159: Rename `rank: item.rank,` to `sort_order: item.sort_order,`
5. Line 160: Remove `parking_lot_scope: item.parking_lot_scope,`

- [ ] **Step 2: Update `src/routes/(app)/trips/[slug]/phases/[phaseId]/+page.svelte`**

Line 17: Replace `parking_lot_scope === 'phase'` with `status === 'unplanned'`:
```ts
const parkingLotItems = $derived(data.phaseItems.filter((it) => it.status === 'unplanned'));
```

- [ ] **Step 3: Update `src/routes/(app)/trips/[slug]/phases/[phaseId]/+page.server.ts`**

Line 29: Change sort from `'rank'` to `'sort_order'`.

- [ ] **Step 4: Update `backend/pb_hooks/suggestions.pb.js`**

1. Line 81: Remove `item.set('slot', payload.slot || 'anytime');`
2. Line 97: Rename `item.set('rank', 0)` to `item.set('sort_order', 0)`
3. Line 98: Remove `item.set('parking_lot_scope', ...)` — replace with `item.set('status', payload.day ? 'planned' : 'unplanned');`
4. Lines 273, 289, 290: Same changes for the second block (duplicate logic for different suggestion type)

- [ ] **Step 5: Commit**

```bash
git add src/routes/\(app\)/trips/\[slug\]/clone/ src/routes/\(app\)/trips/\[slug\]/phases/ backend/pb_hooks/suggestions.pb.js
git commit -m "feat(#31): update clone/phases/suggestions — remove slot/parking_lot_scope, use sort_order"
```

---

### Task 10: Final verification and cleanup

**Files:**
- No new files

- [ ] **Step 1: Grep for any remaining references**

```bash
grep -rn 'slot\|parking_lot_scope' src/ --include='*.ts' --include='*.svelte' | grep -v node_modules | grep -v '.svelte-kit' | grep -v '.d.ts'
grep -rn '\brank\b' src/ --include='*.ts' --include='*.svelte' | grep -v node_modules | grep -v '.svelte-kit' | grep -v '.d.ts'
grep -rn '\bSlot\b\|ParkingLotScope' src/ --include='*.ts' --include='*.svelte' | grep -v node_modules | grep -v '.svelte-kit' | grep -v '.d.ts'
```

Expected: Zero results for `slot` (as a field name), `parking_lot_scope`, `ParkingLotScope`, `Slot` (as a type). The word `rank` should only appear in non-field contexts (like UI copy).

Fix any stragglers found.

- [ ] **Step 2: Run full type check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Run all tests**

Run: `pnpm vitest run`
Expected: All tests pass.

- [ ] **Step 4: Final commit if any stragglers were fixed**

```bash
git add -A
git commit -m "feat(#31): final cleanup — remove remaining slot/rank/parking_lot_scope references"
```
