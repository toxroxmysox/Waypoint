# Trip Mode Views (Now, Today, Add) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the three Trip Mode views — Now (3 time-based states), Today (timeline with trip-mode rendering), and Add (choice sheet for quick-adding items or expenses) — so that an active trip has a usable live-trip experience.

**Architecture:** The Now tab derives one of three states (mid-event, between-things, day-wrapped) from the existing `getTripModeState()` in `src/lib/trip-mode/trip-mode.ts`. The state derivation needs a new pure function `getNowViewState()` that takes today's items + current time and returns which state to render + the relevant data (current item, next item, countdown). The Today tab reuses the same data as Planning Mode's `DayTimeline` but renders with a trip-mode-specific component that adds dimming, a "RIGHT NOW" indicator, auto-scroll, and a progress bar. The Add button opens a `BottomSheet` with two choices (add item, add expense) — no new route needed.

**Tech Stack:** SvelteKit, Svelte 5 ($state/$derived), Tailwind v4, Vitest, Playwright

**Existing infrastructure (already shipped):**
- `src/lib/trip-mode/trip-mode.ts` — `getTripModeState()` returns `NowState`, `UpNext`, `Timeline`
- `src/lib/trip-mode/types.ts` — `TripModeState`, `NowState`, `DayGroup` interfaces
- `src/lib/trip-mode/activation.ts` — `isTripActive()`, `TripViewMode` type
- `src/lib/trip-mode/components/TripModeCard.svelte` — expanded item card with confirmation codes
- `src/lib/trip-mode/components/NowDivider.svelte` — clay accent divider with label
- `src/lib/itinerary/components/DayTimeline.svelte` — Planning Mode timeline (anchored/untimed interleaving, drag-to-reorder)
- `src/lib/itinerary/components/TimelineItemCard.svelte` — compact item card for timeline
- `src/lib/itinerary/timeline.ts` — `buildTimeline()`, `detectOverlaps()`
- `src/lib/ui/BottomSheet.svelte` — modal bottom sheet with title + close
- `src/lib/shell/format.ts` — `formatTime()`, `formatTimeRange()`
- `src/routes/(app)/trips/[slug]/now/` — stub route (placeholder text)
- `src/routes/(app)/trips/[slug]/today/` — basic list with `TripModeCard` + `NowDivider`
- `src/lib/shell/nav-tabs.ts` — Add tab links to `/trips/${slug}/items/new?from=trip`

**Key data from parent layout (`+layout.server.ts`):** `trip`, `days`, `phases`, `notifications`, `unreadCount`, `parkingLotItems`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/trip-mode/now-state.ts` | Create | Pure function `getNowViewState()` — derives mid-event/between-things/day-wrapped from items + time |
| `src/lib/trip-mode/now-state.test.ts` | Create | Unit tests for all three Now states + edge cases |
| `src/lib/trip-mode/types.ts` | Modify | Add `NowViewState` discriminated union type |
| `src/lib/shell/format.ts` | Modify | Add `formatCountdown()` helper |
| `src/lib/shell/format.test.ts` | Create | Unit test for `formatCountdown()` |
| `src/routes/(app)/trips/[slug]/now/+page.server.ts` | Modify | Load today's items + server time |
| `src/routes/(app)/trips/[slug]/now/+page.svelte` | Modify | Render the three Now states |
| `src/lib/trip-mode/components/NowMidEvent.svelte` | Create | Mid-event state: expanded current item + UP NEXT + tomorrow preview |
| `src/lib/trip-mode/components/NowBetweenThings.svelte` | Create | Between-things state: FREE TIME countdown + UP NEXT |
| `src/lib/trip-mode/components/NowDayWrapped.svelte` | Create | Day-wrapped state: end-of-day summary |
| `src/routes/(app)/trips/[slug]/today/+page.server.ts` | Modify | Load today's items (already does this — minor adjustments) |
| `src/routes/(app)/trips/[slug]/today/+page.svelte` | Modify | Replace TripModeCard list with TodayTimeline |
| `src/lib/trip-mode/components/TodayTimeline.svelte` | Create | Trip-mode timeline: dimming, RIGHT NOW indicator, auto-scroll, progress |
| `src/lib/trip-mode/components/TodayItemCard.svelte` | Create | Item card variant with past/current/future states |
| `src/lib/trip-mode/components/AddSheet.svelte` | Create | Bottom sheet with "Add item" and "Add expense" choices |
| `src/lib/shell/nav-tabs.ts` | Modify | Change Add tab to dispatch sheet open event instead of linking |
| `src/lib/shell/components/AppShell.svelte` | Modify | Mount AddSheet, wire open state from nav |

---

### Task 1: Now view state derivation — types + pure function + tests

**Files:**
- Modify: `src/lib/trip-mode/types.ts`
- Create: `src/lib/trip-mode/now-state.ts`
- Create: `src/lib/trip-mode/now-state.test.ts`

The Now tab has three mutually exclusive states. This task defines the discriminated union and the pure function that picks the right one.

**State rules (from PRD §3.3):**
- **mid-event**: current time falls within an item's `start_time..end_time` range (or item is a multi-day span with no end_time today)
- **between-things**: no item is ongoing, but at least one item has a future `start_time` today
- **day-wrapped**: all timed items are in the past (or it's past 10pm), OR no items exist today

- [ ] **Step 1: Add NowViewState types to types.ts**

Add the following after the existing `TripModeState` interface in `src/lib/trip-mode/types.ts`:

```typescript
export type NowViewState =
	| { kind: 'mid-event'; currentItem: Item; nextItem: Item | null; tomorrowFirstItem: Item | null; minutesRemaining: number }
	| { kind: 'between-things'; nextItem: Item; minutesUntilNext: number }
	| { kind: 'day-wrapped'; completedCount: number; totalCount: number }
	| { kind: 'no-day' };
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/trip-mode/now-state.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getNowViewState } from './now-state';
import type { Item } from '$lib/types';

function makeItem(overrides: Partial<Item> = {}): Item {
	return {
		id: 'item1',
		trip: 'trip1',
		phase: '',
		day: 'day1',
		type: 'activity',
		subtype: '',
		title: 'Test Item',
		description: '',
		location_name: '',
		location_address: '',
		location_coords: null,
		google_place_id: '',
		start_time: '',
		end_time: '',
		start_tz: '',
		end_tz: '',
		status: 'planned',
		booked: false,
		booked_by: '',
		paid_by: '',
		confirmation_codes: [],
		reservation_url: '',
		free_cancellation: false,
		cost_estimate_usd: 0,
		cost_actual_usd: 0,
		assigned_to: [],
		sort_order: 0,
		parent_item: '',
		created_by: '',
		collectionId: '',
		collectionName: '',
		created: '',
		updated: ''
	} as Item;
}

describe('getNowViewState', () => {
	describe('no-day', () => {
		it('returns no-day when todayItems is empty and hasToday is false', () => {
			const result = getNowViewState([], new Date('2026-10-15T14:00:00Z'), false);
			expect(result.kind).toBe('no-day');
		});
	});

	describe('mid-event', () => {
		it('returns mid-event when now falls within an item start_time..end_time', () => {
			const items = [
				makeItem({
					id: 'lunch',
					start_time: '2026-10-15 12:00:00.000Z',
					end_time: '2026-10-15 14:30:00.000Z',
					title: 'Lunch'
				})
			];
			const result = getNowViewState(items, new Date('2026-10-15T13:00:00Z'), true);
			expect(result.kind).toBe('mid-event');
			if (result.kind === 'mid-event') {
				expect(result.currentItem.id).toBe('lunch');
				expect(result.minutesRemaining).toBe(90);
			}
		});

		it('picks the item with the latest end_time when multiple overlap', () => {
			const items = [
				makeItem({
					id: 'a',
					start_time: '2026-10-15 12:00:00.000Z',
					end_time: '2026-10-15 14:00:00.000Z'
				}),
				makeItem({
					id: 'b',
					start_time: '2026-10-15 13:00:00.000Z',
					end_time: '2026-10-15 15:00:00.000Z'
				})
			];
			const result = getNowViewState(items, new Date('2026-10-15T13:30:00Z'), true);
			expect(result.kind).toBe('mid-event');
			if (result.kind === 'mid-event') {
				expect(result.currentItem.id).toBe('b');
			}
		});

		it('includes nextItem when a future timed item exists', () => {
			const items = [
				makeItem({
					id: 'now',
					start_time: '2026-10-15 12:00:00.000Z',
					end_time: '2026-10-15 14:00:00.000Z'
				}),
				makeItem({
					id: 'later',
					start_time: '2026-10-15 16:00:00.000Z',
					end_time: '2026-10-15 18:00:00.000Z'
				})
			];
			const result = getNowViewState(items, new Date('2026-10-15T13:00:00Z'), true);
			expect(result.kind).toBe('mid-event');
			if (result.kind === 'mid-event') {
				expect(result.nextItem?.id).toBe('later');
			}
		});

		it('returns null nextItem when no future items exist', () => {
			const items = [
				makeItem({
					id: 'now',
					start_time: '2026-10-15 12:00:00.000Z',
					end_time: '2026-10-15 14:00:00.000Z'
				})
			];
			const result = getNowViewState(items, new Date('2026-10-15T13:00:00Z'), true);
			if (result.kind === 'mid-event') {
				expect(result.nextItem).toBeNull();
			}
		});
	});

	describe('between-things', () => {
		it('returns between-things when no item is ongoing but future items exist', () => {
			const items = [
				makeItem({
					id: 'past',
					start_time: '2026-10-15 09:00:00.000Z',
					end_time: '2026-10-15 10:00:00.000Z'
				}),
				makeItem({
					id: 'future',
					start_time: '2026-10-15 16:00:00.000Z',
					end_time: '2026-10-15 18:00:00.000Z',
					title: 'Dinner'
				})
			];
			const result = getNowViewState(items, new Date('2026-10-15T12:00:00Z'), true);
			expect(result.kind).toBe('between-things');
			if (result.kind === 'between-things') {
				expect(result.nextItem.id).toBe('future');
				expect(result.minutesUntilNext).toBe(240);
			}
		});

		it('picks the earliest future item as nextItem', () => {
			const items = [
				makeItem({
					id: 'soon',
					start_time: '2026-10-15 15:00:00.000Z',
					end_time: '2026-10-15 16:00:00.000Z'
				}),
				makeItem({
					id: 'later',
					start_time: '2026-10-15 18:00:00.000Z',
					end_time: '2026-10-15 19:00:00.000Z'
				})
			];
			const result = getNowViewState(items, new Date('2026-10-15T14:00:00Z'), true);
			if (result.kind === 'between-things') {
				expect(result.nextItem.id).toBe('soon');
				expect(result.minutesUntilNext).toBe(60);
			}
		});
	});

	describe('day-wrapped', () => {
		it('returns day-wrapped when all timed items are in the past', () => {
			const items = [
				makeItem({
					id: 'a',
					start_time: '2026-10-15 09:00:00.000Z',
					end_time: '2026-10-15 10:00:00.000Z',
					status: 'done'
				}),
				makeItem({
					id: 'b',
					start_time: '2026-10-15 12:00:00.000Z',
					end_time: '2026-10-15 13:00:00.000Z',
					status: 'done'
				})
			];
			const result = getNowViewState(items, new Date('2026-10-15T20:00:00Z'), true);
			expect(result.kind).toBe('day-wrapped');
			if (result.kind === 'day-wrapped') {
				expect(result.completedCount).toBe(2);
				expect(result.totalCount).toBe(2);
			}
		});

		it('returns day-wrapped when past 10pm regardless of item state', () => {
			const items = [
				makeItem({
					id: 'a',
					start_time: '2026-10-15 23:00:00.000Z',
					end_time: '2026-10-15 23:30:00.000Z',
					status: 'planned'
				})
			];
			const result = getNowViewState(items, new Date('2026-10-15T22:01:00Z'), true);
			expect(result.kind).toBe('day-wrapped');
		});

		it('returns day-wrapped when today exists but has zero items', () => {
			const result = getNowViewState([], new Date('2026-10-15T14:00:00Z'), true);
			expect(result.kind).toBe('day-wrapped');
			if (result.kind === 'day-wrapped') {
				expect(result.completedCount).toBe(0);
				expect(result.totalCount).toBe(0);
			}
		});

		it('counts only done items as completedCount', () => {
			const items = [
				makeItem({ id: 'a', status: 'done' }),
				makeItem({ id: 'b', status: 'planned' }),
				makeItem({ id: 'c', status: 'done' })
			];
			const result = getNowViewState(items, new Date('2026-10-15T22:30:00Z'), true);
			if (result.kind === 'day-wrapped') {
				expect(result.completedCount).toBe(2);
				expect(result.totalCount).toBe(3);
			}
		});
	});

	describe('untimed items', () => {
		it('untimed items do not trigger mid-event', () => {
			const items = [
				makeItem({ id: 'untimed', start_time: '', end_time: '' })
			];
			const result = getNowViewState(items, new Date('2026-10-15T14:00:00Z'), true);
			expect(result.kind).not.toBe('mid-event');
		});

		it('untimed-only day before 10pm returns day-wrapped (no timed items to be between)', () => {
			const items = [
				makeItem({ id: 'a', start_time: '', end_time: '' }),
				makeItem({ id: 'b', start_time: '', end_time: '' })
			];
			const result = getNowViewState(items, new Date('2026-10-15T14:00:00Z'), true);
			expect(result.kind).toBe('day-wrapped');
		});
	});
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/trip-mode/now-state.test.ts`
Expected: FAIL — module `./now-state` not found

- [ ] **Step 4: Implement getNowViewState**

Create `src/lib/trip-mode/now-state.ts`:

```typescript
import type { Item } from '$lib/types';
import type { NowViewState } from './types';

function parseDateTime(dt: string): Date {
	if (!dt) return new Date(0);
	return new Date(dt.replace(' ', 'T'));
}

function findCurrentItem(items: Item[], now: Date): Item | null {
	const ongoing = items.filter((i) => {
		if (!i.start_time || !i.end_time) return false;
		const start = parseDateTime(i.start_time).getTime();
		const end = parseDateTime(i.end_time).getTime();
		return now.getTime() >= start && now.getTime() < end;
	});
	if (ongoing.length === 0) return null;
	// Pick the one with the latest end_time (most recently started or longest running)
	return ongoing.sort(
		(a, b) => parseDateTime(b.end_time).getTime() - parseDateTime(a.end_time).getTime()
	)[0];
}

function findNextTimedItem(items: Item[], now: Date): Item | null {
	return items
		.filter((i) => i.start_time && parseDateTime(i.start_time).getTime() > now.getTime())
		.sort((a, b) => parseDateTime(a.start_time).getTime() - parseDateTime(b.start_time).getTime())
		[0] ?? null;
}

function minutesBetween(from: Date, to: Date): number {
	return Math.round((to.getTime() - from.getTime()) / 60000);
}

export function getNowViewState(
	todayItems: Item[],
	now: Date,
	hasToday: boolean
): NowViewState {
	if (!hasToday) return { kind: 'no-day' };

	const hour = now.getUTCHours();
	const isPast10pm = hour >= 22;

	const totalCount = todayItems.length;
	const completedCount = todayItems.filter((i) => i.status === 'done').length;

	// Past 10pm or no items — day is wrapped
	if (isPast10pm || totalCount === 0) {
		return { kind: 'day-wrapped', completedCount, totalCount };
	}

	const currentItem = findCurrentItem(todayItems, now);

	if (currentItem) {
		const minutesRemaining = minutesBetween(now, parseDateTime(currentItem.end_time));
		const nextItem = findNextTimedItem(todayItems, now);
		return { kind: 'mid-event', currentItem, nextItem, tomorrowFirstItem: null, minutesRemaining };
	}

	const nextItem = findNextTimedItem(todayItems, now);

	if (nextItem) {
		const minutesUntilNext = minutesBetween(now, parseDateTime(nextItem.start_time));
		return { kind: 'between-things', nextItem, minutesUntilNext };
	}

	// All timed items are past, or only untimed items exist
	return { kind: 'day-wrapped', completedCount, totalCount };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/trip-mode/now-state.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/trip-mode/now-state.ts src/lib/trip-mode/now-state.test.ts src/lib/trip-mode/types.ts
git commit -m "feat(#33): add getNowViewState pure function with mid-event/between-things/day-wrapped derivation"
```

---

### Task 2: Countdown formatter

**Files:**
- Modify: `src/lib/shell/format.ts`
- Create: `src/lib/shell/format.test.ts`

The Now tab shows countdowns like "1h 30m" or "45m". Add a `formatCountdown(minutes)` utility.

- [ ] **Step 1: Write the failing test**

Create `src/lib/shell/format.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatCountdown } from './format';

describe('formatCountdown', () => {
	it('returns "< 1m" for 0 or negative minutes', () => {
		expect(formatCountdown(0)).toBe('< 1m');
		expect(formatCountdown(-5)).toBe('< 1m');
	});

	it('returns minutes only when under 60', () => {
		expect(formatCountdown(45)).toBe('45m');
		expect(formatCountdown(1)).toBe('1m');
	});

	it('returns hours and minutes when 60 or more', () => {
		expect(formatCountdown(90)).toBe('1h 30m');
		expect(formatCountdown(120)).toBe('2h');
	});

	it('omits minutes when evenly divisible by 60', () => {
		expect(formatCountdown(180)).toBe('3h');
	});

	it('handles large values', () => {
		expect(formatCountdown(600)).toBe('10h');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/shell/format.test.ts`
Expected: FAIL — `formatCountdown` is not exported

- [ ] **Step 3: Add formatCountdown to format.ts**

Append to `src/lib/shell/format.ts`:

```typescript
export function formatCountdown(minutes: number): string {
	if (minutes <= 0) return '< 1m';
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h === 0) return `${m}m`;
	if (m === 0) return `${h}h`;
	return `${h}h ${m}m`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/shell/format.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/shell/format.ts src/lib/shell/format.test.ts
git commit -m "feat(#33): add formatCountdown utility for trip mode time displays"
```

---

### Task 3: Now tab — server data loader

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/now/+page.server.ts`

The Now page needs today's items, tomorrow's first item (for mid-event preview), and the server timestamp. The parent layout already provides `trip` and `days`. Load items for today + tomorrow.

- [ ] **Step 1: Update the server loader**

Replace the contents of `src/routes/(app)/trips/[slug]/now/+page.server.ts`:

```typescript
import type { PageServerLoad } from './$types';
import type { Day, Item } from '$lib/types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { trip, days } = await parent();

	const now = new Date();
	const todayStr = now.toISOString().split('T')[0];
	const today = days.find((d: Day) => d.date.split(/[T ]/)[0] === todayStr) ?? null;

	const tomorrow = new Date(now);
	tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
	const tomorrowStr = tomorrow.toISOString().split('T')[0];
	const tomorrowDay = days.find((d: Day) => d.date.split(/[T ]/)[0] === tomorrowStr) ?? null;

	const dayIds: string[] = [];
	if (today) dayIds.push(today.id);
	if (tomorrowDay) dayIds.push(tomorrowDay.id);

	const items =
		dayIds.length > 0
			? await locals.pb.collection('items').getFullList<Item>({
					filter: dayIds.map((id) => `day = "${id}"`).join(' || '),
					sort: 'start_time,sort_order'
				})
			: [];

	const todayItems = items.filter((i) => i.day === today?.id);
	const tomorrowItems = items.filter((i) => i.day === tomorrowDay?.id);
	const tomorrowFirstItem = tomorrowItems.length > 0 ? tomorrowItems[0] : null;

	return {
		todayItems,
		tomorrowFirstItem,
		hasToday: today !== null,
		now: now.toISOString()
	};
};
```

- [ ] **Step 2: Run type check**

Run: `pnpm check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/routes/(app)/trips/[slug]/now/+page.server.ts
git commit -m "feat(#33): load today/tomorrow items for Now tab"
```

---

### Task 4: Now tab — sub-components (MidEvent, BetweenThings, DayWrapped)

**Files:**
- Create: `src/lib/trip-mode/components/NowMidEvent.svelte`
- Create: `src/lib/trip-mode/components/NowBetweenThings.svelte`
- Create: `src/lib/trip-mode/components/NowDayWrapped.svelte`

Three self-contained components, one per Now state. Each receives only the data it needs.

- [ ] **Step 1: Create NowMidEvent.svelte**

Create `src/lib/trip-mode/components/NowMidEvent.svelte`:

```svelte
<script lang="ts">
	import type { Item } from '$lib/types';
	import TripModeCard from './TripModeCard.svelte';
	import NowDivider from './NowDivider.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import { formatCountdown, formatTime } from '$lib/shell/format';

	let {
		currentItem,
		nextItem,
		tomorrowFirstItem,
		minutesRemaining,
		slug
	}: {
		currentItem: Item;
		nextItem: Item | null;
		tomorrowFirstItem: Item | null;
		minutesRemaining: number;
		slug: string;
	} = $props();
</script>

<section class="space-y-4">
	<div>
		<Pill variant="trip" size="sm">Right now</Pill>
		<p class="text-ink-muted mt-1 text-xs">{formatCountdown(minutesRemaining)} remaining</p>
	</div>

	<TripModeCard item={currentItem} {slug} />

	{#if nextItem}
		<NowDivider label="Up next" />
		<Card href="/trips/{slug}/items/{nextItem.id}">
			<div class="flex items-center gap-3 p-3">
				<TypeIcon type={nextItem.type} sub={nextItem.subtype} size={32} />
				<div class="min-w-0 flex-1">
					<h4 class="text-ink truncate text-sm font-semibold">{nextItem.title}</h4>
					{#if nextItem.start_time}
						<p class="text-ink-muted font-mono text-xs">{formatTime(nextItem.start_time)}</p>
					{/if}
				</div>
			</div>
		</Card>
	{/if}

	{#if tomorrowFirstItem}
		<div class="border-line border-t pt-4">
			<p class="text-ink-muted mb-2 text-xs font-medium uppercase tracking-wide">Tomorrow</p>
			<Card href="/trips/{slug}/items/{tomorrowFirstItem.id}">
				<div class="flex items-center gap-3 p-3">
					<TypeIcon type={tomorrowFirstItem.type} sub={tomorrowFirstItem.subtype} size={28} />
					<div class="min-w-0 flex-1">
						<h4 class="text-ink truncate text-sm">{tomorrowFirstItem.title}</h4>
						{#if tomorrowFirstItem.start_time}
							<p class="text-ink-muted font-mono text-[11px]">{formatTime(tomorrowFirstItem.start_time)}</p>
						{/if}
					</div>
				</div>
			</Card>
		</div>
	{/if}
</section>
```

- [ ] **Step 2: Create NowBetweenThings.svelte**

Create `src/lib/trip-mode/components/NowBetweenThings.svelte`:

```svelte
<script lang="ts">
	import type { Item } from '$lib/types';
	import NowDivider from './NowDivider.svelte';
	import Card from '$lib/ui/Card.svelte';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import { formatCountdown, formatTime } from '$lib/shell/format';

	let {
		nextItem,
		minutesUntilNext,
		slug
	}: {
		nextItem: Item;
		minutesUntilNext: number;
		slug: string;
	} = $props();
</script>

<section class="space-y-4">
	<Card>
		<div class="p-6 text-center">
			<p class="text-ink-muted text-xs font-medium uppercase tracking-wide">Free time</p>
			<p class="text-ink font-display mt-2 text-3xl font-semibold">{formatCountdown(minutesUntilNext)}</p>
			<p class="text-ink-muted mt-1 text-sm">until next activity</p>
		</div>
	</Card>

	<NowDivider label="Up next" />

	<Card href="/trips/{slug}/items/{nextItem.id}">
		<div class="flex items-center gap-3 p-4">
			<TypeIcon type={nextItem.type} sub={nextItem.subtype} size={36} />
			<div class="min-w-0 flex-1">
				<h4 class="text-ink text-base font-semibold">{nextItem.title}</h4>
				{#if nextItem.start_time}
					<p class="text-ink-muted font-mono mt-0.5 text-sm">{formatTime(nextItem.start_time)}</p>
				{/if}
				{#if nextItem.location_name}
					<p class="text-ink-muted mt-0.5 text-sm">{nextItem.location_name}</p>
				{/if}
			</div>
		</div>
	</Card>
</section>
```

- [ ] **Step 3: Create NowDayWrapped.svelte**

Create `src/lib/trip-mode/components/NowDayWrapped.svelte`:

```svelte
<script lang="ts">
	import Card from '$lib/ui/Card.svelte';

	let {
		completedCount,
		totalCount
	}: {
		completedCount: number;
		totalCount: number;
	} = $props();
</script>

<section>
	<Card>
		<div class="p-6 text-center">
			<p class="text-ink font-display text-xl font-semibold">Day wrapped</p>
			{#if totalCount > 0}
				<p class="text-ink-muted mt-2 text-sm">
					{completedCount} of {totalCount} {totalCount === 1 ? 'item' : 'items'} completed
				</p>
			{:else}
				<p class="text-ink-muted mt-2 text-sm">Nothing was scheduled for today.</p>
			{/if}
		</div>
	</Card>
</section>
```

- [ ] **Step 4: Run type check**

Run: `pnpm check`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/trip-mode/components/NowMidEvent.svelte src/lib/trip-mode/components/NowBetweenThings.svelte src/lib/trip-mode/components/NowDayWrapped.svelte
git commit -m "feat(#33): add Now tab sub-components — MidEvent, BetweenThings, DayWrapped"
```

---

### Task 5: Now tab — page assembly

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/now/+page.svelte`

Wire the server data through `getNowViewState()` and render the correct sub-component.

- [ ] **Step 1: Replace the stub Now page**

Replace the entire contents of `src/routes/(app)/trips/[slug]/now/+page.svelte`:

```svelte
<script lang="ts">
	import NavBar from '$lib/ui/NavBar.svelte';
	import { getNowViewState } from '$lib/trip-mode/now-state';
	import NowMidEvent from '$lib/trip-mode/components/NowMidEvent.svelte';
	import NowBetweenThings from '$lib/trip-mode/components/NowBetweenThings.svelte';
	import NowDayWrapped from '$lib/trip-mode/components/NowDayWrapped.svelte';
	import Card from '$lib/ui/Card.svelte';
	import { untrack } from 'svelte';

	let { data } = $props();

	const now = new Date(untrack(() => data.now));
	const viewState = $derived(
		getNowViewState(data.todayItems, now, data.hasToday)
	);
</script>

<NavBar title="Now" subtitle={data.trip.title} subtitleStyle="tagline" />

<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-8">
	{#if viewState.kind === 'mid-event'}
		<NowMidEvent
			currentItem={viewState.currentItem}
			nextItem={viewState.nextItem}
			tomorrowFirstItem={data.tomorrowFirstItem}
			minutesRemaining={viewState.minutesRemaining}
			slug={data.trip.slug}
		/>
	{:else if viewState.kind === 'between-things'}
		<NowBetweenThings
			nextItem={viewState.nextItem}
			minutesUntilNext={viewState.minutesUntilNext}
			slug={data.trip.slug}
		/>
	{:else if viewState.kind === 'day-wrapped'}
		<NowDayWrapped
			completedCount={viewState.completedCount}
			totalCount={viewState.totalCount}
		/>
	{:else}
		<Card>
			<div class="p-6 text-center">
				<p class="text-ink-soft font-semibold">No itinerary for today</p>
				<p class="text-ink-muted mt-1 text-sm">Today doesn't fall within this trip's dates.</p>
			</div>
		</Card>
	{/if}
</main>
```

- [ ] **Step 2: Run type check**

Run: `pnpm check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/routes/(app)/trips/[slug]/now/+page.svelte
git commit -m "feat(#33): wire Now page to getNowViewState with state-based rendering"
```

---

### Task 6: Today tab — TodayItemCard component

**Files:**
- Create: `src/lib/trip-mode/components/TodayItemCard.svelte`

A card variant that shows past/current/future states. Past items are dimmed, current item gets a "RIGHT NOW" indicator, future items render normally. Distinct from `TimelineItemCard` (Planning Mode) — no drag handles, adds time-awareness.

- [ ] **Step 1: Create TodayItemCard.svelte**

Create `src/lib/trip-mode/components/TodayItemCard.svelte`:

```svelte
<script lang="ts">
	import type { Item } from '$lib/types';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import Card from '$lib/ui/Card.svelte';
	import { formatTime } from '$lib/shell/format';
	import { titleCase } from '$lib/shell/format';

	let {
		item,
		tripSlug,
		temporal
	}: {
		item: Item;
		tripSlug: string;
		temporal: 'past' | 'current' | 'future';
	} = $props();

	const dimmed = $derived(temporal === 'past');
</script>

<div
	class="relative transition-opacity"
	class:opacity-50={dimmed}
	id="item-{item.id}"
>
	{#if temporal === 'current'}
		<div class="bg-clay absolute -left-2 top-0 bottom-0 w-1 rounded-full"></div>
	{/if}

	<Card href="/trips/{tripSlug}/items/{item.id}">
		<div class="flex items-start gap-3 p-3">
			<TypeIcon type={item.type} sub={item.subtype} size={32} />
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<h4 class="text-ink truncate text-sm font-semibold">{item.title}</h4>
					{#if temporal === 'current'}
						<Pill variant="trip" size="sm">Right now</Pill>
					{/if}
					{#if item.status === 'done'}
						<Pill variant="booked" size="sm">Done</Pill>
					{/if}
				</div>
				{#if item.start_time || item.location_name}
					<p class="text-ink-muted mt-0.5 text-[12px]">
						{#if item.start_time}
							<span class="font-mono">
								{formatTime(item.start_time)}{item.end_time ? ` – ${formatTime(item.end_time)}` : ''}
							</span>
						{/if}
						{#if item.start_time && item.location_name}<span class="text-line"> · </span>{/if}
						{#if item.location_name}{item.location_name}{/if}
					</p>
				{/if}
				{#if item.subtype}
					<p class="text-ink-muted mt-1 text-[11px] uppercase tracking-wide">{titleCase(item.subtype)}</p>
				{/if}
			</div>
			<a
				href="/trips/{tripSlug}/items/{item.id}/edit"
				class="text-ink-muted hover:text-ink shrink-0 p-1"
				aria-label="Edit {item.title}"
				onclick={(e) => e.stopPropagation()}
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
				</svg>
			</a>
		</div>
	</Card>
</div>
```

- [ ] **Step 2: Run type check**

Run: `pnpm check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/trip-mode/components/TodayItemCard.svelte
git commit -m "feat(#33): add TodayItemCard with past/current/future temporal states"
```

---

### Task 7: Today tab — TodayTimeline component

**Files:**
- Create: `src/lib/trip-mode/components/TodayTimeline.svelte`

Renders the day's items as a timeline with trip-mode styling. Uses `buildTimeline()` from the existing timeline module for consistent ordering, but renders with `TodayItemCard` instead of `TimelineItemCard`. Adds progress indicator and auto-scrolls to the current item on mount.

- [ ] **Step 1: Create TodayTimeline.svelte**

Create `src/lib/trip-mode/components/TodayTimeline.svelte`:

```svelte
<script lang="ts">
	import type { Item } from '$lib/types';
	import { buildTimeline } from '$lib/itinerary/timeline';
	import TodayItemCard from './TodayItemCard.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import { tick } from 'svelte';

	let {
		items,
		tripSlug,
		now
	}: {
		items: Item[];
		tripSlug: string;
		now: Date;
	} = $props();

	const timeline = $derived(buildTimeline(items));

	const completedCount = $derived(items.filter((i) => i.status === 'done').length);
	const totalCount = $derived(items.length);

	function getTemporalState(item: Item): 'past' | 'current' | 'future' {
		if (!item.start_time) {
			return item.status === 'done' ? 'past' : 'future';
		}
		const start = new Date(item.start_time.replace(' ', 'T')).getTime();
		const end = item.end_time
			? new Date(item.end_time.replace(' ', 'T')).getTime()
			: start;
		const nowMs = now.getTime();
		if (nowMs >= start && nowMs < end) return 'current';
		if (nowMs >= end) return 'past';
		return 'future';
	}

	function findCurrentItemId(): string | null {
		for (const entry of timeline) {
			if (entry.kind === 'item' && getTemporalState(entry.item) === 'current') {
				return entry.item.id;
			}
		}
		return null;
	}

	$effect(() => {
		const id = findCurrentItemId();
		if (!id) return;
		tick().then(() => {
			const el = document.getElementById(`item-${id}`);
			el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		});
	});
</script>

{#if totalCount > 0}
	<div class="mb-3 flex items-center justify-between">
		<Pill variant="default" size="sm">{completedCount} of {totalCount} done</Pill>
	</div>
{/if}

{#if timeline.length === 0}
	<div class="rounded-xl border border-line bg-surface p-6 text-center">
		<p class="text-ink-muted text-sm">Nothing scheduled for today.</p>
	</div>
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
				<TodayItemCard
					item={entry.item}
					{tripSlug}
					temporal={getTemporalState(entry.item)}
				/>
			{/if}
		{/each}
	</div>
{/if}
```

- [ ] **Step 2: Run type check**

Run: `pnpm check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/trip-mode/components/TodayTimeline.svelte
git commit -m "feat(#33): add TodayTimeline with temporal states, progress, and auto-scroll"
```

---

### Task 8: Today tab — page update

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/today/+page.svelte`

Replace the current TripModeCard-based list with the new TodayTimeline. Keep the SubTabs (Today / Next 3 Days) and the Tomorrow section.

- [ ] **Step 1: Update the Today page**

Replace the entire contents of `src/routes/(app)/trips/[slug]/today/+page.svelte`:

```svelte
<script lang="ts">
	import NavBar from '$lib/ui/NavBar.svelte';
	import SubTabs from '$lib/ui/SubTabs.svelte';
	import TodayTimeline from '$lib/trip-mode/components/TodayTimeline.svelte';
	import SectionH from '$lib/ui/SectionH.svelte';
	import Card from '$lib/ui/Card.svelte';
	import NotificationBell from '$lib/collaboration/components/NotificationBell.svelte';
	import { getTripModeState } from '$lib/trip-mode/trip-mode';
	import { formatTime } from '$lib/shell/format';
	import { untrack } from 'svelte';
	import type { Notification } from '$lib/types';

	let { data } = $props();

	let notifications = $state<Notification[]>(untrack(() => data.notifications ?? []));
	let unreadCount = $state(untrack(() => data.unreadCount ?? 0));

	const now = new Date(untrack(() => data.now));
	const tripMode = $derived(getTripModeState(data.items, data.days, now));

	function dayLabel(dateStr: string): string {
		return new Date(dateStr.replace(' ', 'T')).toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}
</script>

<NavBar
	title="Today"
	subtitle={data.trip.title}
	subtitleStyle="tagline"
	back
	backHref="/trips/{data.trip.slug}"
>
	{#snippet right()}
		<NotificationBell bind:notifications bind:unreadCount />
	{/snippet}
</NavBar>

<SubTabs tabs={[
	{ id: 'today', label: 'Today', href: `/trips/${data.trip.slug}/today` },
	{ id: 'upcoming', label: 'Next 3 Days', href: `/trips/${data.trip.slug}/today/upcoming` }
]} />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8 space-y-4">
	{#if !tripMode.now.today}
		<Card>
			<div class="p-6 text-center">
				<p class="text-ink-soft font-semibold">No itinerary for today</p>
				<p class="text-ink-muted mt-1 text-sm">Today doesn't fall within this trip's dates.</p>
			</div>
		</Card>
	{:else}
		<h2 class="font-display text-ink text-xl font-semibold">{dayLabel(tripMode.now.today.date)}</h2>

		<TodayTimeline
			items={tripMode.now.todayItems}
			tripSlug={data.trip.slug}
			{now}
		/>

		{#if tripMode.upNext.tomorrowDay}
			{@const tomorrowItems = tripMode.upNext.tomorrowItems}
			<div class="border-line border-t pt-4">
				<SectionH>
					{#snippet right()}
						<a href="/trips/{data.trip.slug}/today/upcoming" class="text-ink-muted hover:text-ink-soft text-xs">See all</a>
					{/snippet}
					Tomorrow
				</SectionH>
				{#if tomorrowItems.length > 0}
					<div class="mt-2 space-y-1">
						{#each tomorrowItems.slice(0, 3) as item}
							<a href="/trips/{data.trip.slug}/items/{item.id}" class="border-line hover:border-ink-muted flex items-center gap-2 rounded-lg border px-3 py-2">
								<span class="font-mono text-ink-muted text-xs">
									{item.start_time ? formatTime(item.start_time) : '—'}
								</span>
								<span class="text-ink text-sm truncate">{item.title}</span>
							</a>
						{/each}
						{#if tomorrowItems.length > 3}
							<p class="text-ink-muted text-center text-xs">+{tomorrowItems.length - 3} more</p>
						{/if}
					</div>
				{:else}
					<p class="text-ink-muted mt-2 text-xs">Nothing scheduled.</p>
				{/if}
			</div>
		{/if}
	{/if}
</main>
```

- [ ] **Step 2: Run type check**

Run: `pnpm check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/routes/(app)/trips/[slug]/today/+page.svelte
git commit -m "feat(#33): replace Today tab card list with TodayTimeline component"
```

---

### Task 9: Add button — choice sheet

**Files:**
- Create: `src/lib/trip-mode/components/AddSheet.svelte`
- Modify: `src/lib/shell/nav-tabs.ts`
- Modify: `src/lib/shell/components/AppShell.svelte`

The Add button in the trip-mode nav is currently a link to `/items/new?from=trip`. Change it to open a `BottomSheet` with two choices: "Add item to today" and "Add expense". Each choice navigates to the appropriate form page.

- [ ] **Step 1: Create AddSheet.svelte**

Create `src/lib/trip-mode/components/AddSheet.svelte`:

```svelte
<script lang="ts">
	import BottomSheet from '$lib/ui/BottomSheet.svelte';
	import { goto } from '$app/navigation';

	let {
		open = $bindable(false),
		slug,
		todayDayId
	}: {
		open: boolean;
		slug: string;
		todayDayId: string | null;
	} = $props();

	function addItem() {
		open = false;
		const params = new URLSearchParams({ from: 'trip' });
		if (todayDayId) params.set('day', todayDayId);
		goto(`/trips/${slug}/items/new?${params.toString()}`);
	}

	function addExpense() {
		open = false;
		goto(`/trips/${slug}/expenses?action=add`);
	}
</script>

<BottomSheet bind:open title="Add">
	<div class="space-y-2">
		<button
			type="button"
			class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-surface-2 transition-colors"
			onclick={addItem}
		>
			<div class="bg-clay-tint text-clay flex h-10 w-10 items-center justify-center rounded-full">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
				</svg>
			</div>
			<div>
				<p class="text-ink text-sm font-semibold">Add item to today</p>
				<p class="text-ink-muted text-xs">Activity, meal, transport, etc.</p>
			</div>
		</button>

		<button
			type="button"
			class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-surface-2 transition-colors"
			onclick={addExpense}
		>
			<div class="bg-clay-tint text-clay flex h-10 w-10 items-center justify-center rounded-full">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
				</svg>
			</div>
			<div>
				<p class="text-ink text-sm font-semibold">Add expense</p>
				<p class="text-ink-muted text-xs">Log a cost for this trip</p>
			</div>
		</button>
	</div>
</BottomSheet>
```

- [ ] **Step 2: Update nav-tabs to mark Add as an action, not a link**

In `src/lib/shell/nav-tabs.ts`, change the Add tab's href to empty string and add an `action` field:

Replace the NavTab interface and the trip mode return:

```typescript
// src/lib/shell/nav-tabs.ts
import type { TripViewMode } from '$lib/trip-mode/activation';

export interface NavTab {
	id: string;
	label: string;
	href: string;
	icon: 'calendar' | 'dollar' | 'users' | 'more' | 'clock' | 'sun' | 'plus' | 'lock';
	oversized?: boolean;
	action?: 'add-sheet';
}

export interface NavConfig {
	tabs: NavTab[];
	accent: 'moss' | 'clay';
}

export function getNavConfig(slug: string, mode: TripViewMode): NavConfig {
	if (mode === 'trip') {
		return {
			accent: 'clay',
			tabs: [
				{ id: 'now', label: 'Now', href: `/trips/${slug}/now`, icon: 'clock' },
				{ id: 'today', label: 'Today', href: `/trips/${slug}/today`, icon: 'sun' },
				{ id: 'add', label: 'Add', href: '', icon: 'plus', oversized: true, action: 'add-sheet' },
				{ id: 'vault', label: 'Vault', href: `/trips/${slug}/vault`, icon: 'lock' }
			]
		};
	}
	return {
		accent: 'moss',
		tabs: [
			{ id: 'itinerary', label: 'Itinerary', href: `/trips/${slug}`, icon: 'calendar' },
			{ id: 'money', label: 'Money', href: `/trips/${slug}/expenses`, icon: 'dollar' },
			{ id: 'members', label: 'Members', href: `/trips/${slug}/members`, icon: 'users' },
			{ id: 'more', label: 'More', href: `/trips/${slug}/more`, icon: 'more' }
		]
	};
}

export function getActiveTab(pathname: string, mode: TripViewMode): string {
	if (mode === 'trip') {
		if (pathname.includes('/now')) return 'now';
		if (pathname.includes('/today')) return 'today';
		if (pathname.includes('/vault')) return 'vault';
		return 'now';
	}
	if (pathname.includes('/expenses') || pathname.includes('/budget')) return 'money';
	if (pathname.includes('/members')) return 'members';
	if (pathname.includes('/more') || pathname.includes('/inbox') || pathname.includes('/settings')) return 'more';
	return 'itinerary';
}
```

- [ ] **Step 3: Wire AddSheet into AppShell**

This step requires reading the current `AppShell.svelte` to understand its structure before modifying. The changes needed:

1. Import `AddSheet`
2. Add an `addSheetOpen` state variable
3. Derive `todayDayId` from the trip's days
4. Pass a callback to BottomNav/SideRail so that clicking the Add tab opens the sheet instead of navigating
5. Render `<AddSheet>` at the bottom of AppShell

Read `src/lib/shell/components/AppShell.svelte` first, then make the following changes:

- Add imports at the top of the script:
```typescript
import AddSheet from '$lib/trip-mode/components/AddSheet.svelte';
```

- Add state after existing state declarations:
```typescript
let addSheetOpen = $state(false);
```

- Derive `todayDayId` from the layout data:
```typescript
const todayDayId = $derived.by(() => {
	const todayStr = new Date().toISOString().split('T')[0];
	const day = data.days?.find((d: any) => d.date?.split(/[T ]/)[0] === todayStr);
	return day?.id ?? null;
});
```

- Where BottomNav renders tab buttons, add a check: if `tab.action === 'add-sheet'`, the button's click handler should set `addSheetOpen = true` instead of navigating. (The exact implementation depends on how BottomNav renders — it may need an `onAction` callback prop.)

- Add before the closing tag of the component:
```svelte
{#if data.trip}
	<AddSheet bind:open={addSheetOpen} slug={data.trip.slug} {todayDayId} />
{/if}
```

**Note to implementer:** Read `AppShell.svelte` and `BottomNav` (if separate) to find the exact insertion points. The key contract: when a nav tab has `action: 'add-sheet'`, clicking it calls a callback instead of navigating via `href`. The simplest approach is passing an `onAddSheet` callback from AppShell to the nav components.

- [ ] **Step 4: Run type check**

Run: `pnpm check`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/trip-mode/components/AddSheet.svelte src/lib/shell/nav-tabs.ts src/lib/shell/components/AppShell.svelte
git commit -m "feat(#33): add AddSheet bottom sheet, wire to nav Add button"
```

---

### Task 10: Visual verification

**Files:** None (verification only)

- [ ] **Step 1: Start dev servers**

Run: `pnpm dev` (frontend) and `./backend/start.sh` (PocketBase) if not already running.

- [ ] **Step 2: Verify Now tab states**

Navigate to an active trip's Now tab. Verify:
- If the current time falls within an item's time range → mid-event card renders with "Right now" pill, countdown, UP NEXT preview
- If between items → FREE TIME countdown card renders with UP NEXT preview
- If past 10pm or all items done → day-wrapped summary renders
- If today isn't in the trip date range → "No itinerary for today" message

To test different states, temporarily adjust item times in PocketBase admin or modify the `now` value in the server loader.

- [ ] **Step 3: Verify Today tab**

Navigate to the Today tab. Verify:
- Past items are dimmed (opacity-50)
- Current item has clay left border accent and "Right now" pill
- Future items render normally
- Progress pill shows "X of Y done"
- Page auto-scrolls to the current item
- Pencil edit icon appears on each card and links to the edit page
- Time slot dividers (Morning / Afternoon / Evening) appear correctly
- Tomorrow section still renders at the bottom

- [ ] **Step 4: Verify Add button**

Tap the Add (center) button in trip mode nav. Verify:
- Bottom sheet opens with "Add item to today" and "Add expense" options
- "Add item to today" navigates to `/trips/{slug}/items/new?from=trip&day={todayDayId}`
- "Add expense" navigates to `/trips/{slug}/expenses?action=add`
- Sheet dismisses on backdrop click and Escape

- [ ] **Step 5: Verify at mobile width (375px)**

Resize to 375px and repeat steps 2-4. Verify nothing overflows or breaks.

- [ ] **Step 6: Run pnpm check and tests**

Run: `pnpm check && pnpm vitest run`
Expected: All checks pass, all tests pass

- [ ] **Step 7: Commit any fixes from verification**

If fixes were needed, commit them:
```bash
git add -A
git commit -m "fix(#33): address visual verification issues"
```

---

### Task 11: E2E tests

**Files:**
- Create: `tests/e2e/trip-mode-views.spec.ts`

Critical-path E2E tests from the PRD testing strategy (§4). These verify the integration works end-to-end.

- [ ] **Step 1: Write E2E tests**

Create `tests/e2e/trip-mode-views.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/api/dev/login');
	await page.waitForURL('/trips');
});

test.describe('Trip Mode - Now tab', () => {
	test('shows correct state based on time of day', async ({ page }) => {
		// Navigate to an active trip's Now tab
		await page.locator('a[href*="/trips/"]').first().click();
		await page.locator('a[href*="/now"]').first().click();
		await page.waitForURL('**/now');

		// Should render one of the three states (not the stub "Coming soon" text)
		await expect(page.getByText('Coming soon')).not.toBeVisible();

		// Should show either "Right now", "Free time", "Day wrapped", or "No itinerary"
		const stateVisible = await page
			.getByText(/Right now|Free time|Day wrapped|No itinerary/)
			.first()
			.isVisible();
		expect(stateVisible).toBe(true);
	});
});

test.describe('Trip Mode - Today tab', () => {
	test('shows progress indicator and items', async ({ page }) => {
		await page.locator('a[href*="/trips/"]').first().click();
		await page.locator('a[href*="/today"]').first().click();
		await page.waitForURL('**/today');

		// Should show the day heading or "No itinerary" message
		const hasContent = await page
			.getByText(/of \d+ done|No itinerary|Nothing scheduled/)
			.first()
			.isVisible();
		expect(hasContent).toBe(true);
	});
});

test.describe('Trip Mode - Add button', () => {
	test('opens choice sheet with item and expense options', async ({ page }) => {
		await page.locator('a[href*="/trips/"]').first().click();

		// Click the Add button in trip mode nav
		await page.getByRole('button', { name: /add/i }).click();

		// Bottom sheet should appear with two options
		await expect(page.getByText('Add item to today')).toBeVisible();
		await expect(page.getByText('Add expense')).toBeVisible();
	});
});
```

- [ ] **Step 2: Run the E2E tests**

Run: `pnpm test:e2e tests/e2e/trip-mode-views.spec.ts`
Expected: All tests PASS (assuming dev server is running and test data includes an active trip)

Note: If the test trip isn't active (dates don't include today), the Now/Today tabs will show "No itinerary" — that's correct behavior. The test checks that a valid state renders, not a specific state.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/trip-mode-views.spec.ts
git commit -m "test(#33): add E2E tests for Trip Mode Now, Today, and Add"
```

---

## Summary

| Task | What | Commits |
|------|------|---------|
| 1 | Now state derivation (types + pure function + tests) | 1 |
| 2 | Countdown formatter | 1 |
| 3 | Now page server loader | 1 |
| 4 | Now sub-components (MidEvent, BetweenThings, DayWrapped) | 1 |
| 5 | Now page assembly | 1 |
| 6 | TodayItemCard component | 1 |
| 7 | TodayTimeline component | 1 |
| 8 | Today page update | 1 |
| 9 | Add button choice sheet + nav wiring | 1 |
| 10 | Visual verification + fixes | 0-1 |
| 11 | E2E tests | 1 |

**Total: 10-11 commits, ~11 new/modified files**

Dependencies within the plan:
```
Task 1 (now-state logic)
 └── Task 3 (server loader) ──┐
      Task 4 (sub-components) ─┤
                               └── Task 5 (Now page assembly)

Task 2 (countdown formatter) ← used by Tasks 4, 5

Task 6 (TodayItemCard) → Task 7 (TodayTimeline) → Task 8 (Today page)

Task 9 (Add sheet) — independent of Tasks 1-8

Task 10 (visual verification) — after all above
Task 11 (E2E tests) — after Task 10
```

Tasks 1-2 can run in parallel. Tasks 6-7 can start after Task 2. Task 9 is fully independent.
