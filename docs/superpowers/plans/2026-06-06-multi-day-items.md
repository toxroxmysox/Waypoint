# Multi-day Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let lodging / transportation / flight / activity / note items span a date range (e.g. a hotel Jun 8–12), rendered as a context-aware banner at the top of every spanned day.

**Architecture:** Add a single plain `end_date` date field to `items`. The start anchor stays the existing `day` relation (it carries phase membership, notes, indexes — see [ADR-0002](../../adr/0002-multi-day-item-storage-asymmetry.md)). "Multi-day" is *derived* (`end_date > startDayDate`), never stored. Span→day bucketing is a pure, Vitest-tested helper (`multi-day.ts`), mirroring `timeline.ts`/`now-state.ts`/`trip-mode.ts`. Multi-day items are excluded from timeline slots and rendered as a banner instead. Phase is start-context only; spans cross phases freely.

**Tech Stack:** PocketBase (JS migrations + relations), SvelteKit 2 / Svelte 5 runes, TypeScript, Vitest, Playwright, Tailwind.

**Scope sources:** Issue #41, the grill decision table (storage = `end_date` field; types = lodging/transportation/flight/activity/note; banner on every spanned day; Now excludes already-started; closeout once-on-start-day with editable end; client-side validation).

**Out of scope / deferred:**
- **Now-page "approaching check-in" reminder** — exploratory; documented at the end, not built here.
- **Server-side (PB hook) validation** — validation is client/action-side only.
- **meal / checklist spans** — excluded.
- **Checklist-as-item-type reconsideration** — tracked in #45.

---

## File Structure

**New files:**
- `backend/pb_migrations/0028_items_end_date.js` — append `end_date` date field.
- `src/lib/itinerary/multi-day.ts` — pure span helpers (`toDateOnly`, `isMultiDay`, `itemDateRange`, `spanningItemsForDate`, `nightInfo`).
- `src/lib/itinerary/multi-day.test.ts` — Vitest for the above.
- `src/lib/itinerary/components/MultiDayBanner.svelte` — the context-aware banner.

**Modified files:**
- `src/lib/itinerary/types.ts` — `Item.end_date`.
- `src/lib/itinerary/components/ItemFormFields.ts` — `ItemFormData.end_date`, `ItemFormContext.tripStartDate/tripEndDate`.
- `src/lib/itinerary/item-fields.ts` (+ `.test.ts`) — `endDate` visibility flag.
- `src/lib/shell/format.ts` (+ `.test.ts`) — `formatDateRange`.
- `src/lib/itinerary/components/ItemForm.svelte` — end-date control.
- `src/routes/(app)/trips/[slug]/items/new/+page.server.ts` — persist + validate + context.
- `src/routes/(app)/trips/[slug]/items/[itemId]/edit/+page.server.ts` — persist + validate + load + context.
- `src/routes/(app)/trips/[slug]/days/[dayId]/+page.server.ts` + `+page.svelte` — exclude from timeline, fetch + render spanning banners.
- `src/routes/(app)/trips/[slug]/today/+page.server.ts` + `+page.svelte` — exclude from timeline, fetch + render banner with ONGOING.
- `src/lib/itinerary/components/CloseoutItemRow.svelte` — show date range + trim-end control.
- `src/routes/(app)/trips/[slug]/closeout/+page.server.ts` — `trimEnd` action.
- `src/lib/portability/types.ts` + `export.ts` + `src/routes/(app)/trips/import/+page.server.ts` + `src/routes/(app)/trips/[slug]/clone/+page.server.ts` — round-trip `end_date`.
- `tests/e2e/m1-happy-path.spec.ts` (or a new spec) — span an item, assert banner.

---

## Task 1: Migration — add `end_date` field

**Files:**
- Create: `backend/pb_migrations/0028_items_end_date.js`

- [ ] **Step 1: Write the migration** (append-only; defaults empty; down removes it). Mirrors the field-add pattern in `0027_v3_schema_cleanup.js`.

```js
/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const items = app.findCollectionByNameOrId('items');
		items.fields.add(
			new DateField({
				name: 'end_date'
			})
		);
		app.save(items);
	},
	(app) => {
		const items = app.findCollectionByNameOrId('items');
		items.fields.removeByName('end_date');
		app.save(items);
	}
);
```

- [ ] **Step 2: Apply the migration via the dev backend**

Run: `./backend/start.sh` (let it boot, then Ctrl-C) — PocketBase auto-applies pending migrations on start. **Never run the `pocketbase` binary directly** (skips env vars — project rule).
Expected: startup log shows `Applied 0028_items_end_date.js`.

- [ ] **Step 3: Verify the field exists**

Run: `./backend/start.sh` in one shell, then in another:
`curl -s "http://127.0.0.1:8090/api/collections/items" -H "Authorization: Bearer $ADMIN_TOKEN" | grep -o end_date`
Expected: prints `end_date`. (If no admin token handy, skip — Step 2's log line is sufficient proof.)

- [ ] **Step 4: Commit**

```bash
git add backend/pb_migrations/0028_items_end_date.js
git commit -m "feat(#41): add items.end_date field (append-only migration)"
```

---

## Task 2: Types — `end_date` on Item, form data, export

**Files:**
- Modify: `src/lib/itinerary/types.ts:59-62`
- Modify: `src/lib/itinerary/components/ItemFormFields.ts:5-34`
- Modify: `src/lib/portability/types.ts:30-52`

- [ ] **Step 1: Add `end_date` to the `Item` interface.** In `src/lib/itinerary/types.ts`, after the `end_tz` line inside `interface Item`:

```ts
	start_tz: string;
	end_tz: string;
	end_date: string;
	status: ItemStatus;
```

- [ ] **Step 2: Add `end_date` to `ItemFormData` and trip dates to `ItemFormContext`.** In `ItemFormFields.ts`:

```ts
export interface ItemFormData {
	type: ItemType;
	subtype: string;
	title: string;
	description: string;
	day: string;
	phase: string;
	start_time: string;
	end_time: string;
	end_date: string;
	location_name: string;
	location_address: string;
	location_coords: unknown;
	google_place_id: string;
	booked: boolean;
	reservation_url: string;
	free_cancellation: boolean;
	cost_estimate_usd: number;
	cost_actual_usd: number;
	confirmation_codes: ConfirmationCode[];
	assigned_to: string[];
	status: string;
}

export interface ItemFormContext {
	days: Day[];
	phases: Phase[];
	members: TripMember[];
	preselectedDay?: string;
	preselectedPhase?: string;
	tripStartDate: string;
	tripEndDate: string;
}
```

- [ ] **Step 3: Add `end_date` to the export item shape.** In `src/lib/portability/types.ts`, inside the `items: Array<{ ... }>` member, after `end_tz: string;`:

```ts
		end_tz: string;
		end_date: string | null;
		status: string;
```

- [ ] **Step 4: Verify types compile** (will surface required-field gaps fixed in later tasks; that's expected).

Run: `pnpm check`
Expected: errors ONLY about `end_date` / `tripStartDate` / `tripEndDate` missing where form data/context is constructed (fixed in Tasks 6–8, 13). No other errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/itinerary/types.ts src/lib/itinerary/components/ItemFormFields.ts src/lib/portability/types.ts
git commit -m "feat(#41): add end_date to Item, form data, export types"
```

---

## Task 3: Field visibility — `endDate` flag

**Files:**
- Modify: `src/lib/itinerary/item-fields.ts:5-95`
- Test: `src/lib/itinerary/item-fields.test.ts`

- [ ] **Step 1: Write the failing test.** Append to `item-fields.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getFieldConfig } from './item-fields';
import type { ItemType } from '$lib/types';

describe('endDate visibility', () => {
	it('is on for span-capable types', () => {
		for (const t of ['lodging', 'transportation', 'flight', 'activity', 'note'] as ItemType[]) {
			expect(getFieldConfig(t).visibility.endDate).toBe(true);
		}
	});
	it('is off for meal and checklist', () => {
		for (const t of ['meal', 'checklist'] as ItemType[]) {
			expect(getFieldConfig(t).visibility.endDate).toBe(false);
		}
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/itinerary/item-fields.test.ts`
Expected: FAIL — `endDate` does not exist on `FieldVisibility`.

- [ ] **Step 3: Add the flag.** In `item-fields.ts`, add to the `FieldVisibility` interface:

```ts
export interface FieldVisibility {
	subtype: boolean;
	subtypes: string[];
	location: boolean;
	times: boolean;
	endDate: boolean;
	booking: boolean;
	costs: boolean;
	confirmationCodes: boolean;
	checklist: boolean;
	parentItem: boolean;
}
```

Then add `endDate` to each entry in `itemFieldConfig`: `true` for `lodging`, `transportation`, `flight`, `activity`, `note`; `false` for `meal`, `checklist`. (Note: `note` keeps `times: false` but gets `endDate: true` — a multi-day note is a pure date-span banner with no times.) Example for `lodging` and `note`:

```ts
	lodging: {
		subtype: true,
		subtypes: ['hotel', 'airbnb', 'resort', 'other'],
		location: true,
		times: true,
		endDate: true,
		booking: true,
		costs: true,
		confirmationCodes: true,
		checklist: false,
		parentItem: false
	},
	// ...
	note: {
		subtype: false,
		subtypes: [],
		location: false,
		times: false,
		endDate: true,
		booking: false,
		costs: false,
		confirmationCodes: false,
		checklist: false,
		parentItem: false
	},
```

Set `endDate: false` on `meal` and `checklist`, `endDate: true` on `transportation`, `flight`, `activity`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/itinerary/item-fields.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/itinerary/item-fields.ts src/lib/itinerary/item-fields.test.ts
git commit -m "feat(#41): add endDate field-visibility flag"
```

---

## Task 4: Pure span helpers + tests

**Files:**
- Create: `src/lib/itinerary/multi-day.ts`
- Test: `src/lib/itinerary/multi-day.test.ts`

- [ ] **Step 1: Write the failing test.** Create `multi-day.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toDateOnly, isMultiDay, itemDateRange, spanningItemsForDate, nightInfo } from './multi-day';
import type { Item, Day } from '$lib/types';

const days = [
	{ id: 'd8', date: '2026-06-18 00:00:00.000Z' },
	{ id: 'd9', date: '2026-06-19 00:00:00.000Z' },
	{ id: 'd12', date: '2026-06-22 00:00:00.000Z' }
] as Day[];

function hotel(over: Partial<Item> = {}): Item {
	return { id: 'h', day: 'd8', end_date: '2026-06-22 00:00:00.000Z', ...over } as Item;
}

describe('toDateOnly', () => {
	it('strips time from stored datetime', () => {
		expect(toDateOnly('2026-06-22 00:00:00.000Z')).toBe('2026-06-22');
		expect(toDateOnly('')).toBe('');
	});
});

describe('isMultiDay', () => {
	it('true when end_date is after the start day date', () => {
		expect(isMultiDay(hotel(), days)).toBe(true);
	});
	it('false when end_date equals the start day date (inert)', () => {
		expect(isMultiDay(hotel({ end_date: '2026-06-18 00:00:00.000Z' }), days)).toBe(false);
	});
	it('false when no end_date', () => {
		expect(isMultiDay(hotel({ end_date: '' }), days)).toBe(false);
	});
	it('false when no start day', () => {
		expect(isMultiDay(hotel({ day: '' }), days)).toBe(false);
	});
});

describe('itemDateRange', () => {
	it('returns inclusive start/end for multi-day', () => {
		expect(itemDateRange(hotel(), days)).toEqual({ start: '2026-06-18', end: '2026-06-22' });
	});
	it('returns null for non-multi-day', () => {
		expect(itemDateRange(hotel({ end_date: '' }), days)).toBeNull();
	});
});

describe('spanningItemsForDate', () => {
	it('includes the item on first, middle, and last day', () => {
		const items = [hotel()];
		expect(spanningItemsForDate(items, days, '2026-06-18')).toHaveLength(1);
		expect(spanningItemsForDate(items, days, '2026-06-20')).toHaveLength(1);
		expect(spanningItemsForDate(items, days, '2026-06-22')).toHaveLength(1);
	});
	it('excludes dates outside the range', () => {
		expect(spanningItemsForDate([hotel()], days, '2026-06-23')).toHaveLength(0);
		expect(spanningItemsForDate([hotel()], days, '2026-06-17')).toHaveLength(0);
	});
	it('ignores non-multi-day items', () => {
		expect(spanningItemsForDate([hotel({ end_date: '' })], days, '2026-06-18')).toHaveLength(0);
	});
});

describe('nightInfo', () => {
	it('counts nights from the start', () => {
		expect(nightInfo(hotel(), days, '2026-06-18')).toEqual({ night: 1, total: 4 });
		expect(nightInfo(hotel(), days, '2026-06-21')).toEqual({ night: 4, total: 4 });
	});
	it('caps the night number at total on the checkout day', () => {
		expect(nightInfo(hotel(), days, '2026-06-22')).toEqual({ night: 4, total: 4 });
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/itinerary/multi-day.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers.** Create `multi-day.ts`:

```ts
import type { Item, Day } from '$lib/types';

/** Extract 'YYYY-MM-DD' from a stored date/datetime string. '' if empty. */
export function toDateOnly(s: string): string {
	if (!s) return '';
	return s.split(/[T ]/)[0];
}

function startDateOf(item: Item, dayById: Map<string, Day>): string {
	const d = item.day ? dayById.get(item.day) : undefined;
	return d ? toDateOnly(d.date) : '';
}

function daysBetween(a: string, b: string): number {
	const ms = new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
	return Math.round(ms / 86_400_000);
}

/** True when the item has an end_date strictly after its start day's date. */
export function isMultiDay(item: Item, days: Day[]): boolean {
	return itemDateRange(item, days) !== null;
}

/** Inclusive { start, end } calendar range (YYYY-MM-DD), or null if not multi-day. */
export function itemDateRange(item: Item, days: Day[]): { start: string; end: string } | null {
	const dayById = new Map(days.map((d) => [d.id, d]));
	const start = startDateOf(item, dayById);
	const end = toDateOnly(item.end_date ?? '');
	if (!start || !end || end <= start) return null;
	return { start, end };
}

/** Multi-day items whose [start, end] range includes targetDate ('YYYY-MM-DD'). */
export function spanningItemsForDate(items: Item[], days: Day[], targetDate: string): Item[] {
	return items.filter((item) => {
		const range = itemDateRange(item, days);
		return range !== null && range.start <= targetDate && targetDate <= range.end;
	});
}

/** 'night X of N' for a spanned target date. total = number of nights. null if not multi-day. */
export function nightInfo(item: Item, days: Day[], targetDate: string): { night: number; total: number } | null {
	const range = itemDateRange(item, days);
	if (!range) return null;
	const total = daysBetween(range.start, range.end);
	const night = Math.min(daysBetween(range.start, targetDate) + 1, total);
	return { night, total };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/itinerary/multi-day.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/itinerary/multi-day.ts src/lib/itinerary/multi-day.test.ts
git commit -m "feat(#41): pure multi-day span helpers"
```

---

## Task 5: `formatDateRange` helper

**Files:**
- Modify: `src/lib/shell/format.ts`
- Test: `src/lib/shell/format.test.ts`

- [ ] **Step 1: Write the failing test.** Append to `format.test.ts`:

```ts
import { formatDateRange } from './format';

describe('formatDateRange', () => {
	it('formats a start→end span as abbreviated month/day', () => {
		expect(formatDateRange('2026-06-18', '2026-06-22')).toBe('Jun 18 → Jun 22');
	});
	it('returns empty string when either side is missing', () => {
		expect(formatDateRange('', '2026-06-22')).toBe('');
		expect(formatDateRange('2026-06-18', '')).toBe('');
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/shell/format.test.ts`
Expected: FAIL — `formatDateRange` not exported.

- [ ] **Step 3: Implement.** Append to `format.ts`:

```ts
/** "Jun 18 → Jun 22" from two 'YYYY-MM-DD' (or stored datetime) strings. */
export function formatDateRange(start: string, end: string): string {
	if (!start || !end) return '';
	const fmt = (s: string) =>
		new Date(`${s.split(/[T ]/)[0]}T00:00:00Z`).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	return `${fmt(start)} → ${fmt(end)}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/shell/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shell/format.ts src/lib/shell/format.test.ts
git commit -m "feat(#41): formatDateRange helper"
```

---

## Task 6: ItemForm — end-date control

**Files:**
- Modify: `src/lib/itinerary/components/ItemForm.svelte`

The control lives in the "When" card, after the Day select. It is shown only when `fields.endDate` is true **and** a day is selected (per validation rule 3: unplanned items have no span). Its `min` is the selected day's date, `max` is the trip end date.

- [ ] **Step 1: Track the selected day reactively.** In the `<script>` of `ItemForm.svelte`, after the existing `endTimeValue` state (line ~41), add:

```ts
	let endDateValue = $state(untrack(() => initialData.end_date));
	let selectedDay = $state(
		untrack(() =>
			mode === 'create' ? (context.preselectedDay ?? '') : initialData.day
		)
	);
	let selectedDayDate = $derived(
		context.days.find((d) => d.id === selectedDay)?.date.split(/[T ]/)[0] ?? ''
	);
```

- [ ] **Step 2: Bind the Day `<select>` to `selectedDay`.** Replace the existing Day select (lines ~396-415) so its value is bound and the `selected` attribute is dropped in favor of `bind:value`:

```svelte
				<select
					id="day"
					name="day"
					bind:value={selectedDay}
					class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
				>
					<option value="">Unscheduled</option>
					{#each context.days as d}
						<option value={d.id}>
							{new Date(d.date.replace(' ', 'T')).toLocaleDateString('en-US', {
								weekday: 'short',
								month: 'short',
								day: 'numeric',
								timeZone: 'UTC'
							})}
						</option>
					{/each}
				</select>
```

- [ ] **Step 3: Add the end-date control.** Inside the `{#if fields.times}` block's parent "When" card, AFTER the `{#if fields.times}…{/if}` time grid (after line ~462, still inside the card `div`), add:

```svelte
				{#if fields.endDate && selectedDay}
					<div>
						<label for="end_date" class="text-ink-soft block text-sm font-medium">
							End date <span class="text-ink-muted font-normal">(multi-day)</span>
						</label>
						<input
							type="date"
							id="end_date"
							name="end_date"
							bind:value={endDateValue}
							min={selectedDayDate}
							max={context.tripEndDate}
							class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						/>
						<p class="text-ink-muted mt-1 text-xs">
							Leave empty for a single-day item. End time above applies to the end date.
						</p>
					</div>
				{:else if fields.endDate}
					<input type="hidden" name="end_date" value="" />
				{/if}
```

(The `{:else if}` hidden input guarantees the field posts empty when no day is selected, so the server clears any prior span.)

- [ ] **Step 4: Verify it compiles**

Run: `pnpm check`
Expected: no NEW errors from ItemForm. (`tripStartDate`/`tripEndDate`/`end_date` construction errors remain until Tasks 7–8.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/itinerary/components/ItemForm.svelte
git commit -m "feat(#41): end-date control in ItemForm"
```

---

## Task 7: New-item action — persist, validate, context

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/items/new/+page.server.ts`

- [ ] **Step 1: Pass trip dates into the page context.** In the `load` return object (line ~63), add:

```ts
		preselectedDay: dayId || '',
		preselectedPhase,
		tripStartDate: String(trip.start_date || '').split(/[T ]/)[0],
		tripEndDate: String(trip.end_date || '').split(/[T ]/)[0],
		submitAsSuggestion,
		prefill
```

- [ ] **Step 2: Parse, validate, and store `end_date` in the action.** In the `default` action, after `const endTime = data.get('end_time')?.toString() || '';` (line ~105), add:

```ts
			const endDateRaw = (data.get('end_date')?.toString() || '').split(/[T ]/)[0];
```

Then replace the `dayDate` resolution + `payload` build (lines ~134-168) so the end date is validated against the day and trip, cleared when there is no day, and `end_time` combines with the end date:

```ts
			// Resolve the owning day's date so item times carry the real calendar
			// date (naive trip-local), not a 1970 placeholder. No day = no anchor.
			let dayDate = '';
			if (day) {
				try {
					const dayRec = await locals.pb.collection('days').getOne(day);
					dayDate = String(dayRec.date || '').split(/[T ]/)[0];
				} catch {
					dayDate = '';
				}
			}

			// Multi-day span: only valid when a day is set and end is strictly after
			// the start day and within the trip. Otherwise the field is inert/cleared.
			const tripEnd = String(trip.end_date || '').split(/[T ]/)[0];
			let endDate = '';
			if (day && dayDate && endDateRaw && endDateRaw > dayDate) {
				if (tripEnd && endDateRaw > tripEnd) {
					return fail(400, { error: 'End date is after the trip ends.' });
				}
				endDate = endDateRaw;
			}

			const payload = {
				trip: trip.id,
				phase: phase || '',
				day: day || '',
				type,
				subtype,
				title,
				description,
				location_name: locationName,
				location_address: locationAddress,
				location_coords: locationCoords,
				google_place_id: googlePlaceId,
				start_time: combineDateTime(dayDate, startTime),
				end_time: combineDateTime(endDate || dayDate, endTime),
				end_date: endDate ? `${endDate} 00:00:00.000Z` : '',
				booked,
				confirmation_codes: confirmationCodes,
				reservation_url: reservationUrl,
				free_cancellation: freeCancellation,
				cost_estimate_usd: costEstimate,
				cost_actual_usd: costActual,
				assigned_to: assignedTo,
				parent_item: parentItem || ''
			};
```

(`end_time` now combines with the **end date** when the item spans, so a checkout time lands on the checkout day.)

- [ ] **Step 3: Verify compile + existing tests**

Run: `pnpm check && pnpm vitest run`
Expected: no errors related to `new/+page.server.ts`; all unit tests pass.

- [ ] **Step 4: Commit**

```bash
git add "src/routes/(app)/trips/[slug]/items/new/+page.server.ts"
git commit -m "feat(#41): persist + validate end_date on item create"
```

---

## Task 8: Edit-item action — load, persist, validate, context

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/items/[itemId]/edit/+page.server.ts`

- [ ] **Step 1: Load `end_date` (date-only) into the form + pass trip dates.** In `load`, change the return (lines ~34-44):

```ts
	return {
		item: {
			...item,
			start_time: datetimeToTime(item.start_time ?? ''),
			end_time: datetimeToTime(item.end_time ?? ''),
			end_date: String(item.end_date ?? '').split(/[T ]/)[0]
		},
		checklistItems,
		members,
		phases,
		days,
		tripStartDate: String(trip.start_date || '').split(/[T ]/)[0],
		tripEndDate: String(trip.end_date || '').split(/[T ]/)[0]
	};
```

- [ ] **Step 2: Parse + validate + store in the `update` action.** After `const endTime = data.get('end_time')?.toString() || '';` (line ~69), add:

```ts
			const endDateRaw = (data.get('end_date')?.toString() || '').split(/[T ]/)[0];
```

Inside the `try` block, the action already loads `item` and resolves `dayDate` (lines ~91-117). Change the `dayDate` resolution to strip time, then compute the span and clear it when unplanned. Replace lines ~107-117 (`// Resolve the owning day's date …` through the `dayDate` block) with:

```ts
				// Resolve the owning day's date so item times carry the real calendar
				// date (naive trip-local), not a 1970 placeholder. No day = no anchor.
				let dayDate = '';
				if (day) {
					try {
						const dayRec = await locals.pb.collection('days').getOne(day);
						dayDate = String(dayRec.date || '').split(/[T ]/)[0];
					} catch {
						dayDate = '';
					}
				}

				// Multi-day span: cleared when unscheduled; else must be after the
				// start day and within the trip.
				const trip = await locals.pb
					.collection('trips')
					.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
				const tripEnd = String(trip.end_date || '').split(/[T ]/)[0];
				let endDate = '';
				if (resolvedStatus !== 'unplanned' && day && dayDate && endDateRaw && endDateRaw > dayDate) {
					if (tripEnd && endDateRaw > tripEnd) {
						return fail(400, { error: 'End date is after the trip ends.' });
					}
					endDate = endDateRaw;
				}
```

- [ ] **Step 3: Write `end_date` + end-aware `end_time` in the update call.** In the `items.update` payload (lines ~119-139), change the two relevant lines:

```ts
					start_time: combineDateTime(dayDate, startTime),
					end_time: combineDateTime(endDate || dayDate, endTime),
					end_date: endDate ? `${endDate} 00:00:00.000Z` : '',
```

- [ ] **Step 4: Confirm the edit page passes `end_date` into `initialData` and trip dates into `context`.** Open `src/routes/(app)/trips/[slug]/items/[itemId]/edit/+page.svelte`, find where `initialData` and `context` are built for `<ItemForm>`, and ensure `end_date: data.item.end_date` is in `initialData` and `tripStartDate: data.tripStartDate, tripEndDate: data.tripEndDate` are in `context`. If the page spreads `data.item` into `initialData`, `end_date` already flows; otherwise add it explicitly. Do the same audit for `src/routes/(app)/trips/[slug]/items/new/+page.svelte` (`end_date: ''` via `buildEmptyFormData` — see Step 5).

- [ ] **Step 5: Add `end_date` to `buildEmptyFormData`.** In `src/lib/itinerary/item-fields.ts`, inside the object returned by `buildEmptyFormData` (after `end_time: ''`):

```ts
		start_time: '',
		end_time: '',
		end_date: '',
		location_name: '',
```

- [ ] **Step 6: Verify compile + tests**

Run: `pnpm check && pnpm vitest run`
Expected: zero errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add "src/routes/(app)/trips/[slug]/items/[itemId]/edit/+page.server.ts" "src/routes/(app)/trips/[slug]/items/[itemId]/edit/+page.svelte" "src/routes/(app)/trips/[slug]/items/new/+page.svelte" src/lib/itinerary/item-fields.ts
git commit -m "feat(#41): load + persist + validate end_date on item edit"
```

---

## Task 9: MultiDayBanner component

**Files:**
- Create: `src/lib/itinerary/components/MultiDayBanner.svelte`

- [ ] **Step 1: Build the banner.** It renders the date range, a context-aware label (check-in time on the start day, checkout time on the end day, "night X of N" in between), an optional ONGOING pill, and links to the item.

```svelte
<script lang="ts">
	import type { Item, Day } from '$lib/types';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import { itemDateRange, nightInfo } from '$lib/itinerary/multi-day';
	import { formatDateRange, formatTime } from '$lib/shell/format';

	let {
		item,
		days,
		dayDate,
		tripSlug,
		ongoing = false
	}: {
		item: Item;
		days: Day[];
		dayDate: string;
		tripSlug: string;
		ongoing?: boolean;
	} = $props();

	const range = $derived(itemDateRange(item, days));
	const info = $derived(nightInfo(item, days, dayDate));

	const context = $derived.by(() => {
		if (!range) return '';
		if (dayDate === range.start) {
			return item.start_time ? `Check in · ${formatTime(item.start_time)}` : 'Check in';
		}
		if (dayDate === range.end) {
			return item.end_time ? `Check out · ${formatTime(item.end_time)}` : 'Check out';
		}
		return info ? `night ${info.night} of ${info.total}` : '';
	});
</script>

{#if range}
	<a
		href="/trips/{tripSlug}/items/{item.id}"
		class="bg-clay text-paper flex items-center gap-3 rounded-xl px-4 py-3 shadow-sm transition-opacity hover:opacity-95"
	>
		<span class="bg-paper/20 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
			<TypeIcon type={item.type} size={18} />
		</span>
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<p class="truncate text-sm font-semibold">{item.title}</p>
				{#if ongoing}
					<Pill variant="default" size="sm">Ongoing</Pill>
				{/if}
			</div>
			<p class="text-paper/80 text-xs">
				{formatDateRange(range.start, range.end)}{context ? ` · ${context}` : ''}
			</p>
		</div>
	</a>
{/if}
```

(If `Pill` doesn't render legibly on the clay background, the executor may inline a small `<span>` pill instead — visual nicety, verify in Task 14.)

- [ ] **Step 2: Verify compile**

Run: `pnpm check`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/itinerary/components/MultiDayBanner.svelte
git commit -m "feat(#41): MultiDayBanner component"
```

---

## Task 10: Day view — exclude from timeline, render banners

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/days/[dayId]/+page.server.ts`
- Modify: `src/routes/(app)/trips/[slug]/days/[dayId]/+page.svelte`

- [ ] **Step 1: Exclude multi-day items from the timeline and fetch spanning items.** In the `load` of the day `+page.server.ts`, pull `days` from parent, scope the day-items query to non-spanning items, and add a trip-wide multi-day fetch + span computation:

```ts
import { spanningItemsForDate } from '$lib/itinerary/multi-day';
// ...
export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { trip, phases, days } = await parent();
	// ... existing day lookup ...

	const items = await locals.pb.collection('items').getFullList<Item>({
		filter: `day = "${day.id}" && end_date = ""`,
		sort: 'sort_order'
	});

	// Multi-day items that span this calendar date (rendered as banners, not timeline).
	const dayDate = day.date.split(/[T ]/)[0];
	const allMultiDay = await locals.pb.collection('items').getFullList<Item>({
		filter: `trip = "${trip.id}" && end_date != ""`,
		sort: 'day'
	});
	const spanningItems = spanningItemsForDate(allMultiDay, days as Day[], dayDate);

	// ... existing votes / parkingLot logic (unchanged) ...

	return { day, dayItems: items, dayPhases, voteCounts, parkingLotItems, spanningItems, allDays: days };
};
```

(The `end_date = ""` filter keeps a multi-day item out of its own start-day timeline; it shows as a banner instead. PocketBase stores an unset date field as `""`.)

- [ ] **Step 2: Render the banners.** In the day `+page.svelte`, import the banner and place it directly above the `<DragDropTimeline>` block (after the notes `</Card>`, line ~122):

```svelte
	import MultiDayBanner from '$lib/itinerary/components/MultiDayBanner.svelte';
	// ...
	{#if data.spanningItems.length > 0}
		<div class="space-y-2">
			{#each data.spanningItems as item (item.id)}
				<MultiDayBanner
					{item}
					days={data.allDays}
					dayDate={data.day.date.split(/[T ]/)[0]}
					tripSlug={data.trip.slug}
				/>
			{/each}
		</div>
	{/if}
```

- [ ] **Step 3: Verify in the browser.** Start the app (`pnpm dev` + `./backend/start.sh`), create a hotel with an end date a few days out, then visit each spanned day.

Use preview tools: `preview_start`, navigate to a spanned day, `preview_snapshot` to confirm the banner appears on first/middle/last days with the right context label, `preview_console_logs` for errors. Verify at 375px (`preview_resize`).
Expected: banner on every spanned day; check-in label + time on day 1, "night X of N" in the middle, checkout label + time on the last day; the hotel is NOT duplicated inside the timeline slots.

- [ ] **Step 4: Verify compile**

Run: `pnpm check`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/trips/[slug]/days/[dayId]/+page.server.ts" "src/routes/(app)/trips/[slug]/days/[dayId]/+page.svelte"
git commit -m "feat(#41): day view renders multi-day banners, excludes from timeline"
```

---

## Task 11: Today view — banner with ONGOING, exclude from timeline

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/today/+page.server.ts`
- Modify: `src/routes/(app)/trips/[slug]/today/+page.svelte`

- [ ] **Step 1: Exclude multi-day from the timeline query + fetch spanning items.** In the today `+page.server.ts` `load`, scope the items query and add a multi-day fetch:

```ts
	const items = todayAndUpcomingIds.length > 0
		? await locals.pb.collection('items').getFullList<Item>({
				filter: `(${todayAndUpcomingIds.map((id) => `day = "${id}"`).join(' || ')}) && end_date = ""`,
				sort: 'day,start_time,sort_order'
			})
		: [];

	const multiDayItems = await locals.pb.collection('items').getFullList<Item>({
		filter: `trip = "${trip.id}" && end_date != ""`,
		sort: 'day'
	});

	return {
		items,
		multiDayItems,
		now: now.toISOString()
	};
```

(The parenthesised day-OR group `&& end_date = ""` keeps spanning items out of the timeline; they render as banners. `getTripModeState` therefore receives only single-day items and its tests stay green.)

- [ ] **Step 2: Render the banner above the timeline with ONGOING.** In the today `+page.svelte`:

```svelte
	import MultiDayBanner from '$lib/itinerary/components/MultiDayBanner.svelte';
	import { spanningItemsForDate } from '$lib/itinerary/multi-day';
	// ...
	const todayDate = $derived(tripMode.now.today ? tripMode.now.today.date.split(/[T ]/)[0] : '');
	const spanningToday = $derived(
		todayDate ? spanningItemsForDate(data.multiDayItems, data.days, todayDate) : []
	);
```

Then, inside the `{:else}` branch (after the `<h2>` day label, before `<TodayTimeline>`, line ~57):

```svelte
			{#if spanningToday.length > 0}
				<div class="space-y-2">
					{#each spanningToday as item (item.id)}
						<MultiDayBanner
							{item}
							days={data.days}
							dayDate={todayDate}
							tripSlug={data.trip.slug}
							ongoing={true}
						/>
					{/each}
				</div>
			{/if}
```

(Everything in `spanningToday` includes the current date by construction, so `ongoing={true}` is correct — the item is being lived right now.)

- [ ] **Step 3: Verify in the browser.** With an active trip whose `today` falls inside a hotel span, open Trip Mode → Today.

`preview_snapshot` / `preview_screenshot`: banner appears above the timeline with the "Ongoing" pill and "night X of N" (matching the issue's mockup). `preview_console_logs`: clean. Verify at 375px.
Expected: matches the grill screenshot — banner on top, timeline below, hotel not duplicated as a timeline entry.

- [ ] **Step 4: Verify compile + tests**

Run: `pnpm check && pnpm vitest run`
Expected: zero errors; `trip-mode.test.ts` / `now-state.test.ts` still pass (pure modules untouched).

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(app)/trips/[slug]/today/+page.server.ts" "src/routes/(app)/trips/[slug]/today/+page.svelte"
git commit -m "feat(#41): Today view renders ongoing multi-day banner"
```

---

## Task 12: Closeout — show date range, trim end date

Closeout already groups by the `day` relation (`sort: 'day,sort_order'`), so a multi-day item appears exactly once — under its start day. No exclusion needed. We add the date-range display and an inline trim control ("planned 4 nights, did 3").

**Files:**
- Modify: `src/lib/itinerary/components/CloseoutItemRow.svelte`
- Modify: `src/routes/(app)/trips/[slug]/closeout/+page.server.ts`

- [ ] **Step 1: Add the `trimEnd` action.** Append to the `actions` object in the closeout `+page.server.ts`:

```ts
	trimEnd: async ({ request, locals }) => {
		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		const endDate = (data.get('end_date')?.toString() || '').split(/[T ]/)[0];
		if (!itemId) return fail(400, { error: 'Missing item ID.' });
		try {
			await locals.pb.collection('items').update(itemId, {
				end_date: endDate ? `${endDate} 00:00:00.000Z` : ''
			});
			return { success: true };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to update end date.' });
		}
	},
```

- [ ] **Step 2: Show range + trim control in `CloseoutItemRow`.** The row receives `item`; it also needs the trip's `days` to resolve the range. Add a `days` prop and render the range under the title, with a collapsible date input. In `CloseoutItemRow.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import InlineQuickAdd from '$lib/itinerary/components/InlineQuickAdd.svelte';
	import { formatTime } from '$lib/shell/format';
	import { itemDateRange } from '$lib/itinerary/multi-day';
	import { formatDateRange } from '$lib/shell/format';
	import type { Item, Day } from '$lib/types';

	let {
		item,
		tripId,
		dayId,
		phaseId,
		days = []
	}: {
		item: Item;
		tripId: string;
		dayId: string;
		phaseId: string;
		days?: Day[];
	} = $props();

	let localState = $state<'pending' | 'done' | 'skipped' | 'replacing'>('pending');
	let submitting = $state(false);
	let editingEnd = $state(false);

	const isDone = $derived(item.status === 'done' || localState === 'done');
	const isSkipped = $derived(localState === 'skipped');
	const isReplacing = $derived(localState === 'replacing');
	const isResolved = $derived(isDone || isSkipped);
	const range = $derived(itemDateRange(item, days));
</script>
```

In the title block, below the existing `{#if item.start_time}` line (line ~40-42), add:

```svelte
				{#if range}
					<button
						type="button"
						onclick={() => (editingEnd = !editingEnd)}
						class="text-ink-muted text-xs hover:underline"
					>
						{formatDateRange(range.start, range.end)} · adjust
					</button>
					{#if editingEnd}
						<form
							method="POST"
							action="?/trimEnd"
							use:enhance={() => {
								return async ({ result, update }) => {
									if (result.type === 'success') editingEnd = false;
									await update();
								};
							}}
							class="mt-1 flex items-center gap-1"
						>
							<input type="hidden" name="item_id" value={item.id} />
							<input
								type="date"
								name="end_date"
								value={range.end}
								min={range.start}
								class="border-line bg-surface text-ink rounded border px-1.5 py-1 text-xs"
							/>
							<button type="submit" class="text-sky text-xs font-medium">Save</button>
						</form>
					{/if}
				{/if}
```

- [ ] **Step 3: Pass `days` from the closeout day card.** Open `src/lib/itinerary/components/CloseoutDayCard.svelte`, find where it renders `<CloseoutItemRow ... />`, and forward a `days` prop. The card receives its data from the closeout page; thread `days` from `closeout/+page.svelte` → `CloseoutDayCard` → `CloseoutItemRow`. If `CloseoutDayCard` doesn't currently get `days`, add a `days` prop to it and pass `days={data.days}` at the call site in `closeout/+page.svelte`.

- [ ] **Step 4: Verify compile + browser**

Run: `pnpm check`
Then with a closed-out-ready trip: open Closeout, confirm a multi-day item shows once under its start day with the range + "adjust", and trimming the end date persists (`preview_snapshot` before/after).
Expected: single appearance, editable range, no duplication on spanned days.

- [ ] **Step 5: Commit**

```bash
git add src/lib/itinerary/components/CloseoutItemRow.svelte src/lib/itinerary/components/CloseoutDayCard.svelte "src/routes/(app)/trips/[slug]/closeout/+page.server.ts" "src/routes/(app)/trips/[slug]/closeout/+page.svelte"
git commit -m "feat(#41): closeout shows + trims multi-day end date"
```

---

## Task 13: Portability — export / import / clone round-trip

**Files:**
- Modify: `src/lib/portability/export.ts`
- Modify: `src/routes/(app)/trips/import/+page.server.ts`
- Modify: `src/routes/(app)/trips/[slug]/clone/+page.server.ts`
- Test: `src/lib/portability/export.test.ts`

- [ ] **Step 1: Write the failing export test.** In `export.test.ts`, add an item with `end_date` to the fixture and assert it's in the output:

```ts
it('includes end_date for multi-day items', () => {
	const result = buildTripExport(
		makeTrip(),
		[],
		[{ id: 'd1', date: '2026-06-18 00:00:00.000Z' } as Day],
		[{ id: 'i1', day: 'd1', type: 'lodging', title: 'Hotel', status: 'planned', end_date: '2026-06-22 00:00:00.000Z' } as Item],
		null
	);
	expect(result.items[0].end_date).toBe('2026-06-22 00:00:00.000Z');
});
```

(Adapt `makeTrip`/imports to the file's existing helpers.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/portability/export.test.ts`
Expected: FAIL — `end_date` undefined on output item.

- [ ] **Step 3: Add `end_date` to `buildTripExport`.** In `export.ts`, in the item map (after `end_tz` line ~64):

```ts
					start_tz: item.start_tz || '',
					end_tz: item.end_tz || '',
					end_date: item.end_date || null,
					status: item.status,
```

- [ ] **Step 4: Set `end_date` on import.** In `trips/import/+page.server.ts`, in the `items.create` call (after `end_tz` line ~109):

```ts
						start_tz: item.start_tz || '',
						end_tz: item.end_tz || '',
						end_date: item.end_date || '',
						status: item.status || 'planned',
```

(`end_date` is a plain date string — no day-relation remapping needed, unlike `day_date`.)

- [ ] **Step 5: Set `end_date` on clone, shifting by the trip offset.** In `trips/[slug]/clone/+page.server.ts`, in the `items.create` call (after `end_time: item.end_time,` line ~149):

```ts
							start_time: item.start_time,
							end_time: item.end_time,
							end_date: item.end_date ? shiftDate(item.end_date) : '',
							status: 'planned',
```

(`shiftDate` already exists in this file and returns the `… 00:00:00.000Z` format.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/portability/export.test.ts && pnpm check`
Expected: PASS; no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/portability/export.ts src/lib/portability/export.test.ts "src/routes/(app)/trips/import/+page.server.ts" "src/routes/(app)/trips/[slug]/clone/+page.server.ts"
git commit -m "feat(#41): round-trip end_date through export/import/clone"
```

---

## Task 14: Full verification + E2E

**Files:**
- Modify: `tests/e2e/m1-happy-path.spec.ts` (or create `tests/e2e/multi-day.spec.ts`)

- [ ] **Step 1: Add an E2E that spans an item and asserts the banner.** Follow the existing spec patterns (`tests/e2e/m1-happy-path.spec.ts`). Outline:

```ts
// In an authenticated trip with at least two days:
// 1. Go to a day, click "Add item", choose Lodging, fill title "Test Hotel".
// 2. Ensure a Day is selected, set the End date input to a later in-trip day.
// 3. Submit; expect redirect to the day view.
// 4. Assert the MultiDayBanner is visible on the start day: getByText('Test Hotel') within the banner.
// 5. Navigate to a middle spanned day via DayNav; assert the banner shows 'night' text.
// 6. Assert "Test Hotel" does NOT appear as a timeline card on the middle day (only the banner).
```

Write concrete selectors matching the rendered markup (the banner is an `<a>` with the title in a `font-semibold` `<p>`; the "night X of N" text is in the sub-line).

- [ ] **Step 2: Run the unit suite**

Run: `pnpm check && pnpm vitest run`
Expected: all pass, no type errors.

- [ ] **Step 3: Run E2E** (requires dev server + backend per `playwright.config.ts`)

Run: `pnpm test:e2e`
Expected: the multi-day spec passes alongside existing specs.

- [ ] **Step 4: Manual visual pass at 375px** for day view + Today banner (preview tools), confirming parity with the issue mockup and no overflow.

- [ ] **Step 5: Update OpenWolf anatomy + memory** (project rule): add the new files (`multi-day.ts`, `multi-day.test.ts`, `MultiDayBanner.svelte`, `0028_items_end_date.js`) to `.wolf/anatomy.md` and append a session line to `.wolf/memory.md`.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e .wolf/anatomy.md .wolf/memory.md
git commit -m "test(#41): E2E for multi-day span banner; update anatomy"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** storage (T1–2), is-multi-day derivation (T4), end times (T6–8), banner rendering (T9–11), types gated lodging/transportation/flight/activity/note (T3), Now excludes started / Today banner (T11), phase spanning (date-driven, no special-casing — inherent in T4/T9), validation client-side + range picker + unplanned clears (T6–8), closeout once-on-start-day + editable end (T12), migration append-only (T1), portability (T13). ✓
- **Now-page "approaching check-in":** deliberately deferred (see Out of scope) — not a firm requirement.
- **Type consistency:** `end_date` string everywhere on `Item`/form; `endDate` (validated, `YYYY-MM-DD`) is the local action variable; stored as `YYYY-MM-DD 00:00:00.000Z`. Helpers (`toDateOnly`, `itemDateRange`, `spanningItemsForDate`, `nightInfo`, `formatDateRange`) named consistently across T4/T5/T9–T12.
- **No placeholders:** every code step shows real code; browser/CLI steps give exact commands + expected output.

---

## Deferred / open follow-ups

1. **Now-page approaching check-in reminder** — if check-in nudges feel useful, add an upcoming-multi-day detection to `now-state.ts` (a new additive `NowViewState` branch or field) surfacing "Check in at X in Nh" only when the start is in the near future; drop off once started. Build behind its own issue.
2. **Server-side validation hook** — only if data-integrity drift appears; would be the first `items.pb.js` hook (mind the inline-helper sandbox rule).
3. **#45** — checklist-as-item-type reconsideration (separate research issue).
