# M6 — Polish & Nice-to-Haves

**Goal:** Fix all dogfood bugs, align the app with the visual design system, implement responsive desktop layouts, add external API integrations (Google Places, AeroDataBox), and ship the remaining spec features (trip cloning, parking lot views, recommendations, OG metadata, print view, checklist templates). After M6, Waypoint is v1-complete for the Traverse City Oct trip gate.

**Architecture note:** M6 is wide but shallow — most work is UI polish, layout refactors, and API integrations. No new collections or major data model changes. The heaviest lift is the responsive desktop layout (SideRail, 3-pane) and the Google Places integration (session tokens, server proxy). Dark mode is **explicitly skipped** per scope decision.

**Tech stack:** SvelteKit + TypeScript + Tailwind · PocketBase · Google Maps Places API (New) · AeroDataBox (RapidAPI) · Resend

---

## Key Design Decisions

1. **Bug fixes first.** M6a addresses all dogfood-reported bugs before any polish or features. These are regressions or gaps discovered during real-world use of the China trip.

2. **Desktop layout is a full sub-milestone.** The design handoff identifies four desktop debt items: bottom tabs → side rail at ≥900px, emoji icons → TypeIcon, 3-pane layout at ≥1280px, and a sign-in brand panel. These touch the layout shell used by every page, so they ship as a cohesive unit (M6c).

3. **Swipe + arrows for day navigation.** Touch swipe gestures AND prev/next arrow buttons on day detail. Uses `touch-action: pan-y` and horizontal swipe detection — no gesture library.

4. **Google Places uses session tokens.** Autocomplete requests within a session token are free; the place details call is the only one that costs. Server proxy at `/api/places/autocomplete` and `/api/places/details` keeps the API key off the client.

5. **Recommendations and parking lot views** scope TBD during implementation — inline sections vs. standalone routes decided when we see how the data looks on real trips.

6. **No dark mode.** Explicitly skipped per scope decision. Token prep (CSS custom properties) is already in place from the design system work; a future milestone can wire up the toggle.

7. **OG metadata on archive pages.** `<meta property="og:*">` tags in the archive `+page.svelte` `<svelte:head>` block. No server-side image generation — uses trip cover image if available.

8. **Print view is CSS-only.** `@media print` stylesheet hides nav, expands sections, forces page breaks between days. No separate route.

---

## Sub-Milestone Overview

| Sub-milestone | Scope | Estimated sessions |
|---|---|---|
| **M6a** | Bug fixes from dogfood feedback | 1 |
| **M6b** | UX polish from dogfood feedback | 1–2 |
| **M6c** | Design system alignment & desktop layout | 2 |
| **M6d** | External API integrations (Places, AeroDataBox) | 2 |
| **M6e** | Trip cloning & content features | 2 |
| **M6f** | E2E tests & final QA | 1 |

---

## File Map

### New files
| File | Sub-milestone | Purpose |
|---|---|---|
| `src/lib/components/DayNav.svelte` | M6b | Prev/next arrows + swipe container for day detail |
| `src/lib/components/ui/SideRail.svelte` | M6c | Desktop left navigation rail (replaces BottomNav at ≥900px) |
| `src/lib/components/ui/AppShell.svelte` | M6c | Responsive layout wrapper: bottom nav mobile, side rail tablet+, 3-pane desktop |
| `src/routes/api/places/autocomplete/+server.ts` | M6d | Google Places autocomplete proxy |
| `src/routes/api/places/details/+server.ts` | M6d | Google Places details proxy |
| `src/routes/api/flights/lookup/+server.ts` | M6d | AeroDataBox flight lookup proxy |
| `src/lib/components/PlacesAutocomplete.svelte` | M6d | Places search input with dropdown results |
| `src/lib/components/FlightLookup.svelte` | M6d | Flight number input with autofill preview |
| `src/routes/(app)/trips/[slug]/clone/+page.server.ts` | M6e | Clone trip server actions |
| `src/routes/(app)/trips/[slug]/clone/+page.svelte` | M6e | Clone wizard UI |
| `src/routes/(app)/trips/[slug]/parking-lot/+page.server.ts` | M6e | Trip-level parking lot data loader |
| `src/routes/(app)/trips/[slug]/parking-lot/+page.svelte` | M6e | Parking lot view |
| `src/lib/components/ParkingLotSection.svelte` | M6e | Reusable parking lot item list |
| `src/lib/config/checklist-templates.ts` | M6e | Packing, grocery, to-book template definitions |
| `src/lib/styles/print.css` | M6e | Print-friendly stylesheet |
| `tests/e2e/m6-polish.spec.ts` | M6f | M6 E2E tests |

### Modified files
| File | Sub-milestone | Changes |
|---|---|---|
| `src/routes/(app)/trips/[slug]/items/new/+page.server.ts` | M6a | Fix start/end time persistence |
| `src/routes/(app)/trips/[slug]/items/new/+page.svelte` | M6a, M6b, M6d | Fix time inputs, draft warning, Places/flight lookup |
| `src/routes/(app)/trips/[slug]/items/[itemId]/edit/+page.server.ts` | M6a | Fix start/end time persistence |
| `src/routes/(app)/trips/[slug]/items/[itemId]/edit/+page.svelte` | M6a, M6b, M6d | Fix time inputs, draft warning, Places/flight lookup |
| `src/routes/(app)/trips/[slug]/today/+page.server.ts` | M6a | Fix upcoming day sort order |
| `src/routes/(app)/trips/[slug]/today/upcoming/+page.server.ts` | M6a | Fix slot sort for next-day items |
| `src/lib/components/BottomNav.svelte` | M6a, M6c | Fix keyboard overlap, hide at ≥900px |
| `src/app.html` | M6a, M6e | Fix page title, add OG metadata slot |
| `static/manifest.json` | M6a | Fix app icon references |
| `src/routes/(app)/trips/[slug]/+page.svelte` | M6b | Days grouped under phases, show times |
| `src/routes/(app)/trips/[slug]/days/[dayId]/+page.svelte` | M6b | Day nav arrows/swipe, show times, larger day cards |
| `src/routes/(app)/trips/[slug]/items/[itemId]/+page.svelte` | M6b | Show times on detail |
| `src/lib/components/ui/FAB.svelte` | M6b | Always visible positioning |
| `src/routes/+layout.svelte` | M6c | AppShell integration |
| `src/routes/(app)/+layout.svelte` | M6c | AppShell integration, SideRail |
| `src/routes/(auth)/login/+page.svelte` | M6c | Desktop brand panel |
| `src/lib/components/ui/TypeIcon.svelte` | M6c | Ensure all item types/subtypes covered |
| `src/routes/layout.css` | M6c | Design token CSS custom properties |
| `src/routes/(app)/trips/[slug]/phases/[phaseId]/+page.svelte` | M6e | Phase parking lot section |
| `src/routes/(app)/trips/[slug]/more/+page.svelte` | M6e | Clone link, parking lot link |
| `src/routes/archive/[token]/+page.svelte` | M6e | OG metadata |
| `src/routes/archive/[token]/+page.server.ts` | M6e | OG data in load |

---

## M6a — Bug Fixes from Dogfood

**Focus:** Fix every bug reported during the China dogfood trip. Zero tolerance — these are real-world failures.

### Task 1: Fix start/end times not saving

**Bug:** Adding or editing an item with start_time / end_time fields → times are blank after save and blank when re-editing.

**Root cause:** PocketBase defines `start_time` and `end_time` as `type: 'date'`, which expects full datetime strings like `2025-01-15 14:30:00.000Z`. HTML `<input type="time">` sends bare `HH:MM` strings (e.g. `09:30`). PocketBase silently discards the invalid format — no error, just empty field.

**Files:** `src/routes/(app)/trips/[slug]/items/new/+page.server.ts`, `src/routes/(app)/trips/[slug]/items/[itemId]/edit/+page.server.ts`, `src/routes/(app)/trips/[slug]/items/new/+page.svelte`, `src/routes/(app)/trips/[slug]/items/[itemId]/edit/+page.svelte`

1. - [ ] Read the item new/edit server actions to confirm `start_time`/`end_time` are passed through as-is from form data
2. - [ ] **Fix on write:** In server actions, convert bare `HH:MM` to full PB datetime before create/update:

```typescript
function timeToDatetime(time: string, dateStr: string): string {
  if (!time) return '';
  return `${dateStr.split(/[T ]/)[0]} ${time}:00.000Z`;
}
```

3. - [ ] **Fix on read:** In the edit page server loader, extract `HH:MM` from the stored datetime so `<input type="time">` can pre-fill:

```typescript
function datetimeToTime(dt: string): string {
  if (!dt) return '';
  const match = dt.match(/(\d{2}:\d{2})/);
  return match ? match[1] : '';
}
```

4. - [ ] Apply the same conversion in both the `new` and `edit` server actions
5. - [ ] `pnpm check`
6. - [ ] Manual test: create item with times → verify times appear on detail → edit item → verify times pre-filled → save → verify times persist

### Task 2: Fix today view sort order for following day

**Bug:** When viewing the upcoming/next day in today view, morning slot items sort to the bottom instead of the top.

**Dependency:** This may self-resolve once Task 1 (time persistence) is fixed. The template already iterates slots in correct order — if items have no saved `start_time`, the within-slot sort may be producing the wrong order because all time values are empty strings.

**Files:** `src/routes/(app)/trips/[slug]/today/+page.server.ts`, `src/routes/(app)/trips/[slug]/today/upcoming/+page.server.ts`

1. - [ ] **After completing Task 1**, test today view with items that have saved times — check if sort order is now correct
2. - [ ] If still broken: read the today/upcoming page server loaders to trace the sort logic
3. - [ ] If explicit fix needed: ensure slot order is `morning` → `afternoon` → `evening` → `anytime` (not alphabetical, which puts `morning` after `evening`):

```typescript
const SLOT_ORDER: Record<string, number> = { morning: 0, afternoon: 1, evening: 2, anytime: 3 };
items.sort((a, b) => (SLOT_ORDER[a.slot] ?? 9) - (SLOT_ORDER[b.slot] ?? 9));
```

4. - [ ] `pnpm check`

### Task 3: Fix bottom nav showing on top of keyboard

**Bug:** On iOS, when a text input is focused and the keyboard opens, the fixed bottom nav renders above the keyboard instead of behind it.

**Files:** `src/lib/components/BottomNav.svelte`

1. - [ ] Read current BottomNav positioning styles
2. - [ ] Add `env(safe-area-inset-bottom)` padding and use `position: fixed; bottom: 0` with proper z-index
3. - [ ] Add a focus detection mechanism: listen for `focusin`/`focusout` events on inputs and hide the bottom nav when an input is focused on mobile

```svelte
<script lang="ts">
  let inputFocused = $state(false);

  function handleFocusIn(e: FocusEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      inputFocused = true;
    }
  }

  function handleFocusOut() {
    inputFocused = false;
  }
</script>

<svelte:window on:focusin={handleFocusIn} on:focusout={handleFocusOut} />

{#if !inputFocused}
  <nav class="fixed bottom-0 ...">
    <!-- nav content -->
  </nav>
{/if}
```

4. - [ ] `pnpm check`
5. - [ ] Manual test on iOS Safari: focus a text input → keyboard opens → bottom nav should not be visible

### Task 4: Fix blank iOS app icon

**Bug:** PWA icon on iOS home screen is blank. Favicon works in browser tabs.

**Files:** `static/manifest.json`, `src/app.html`, static icon files

1. - [ ] Check `manifest.json` for correct icon paths, sizes, and `purpose` fields
2. - [ ] Verify `apple-touch-icon` link tag exists in `app.html` with correct path
3. - [ ] Verify icon files exist at the referenced paths (`static/icons/icon-192.png`, `static/icons/icon-512.png`)
4. - [ ] If icons exist but are placeholder/wrong format: ensure they are valid PNGs, 192x192 and 512x512
5. - [ ] Add maskable icon variant if missing:

```json
{
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

6. - [ ] Ensure `<link rel="apple-touch-icon" href="/icons/icon-192.png">` is in `app.html`
7. - [ ] `pnpm check`

### Task 5: Fix browser tab title

**Bug:** Browser tab shows the SvelteKit route name, not "Waypoint".

**Files:** `src/app.html`

1. - [ ] Update `<title>` in `app.html` to `Waypoint`
2. - [ ] Verify `<svelte:head>` usage in layouts — if a `<title>` is set per-route, ensure the base title is "Waypoint" and per-route titles append to it (e.g., "Spain 2025 — Waypoint")

```html
<title>Waypoint</title>
```

3. - [ ] Add `<svelte:head><title>{data.trip?.title ? `${data.trip.title} — Waypoint` : 'Waypoint'}</title></svelte:head>` to trip layout

### Task 6: Fix phases showing "no days" when days exist

**Bug:** Phase detail says "no days are in this phase" even when days with that phase exist. Phase cards on trip overview also don't show day count correctly.

**Files:** `src/routes/(app)/trips/[slug]/phases/[phaseId]/+page.svelte`, `src/routes/(app)/trips/[slug]/phases/[phaseId]/+page.server.ts`

1. - [ ] Read the phase detail server loader to check how days are filtered for the phase
2. - [ ] Check that the filter correctly uses the `phases` multi-relation field on days (days have a `phases: string[]` field, not a single `phase` field)
3. - [ ] Fix the filter: `days.filter(d => d.phases.includes(phaseId))` — the likely bug is checking `d.phase === phaseId` instead of `d.phases.includes(phaseId)`
4. - [ ] `pnpm check`

### Task 7: Fix add button cutoff on mobile

**Bug:** The FAB gets cut off at the bottom of the screen on mobile, likely positioned behind or overlapping the bottom nav.

**Files:** `src/lib/components/ui/FAB.svelte`

1. - [ ] Read FAB positioning — ensure `bottom` value clears the bottom nav height (approximately `bottom-20` / 80px)
2. - [ ] Adjust FAB position: `bottom: calc(env(safe-area-inset-bottom) + 5rem)` to clear both the bottom nav and safe area
3. - [ ] `pnpm check`

**Commit:**
```
git commit -m "M6a: fix dogfood bugs — times, sort, keyboard nav, icons, title, phases, FAB"
```

---

## M6b — UX Polish from Dogfood

**Focus:** Implement all UX improvements identified during the China dogfood trip. These aren't bugs — they're friction points that need smoothing.

### Task 1: Draft save / back-navigation warning

**What:** Warn the user when navigating away from an unsaved item form. Prevent accidental loss of typed content.

**Files:** `src/routes/(app)/trips/[slug]/items/new/+page.svelte`, `src/routes/(app)/trips/[slug]/items/[itemId]/edit/+page.svelte`

1. - [ ] Add a `dirty` state flag that turns `true` when any form field changes from its initial value
2. - [ ] Use `beforeunload` event to warn on browser back/refresh:

```svelte
<script lang="ts">
  let dirty = $state(false);

  function handleBeforeUnload(e: BeforeUnloadEvent) {
    if (dirty) {
      e.preventDefault();
    }
  }

  function markDirty() {
    dirty = true;
  }
</script>

<svelte:window on:beforeunload={handleBeforeUnload} />
```

3. - [ ] Add `on:input={markDirty}` to form inputs
4. - [ ] For SvelteKit client-side navigation, use `beforeNavigate` from `$app/navigation`:

```typescript
import { beforeNavigate } from '$app/navigation';

beforeNavigate(({ cancel }) => {
  if (dirty && !confirm('You have unsaved changes. Leave anyway?')) {
    cancel();
  }
});
```

5. - [ ] Reset `dirty = false` on successful form submission (in the form action's `onResult`)
6. - [ ] `pnpm check`

### Task 2: Always-visible add button

**What:** The add-item FAB should be visible without scrolling. Currently it's at the bottom of content and can be off-screen.

**Files:** `src/lib/components/ui/FAB.svelte`, day detail page

1. - [ ] Ensure FAB uses `position: fixed` (not `absolute`) so it stays visible regardless of scroll position
2. - [ ] Verify FAB renders on all relevant screens: day detail, phase detail, trip overview
3. - [ ] FAB should be visible immediately — no scroll-reveal behavior
4. - [ ] `pnpm check`

### Task 3: Days grouped under phases on trip overview

**What:** On the trip overview, instead of a flat list of days after the phases section, show days nested under their parent phases (like an indented list).

**Files:** `src/routes/(app)/trips/[slug]/+page.svelte`

1. - [ ] Replace the separate "Phases" section + flat "Days" section with a single unified view
2. - [ ] For each phase, show the phase card followed by its days indented underneath:

```svelte
{#each data.phases as phase}
  <Card href="/trips/{data.trip.slug}/phases/{phase.id}" accent={phase.color}>
    <div class="p-3">
      <h3 class="text-ink font-semibold">{phase.name}</h3>
      <p class="text-ink-muted font-mono mt-1 text-[11.5px]">
        {formatDateRange(phase.start_date, phase.end_date)}
        {#if phase.location} · {phase.location}{/if}
      </p>
    </div>
  </Card>
  <!-- Days in this phase, indented -->
  {#each daysInPhase(phase) as day}
    <a href="/trips/{data.trip.slug}/days/{day.id}"
       class="ml-4 flex items-center justify-between rounded-lg bg-surface px-3 py-2.5 text-sm hover:bg-surface/80">
      <span class="text-ink">{dayLabel(day)}</span>
      {#if dayItemCount(day)}
        <span class="text-ink-muted text-xs">{dayItemCount(day)} items</span>
      {/if}
    </a>
  {/each}
{/each}
```

3. - [ ] Handle days that span multiple phases — show under the first phase, or duplicate under each
4. - [ ] Handle orphan days (no phase) — show in an "Unassigned" section at the bottom
5. - [ ] Increase tap target size for day rows: minimum `py-3` for 48px touch target
6. - [ ] `pnpm check`

### Task 4: Show times on overview and extract duplicate formatTime

**What:** `formatTime` is already implemented but duplicated in two components (day detail and item detail). Extract to shared utility and add time display to the trip overview (where it's NOT currently shown).

**Files:** `src/lib/utils/format.ts`, `src/routes/(app)/trips/[slug]/+page.svelte`, `src/routes/(app)/trips/[slug]/days/[dayId]/+page.svelte`, `src/routes/(app)/trips/[slug]/items/[itemId]/+page.svelte`

1. - [ ] Grep for `formatTime` to find the two duplicate implementations
2. - [ ] Extract to `src/lib/utils/format.ts` as shared utility:

```typescript
export function formatTime(time: string): string {
  if (!time) return '';
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

export function formatTimeRange(start: string, end: string): string {
  if (!start && !end) return '';
  if (start && end) return `${formatTime(start)} – ${formatTime(end)}`;
  return formatTime(start || end);
}
```

3. - [ ] Replace both inline implementations with imports from `format.ts`
4. - [ ] Add time display to trip overview day rows (where times are NOT currently shown)
5. - [ ] `pnpm check`

### Task 5: Day navigation — prev/next arrows and swipe

**What:** On the day detail screen, add prev/next day navigation arrows and horizontal swipe gestures to move between days.

**Files:** New `src/lib/components/DayNav.svelte`, `src/routes/(app)/trips/[slug]/days/[dayId]/+page.svelte`

**Note:** No server loader changes needed. `data.days` is already available via parent layout data merge — compute prev/next client-side from the sorted days array.

1. - [ ] In the day detail page component, derive `prevDayId` and `nextDayId` from the parent layout's `data.days`:

```typescript
const sortedDays = $derived(data.days.toSorted((a, b) => a.date.localeCompare(b.date)));
const dayIdx = $derived(sortedDays.findIndex(d => d.id === data.day.id));
const prevDayId = $derived(dayIdx > 0 ? sortedDays[dayIdx - 1].id : null);
const nextDayId = $derived(dayIdx < sortedDays.length - 1 ? sortedDays[dayIdx + 1].id : null);
```

2. - [ ] Create `DayNav.svelte` component with prev/next arrows:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';

  let { prevHref, nextHref, label }: {
    prevHref: string | null;
    nextHref: string | null;
    label: string;
  } = $props();

  let touchStartX = $state(0);
  let touchEndX = $state(0);
  const SWIPE_THRESHOLD = 50;

  function handleTouchStart(e: TouchEvent) {
    touchStartX = e.changedTouches[0].screenX;
  }

  function handleTouchEnd(e: TouchEvent) {
    touchEndX = e.changedTouches[0].screenX;
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > SWIPE_THRESHOLD) {
      if (diff > 0 && nextHref) goto(nextHref);
      if (diff < 0 && prevHref) goto(prevHref);
    }
  }
</script>

<div
  class="flex items-center justify-between px-4 py-2"
  ontouchstart={handleTouchStart}
  ontouchend={handleTouchEnd}
>
  {#if prevHref}
    <a href={prevHref} class="text-moss p-2" aria-label="Previous day">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </a>
  {:else}
    <div class="w-10"></div>
  {/if}
  <span class="text-ink font-semibold text-sm">{label}</span>
  {#if nextHref}
    <a href={nextHref} class="text-moss p-2" aria-label="Next day">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </a>
  {:else}
    <div class="w-10"></div>
  {/if}
</div>
```

3. - [ ] Integrate `DayNav` into day detail page below the NavBar
4. - [ ] Set `touch-action: pan-y` on the swipe container to prevent horizontal scroll interference
5. - [ ] Clamp at trip boundaries (no wrapping) per SPEC_BACKLOG decision
6. - [ ] `pnpm check`

### Task 6: Larger day tap targets on mobile

**What:** Day rows on the trip overview are too small to comfortably tap on mobile.

**Files:** `src/routes/(app)/trips/[slug]/+page.svelte`

1. - [ ] Increase day row padding: minimum `py-3` (12px × 2 = 48px touch target minimum per WCAG)
2. - [ ] This is addressed as part of Task 3 (days grouped under phases) — ensure the new day rows meet the 48px minimum
3. - [ ] `pnpm check`

### Task 7: iOS swipe-back enters editing — accept as v1 behavior

**What:** Swiping back on iPhone sometimes re-enters the edit form instead of navigating to the parent page.

**Root cause:** Server actions use `redirect(303, ...)` after successful save, which is the standard SvelteKit pattern. Changing to `goto()` with `replaceState: true` would require refactoring away from server actions, which adds complexity for a minor UX annoyance.

**Decision:** Accept stale-form-on-back-nav as v1 behavior. The draft warning from Task 1 (which shows "You have unsaved changes") provides a safety net — if users swipe back into a stale form, the warning differentiates "real edits" from "stale page."

1. - [ ] No code changes — document as known v1 limitation
2. - [ ] Verify the draft warning (Task 1) fires correctly when users land on a stale form via back-nav

**Commit:**
```
git commit -m "M6b: UX polish — draft warning, day nav, grouped days, times, tap targets"
```

---

## M6c — Design System Alignment & Desktop Layout

**Focus:** Align the app with the visual design handoff. Replace emoji icons with TypeIcon everywhere, implement responsive SideRail at ≥900px, 3-pane layout at ≥1280px, sign-in brand panel, and refresh the app icon artwork.

### Task 1: Design token CSS custom properties

**What:** The codebase already has most tokens defined (`paper`, `surface`, `ink`, `ink-soft`, `ink-muted`, `line`, `moss`, `moss-soft`, `moss-tint`, `clay`, `gold`, `gold-tint`, `sky`, `sky-tint`). Only two are missing: `clay-tint` and `error`. The naming convention is `-tint` (NOT `-light`).

**Files:** `src/routes/layout.css`

1. - [ ] Add the two missing tokens to `layout.css`:

```css
--color-clay-tint: #F0E0D6;
--color-error: #B33A3A;
```

2. - [ ] Verify typography tokens exist (Fraunces, Inter, JetBrains Mono) — add if missing
3. - [ ] Audit TypeIcon and any hardcoded hex colors to use the token system (e.g. `bg-sky-tint` instead of `bg-[#E0EBF5]`)
4. - [ ] `pnpm check`

### Task 2: TypeIcon color normalization + emoji replacement

**What:** TypeIcon already covers all 6 item types with inline SVGs. Colors use hardcoded hex values that need normalization to the design token system. Emoji usage exists in only 2 files: `expenses/+page.svelte` and `budget/+page.svelte`.

**Files:** `src/lib/components/ui/TypeIcon.svelte`, `src/routes/(app)/trips/[slug]/expenses/+page.svelte`, `src/routes/(app)/trips/[slug]/budget/+page.svelte`

1. - [ ] Read TypeIcon — replace any hardcoded hex colors with token references:
   - `lodging` → `text-sky` / `bg-sky-tint`
   - `transportation` → `text-ink` / `bg-line`
   - `activity` → `text-gold` / `bg-gold-tint`
   - `meal` → `text-clay` / `bg-clay-tint`
   - `note` → `text-ink-soft` / `bg-paper`
   - `checklist` → `text-moss` / `bg-moss-tint`
2. - [ ] Replace emoji characters in `expenses/+page.svelte` and `budget/+page.svelte` with `<TypeIcon>` or plain text labels
3. - [ ] `pnpm check`

### Task 3: AppShell responsive layout wrapper

**What:** Create `AppShell` component that renders `BottomNav` on mobile and `SideRail` on tablet+ (≥900px).

**Files:** New `src/lib/components/ui/AppShell.svelte`, new `src/lib/components/ui/SideRail.svelte`

1. - [ ] Create `SideRail.svelte` — fixed left column with vertical nav links:

```svelte
<script lang="ts">
  import { page } from '$app/state';

  const navItems = [
    { label: 'Trips', href: '/trips', icon: 'trips' },
    { label: 'Settings', href: '/settings', icon: 'settings' }
  ];

  let { tripSlug }: { tripSlug?: string } = $props();

  const tripItems = $derived(tripSlug ? [
    { label: 'Overview', href: `/trips/${tripSlug}`, icon: 'overview' },
    { label: 'Today', href: `/trips/${tripSlug}/today`, icon: 'today' },
    { label: 'Budget', href: `/trips/${tripSlug}/budget`, icon: 'budget' },
    { label: 'Vault', href: `/trips/${tripSlug}/vault`, icon: 'vault' },
    { label: 'More', href: `/trips/${tripSlug}/more`, icon: 'more' },
  ] : []);
</script>

<nav class="fixed left-0 top-0 hidden h-full w-[72px] flex-col items-center gap-2 border-r border-line bg-surface pt-4 md-desktop:flex">
  <!-- Logo/brand mark at top -->
  <div class="mb-4 font-display text-moss text-lg font-semibold">W</div>

  {#each (tripSlug ? tripItems : navItems) as item}
    {@const active = page.url.pathname === item.href || page.url.pathname.startsWith(item.href + '/')}
    <a
      href={item.href}
      class="flex w-14 flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[10px]
             {active ? 'bg-moss-tint text-moss font-semibold' : 'text-ink-muted hover:bg-paper'}"
    >
      <!-- icon SVG based on item.icon -->
      <span>{item.label}</span>
    </a>
  {/each}
</nav>
```

2. - [ ] Create `AppShell.svelte` — handles the responsive breakpoints:

```svelte
<script lang="ts">
  import BottomNav from './BottomNav.svelte';
  import SideRail from './SideRail.svelte';
  import type { Snippet } from 'svelte';

  let { children, tripSlug }: { children: Snippet; tripSlug?: string } = $props();
</script>

<!-- Mobile: content + bottom nav -->
<div class="md-desktop:hidden">
  {@render children()}
  <BottomNav />
</div>

<!-- Desktop: side rail + content -->
<div class="hidden md-desktop:flex">
  <SideRail {tripSlug} />
  <div class="ml-[72px] flex-1">
    {@render children()}
  </div>
</div>
```

3. - [ ] Add custom Tailwind breakpoints in the `@theme` block of `src/routes/layout.css` (project uses Tailwind v4 CSS-first config, NOT `tailwind.config.js`):

```css
@theme {
  --breakpoint-md-desktop: 900px;
  --breakpoint-lg-desktop: 1280px;
}
```

4. - [ ] Integrate `AppShell` into `src/routes/(app)/+layout.svelte`, replacing direct BottomNav usage
5. - [ ] `pnpm check`
6. - [ ] Test at 375px (mobile), 900px (tablet), 1280px (desktop) breakpoints

### Task 4: Sign-in brand panel

**What:** On desktop (≥900px), the login page shows a split layout: left panel with Waypoint branding (logo, tagline, illustration), right panel with the auth form.

**Files:** `src/routes/(auth)/login/+page.svelte`

1. - [ ] Read current login page
2. - [ ] Wrap in a responsive container:

```svelte
<div class="min-h-screen md-desktop:flex">
  <!-- Brand panel: hidden on mobile, shown on desktop -->
  <div class="hidden md-desktop:flex md-desktop:w-1/2 flex-col items-center justify-center bg-moss text-paper p-12">
    <h1 class="font-display text-4xl font-bold italic">Waypoint</h1>
    <p class="mt-4 text-lg text-paper/80 max-w-sm text-center">
      Plan trips together. Share the adventure.
    </p>
  </div>

  <!-- Auth form: full width on mobile, half on desktop -->
  <div class="flex min-h-screen flex-col items-center justify-center p-6 md-desktop:w-1/2 md-desktop:min-h-0">
    <!-- existing form content -->
  </div>
</div>
```

3. - [ ] `pnpm check`

### Task 5: App icon artwork refresh

**What:** Generate new icon PNGs in the paper/ink/moss palette so the home screen icon matches the in-app design.

**Files:** `static/icons/icon-192.png`, `static/icons/icon-512.png`

1. - [ ] Design a simple icon: moss-colored waypoint glyph (map pin or compass) on a paper-colored background
2. - [ ] Generate 192×192 and 512×512 PNG files
3. - [ ] Keep maskable safe area (inner 80% of the icon contains the content)
4. - [ ] Update `manifest.json` icon entries
5. - [ ] Update `apple-touch-icon` in `app.html`
6. - [ ] Note: actual artwork generation may require Scott's input — implement a placeholder that matches the color palette and flag for Scott's review

**Commit:**
```
git commit -m "M6c: design system alignment — tokens, TypeIcon, AppShell, SideRail, brand panel"
```

---

## M6d — External API Integrations

**Focus:** Google Places autofill for location-based items and AeroDataBox flight number lookup for transportation items.

### Task 1: Google Places autocomplete proxy

**What:** Server-side proxy that handles Google Places autocomplete requests with session tokens. Keeps the API key off the client.

**Files:** New `src/routes/api/places/autocomplete/+server.ts`, new `src/routes/api/places/details/+server.ts`

1. - [ ] Note: `.env.example` already has `GOOGLE_MAPS_API_KEY` — use that name (not `GOOGLE_PLACES_API_KEY`)
2. - [ ] Create autocomplete endpoint:

```typescript
// src/routes/api/places/autocomplete/+server.ts
import { json } from '@sveltejs/kit';
import { GOOGLE_MAPS_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const input = url.searchParams.get('input');
  const sessionToken = url.searchParams.get('session_token');
  if (!input) return json({ predictions: [] });

  const res = await fetch(
    `https://places.googleapis.com/v1/places:autocomplete`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      },
      body: JSON.stringify({
        input,
        sessionToken,
      }),
    }
  );

  const data = await res.json();
  return json(data);
};
```

3. - [ ] Create details endpoint:

```typescript
// src/routes/api/places/details/+server.ts
import { json } from '@sveltejs/kit';
import { GOOGLE_MAPS_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const placeId = url.searchParams.get('place_id');
  const sessionToken = url.searchParams.get('session_token');
  if (!placeId) return json({ error: 'Missing place_id' }, { status: 400 });

  const fields = 'displayName,formattedAddress,location,id,websiteUri,internationalPhoneNumber';
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${placeId}?sessionToken=${sessionToken}`,
    {
      headers: {
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': fields,
      },
    }
  );

  const data = await res.json();
  return json(data);
};
```

4. - [ ] `pnpm check`

### Task 2: PlacesAutocomplete component

**What:** Reusable autocomplete input that searches Google Places and returns structured location data.

**Files:** New `src/lib/components/PlacesAutocomplete.svelte`

1. - [ ] Create component with debounced input, dropdown results, and selection handler:

```svelte
<script lang="ts">
  let { onSelect }: {
    onSelect: (place: { name: string; address: string; coords: { lat: number; lng: number }; placeId: string }) => void;
  } = $props();

  let query = $state('');
  let predictions = $state<Array<{ placePrediction: { placeId: string; text: { text: string } } }>>([]);
  let sessionToken = $state(crypto.randomUUID());
  let showDropdown = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout>;

  function handleInput() {
    clearTimeout(debounceTimer);
    if (query.length < 3) { predictions = []; return; }
    debounceTimer = setTimeout(async () => {
      const res = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(query)}&session_token=${sessionToken}`);
      const data = await res.json();
      predictions = data.suggestions ?? [];
      showDropdown = predictions.length > 0;
    }, 300);
  }

  async function selectPlace(placeId: string) {
    const res = await fetch(`/api/places/details?place_id=${placeId}&session_token=${sessionToken}`);
    const place = await res.json();
    onSelect({
      name: place.displayName?.text ?? '',
      address: place.formattedAddress ?? '',
      coords: place.location ? { lat: place.location.latitude, lng: place.location.longitude } : { lat: 0, lng: 0 },
      placeId: place.id ?? placeId,
    });
    sessionToken = crypto.randomUUID(); // new session after details call
    showDropdown = false;
    query = '';
  }
</script>
```

2. - [ ] Style dropdown with Card/surface design tokens
3. - [ ] Handle click-outside to dismiss dropdown
4. - [ ] `pnpm check`

### Task 3: Integrate Places into item forms

**What:** Add Places autocomplete to the item new/edit forms for lodging, activity, and meal types.

**Files:** `src/routes/(app)/trips/[slug]/items/new/+page.svelte`, `src/routes/(app)/trips/[slug]/items/[itemId]/edit/+page.svelte`

1. - [ ] Import `PlacesAutocomplete` component
2. - [ ] Show Places search above the location fields when item type is `lodging`, `activity`, or `meal`
3. - [ ] On place selection, autofill: `location_name`, `location_address`, `location_coords`, `google_place_id`
4. - [ ] Allow manual override of any autofilled field
5. - [ ] Show "Powered by Google" attribution per API terms
6. - [ ] `pnpm check`

### Task 4: AeroDataBox flight lookup proxy

**What:** Server-side proxy for AeroDataBox flight number lookups.

**Files:** New `src/routes/api/flights/lookup/+server.ts`

1. - [ ] Note: `.env.example` already has `AERODATABOX_API_KEY` — use that name (not `AERO_DATABOX_API_KEY`)
2. - [ ] Create flight lookup endpoint:

```typescript
// src/routes/api/flights/lookup/+server.ts
import { json } from '@sveltejs/kit';
import { AERODATABOX_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const flightNumber = url.searchParams.get('flight');
  const date = url.searchParams.get('date'); // YYYY-MM-DD
  if (!flightNumber || !date) return json({ error: 'Missing flight or date' }, { status: 400 });

  const res = await fetch(
    `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flightNumber)}/${date}`,
    {
      headers: {
        'X-RapidAPI-Key': AERODATABOX_API_KEY,
        'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
      },
    }
  );

  if (!res.ok) return json({ error: 'Flight not found' }, { status: 404 });
  const data = await res.json();
  return json(data);
};
```

3. - [ ] `pnpm check`

### Task 5: FlightLookup component

**What:** Flight number input that queries AeroDataBox and autofills departure/arrival details.

**Files:** New `src/lib/components/FlightLookup.svelte`

1. - [ ] Create component with flight number input and date picker:

```svelte
<script lang="ts">
  let { onSelect }: {
    onSelect: (flight: {
      title: string;
      start_time: string;
      end_time: string;
      start_tz: string;
      end_tz: string;
      location_name: string; // departure airport
      description: string;   // arrival airport + airline
    }) => void;
  } = $props();

  let flightNumber = $state('');
  let flightDate = $state('');
  let loading = $state(false);
  let error = $state('');

  async function lookupFlight() {
    if (!flightNumber || !flightDate) return;
    loading = true;
    error = '';
    try {
      const res = await fetch(`/api/flights/lookup?flight=${encodeURIComponent(flightNumber)}&date=${flightDate}`);
      if (!res.ok) { error = 'Flight not found'; return; }
      const data = await res.json();
      const flight = Array.isArray(data) ? data[0] : data;
      if (!flight) { error = 'No results'; return; }

      onSelect({
        title: `${flight.airline?.name ?? ''} ${flightNumber}`.trim(),
        start_time: flight.departure?.scheduledTime?.local?.split('T')[1]?.slice(0, 5) ?? '',
        end_time: flight.arrival?.scheduledTime?.local?.split('T')[1]?.slice(0, 5) ?? '',
        start_tz: flight.departure?.airport?.timeZone ?? '',
        end_tz: flight.arrival?.airport?.timeZone ?? '',
        location_name: `${flight.departure?.airport?.name ?? ''} (${flight.departure?.airport?.iata ?? ''})`,
        description: `→ ${flight.arrival?.airport?.name ?? ''} (${flight.arrival?.airport?.iata ?? ''})`,
      });
    } finally {
      loading = false;
    }
  }
</script>
```

2. - [ ] Style with design tokens
3. - [ ] Show loading state and error messages inline
4. - [ ] `pnpm check`

### Task 6: Integrate FlightLookup into item forms

**What:** Add flight lookup to item forms when type is `transportation` and subtype is `flight`.

**Files:** `src/routes/(app)/trips/[slug]/items/new/+page.svelte`, `src/routes/(app)/trips/[slug]/items/[itemId]/edit/+page.svelte`

1. - [ ] Import `FlightLookup` component
2. - [ ] Show flight lookup field when `type === 'transportation'` and `subtype === 'flight'`
3. - [ ] On flight selection, autofill: `title`, `start_time`, `end_time`, `start_tz`, `end_tz`, `location_name`, `description`
4. - [ ] Allow manual override of autofilled fields
5. - [ ] `pnpm check`

**Commit:**
```
git commit -m "M6d: external API integrations — Google Places autofill, AeroDataBox flight lookup"
```

---

## M6e — Trip Cloning & Content Features

**Focus:** Trip cloning wizard, checklist templates, parking lot views, OG metadata for archives, print-friendly view.

### Task 1: Trip cloning

**What:** Clone an existing trip with per-category opt-in for what to bring over (phases, items by type, budget categories, etc.).

**Files:** New `src/routes/(app)/trips/[slug]/clone/+page.server.ts`, new `src/routes/(app)/trips/[slug]/clone/+page.svelte`, `src/routes/(app)/trips/[slug]/more/+page.svelte`

1. - [ ] Create clone page server loader — loads source trip data:

```typescript
export const load = async ({ params, locals }) => {
  const trip = await locals.pb.collection('trips').getFirstListItem(`slug="${params.slug}"`);
  const phases = await locals.pb.collection('phases').getFullList({ filter: `trip="${trip.id}"` });
  const items = await locals.pb.collection('items').getFullList({ filter: `trip="${trip.id}"` });
  return { sourceTrip: trip, phases, items };
};
```

2. - [ ] Create clone form action — creates new trip + selected data:

```typescript
export const actions = {
  default: async ({ request, locals, params }) => {
    const formData = await request.formData();
    const title = formData.get('title') as string;
    const startDate = formData.get('start_date') as string;
    const endDate = formData.get('end_date') as string;
    const includePhases = formData.get('include_phases') === 'on';
    const includeItems = formData.getAll('include_item_types') as string[];
    // ... create trip, optionally clone phases, items
  }
};
```

3. - [ ] Create clone UI with checkboxes:
   - New trip title, dates
   - [ ] Clone phases (with date offset)
   - [ ] Clone items by type: lodging, transportation, activity, meal, note, checklist
   - [ ] Clone budget categories
4. - [ ] Date offset logic: calculate the difference between source and target start dates, shift all phase dates and day dates by that offset
5. - [ ] Add "Clone trip" link on the trip More page
6. - [ ] `pnpm check`

### Task 2: Checklist templates

**What:** Pre-built checklist templates (packing, grocery, to-book) that can be applied when creating a checklist item.

**Files:** New `src/lib/config/checklist-templates.ts`, `src/routes/(app)/trips/[slug]/items/new/+page.svelte`

1. - [ ] Create template definitions:

```typescript
export interface ChecklistTemplate {
  name: string;
  description: string;
  items: string[];
}

export const checklistTemplates: ChecklistTemplate[] = [
  {
    name: 'Packing',
    description: 'Common items to pack for a trip',
    items: [
      'Passport / ID',
      'Phone charger',
      'Adapter / converter',
      'Toiletries',
      'Medications',
      'Comfortable walking shoes',
      'Weather-appropriate clothing',
      'Sunscreen',
      'Reusable water bottle',
      'Snacks',
    ],
  },
  {
    name: 'Grocery',
    description: 'Grocery run for a trip rental',
    items: [
      'Water',
      'Coffee / tea',
      'Breakfast items',
      'Snacks',
      'Fruits',
      'Lunch supplies',
      'Dinner ingredients',
      'Drinks',
      'Paper towels',
      'Trash bags',
    ],
  },
  {
    name: 'To Book',
    description: 'Things to book before departure',
    items: [
      'Flights',
      'Accommodation',
      'Car rental',
      'Travel insurance',
      'Restaurant reservations',
      'Activity tickets',
      'Airport transfer',
    ],
  },
];
```

2. - [ ] When creating a checklist item, show a "Start from template" button that opens a picker
3. - [ ] On template selection, populate the checklist items as unchecked `checklist_items`
4. - [ ] Allow editing the populated items before saving
5. - [ ] `pnpm check`

### Task 3: Parking lot views

**What:** Trip-level and phase-level views showing all alternate/considered items.

**Files:** New `src/routes/(app)/trips/[slug]/parking-lot/+page.server.ts`, new `src/routes/(app)/trips/[slug]/parking-lot/+page.svelte`, new `src/lib/components/ParkingLotSection.svelte`, `src/routes/(app)/trips/[slug]/phases/[phaseId]/+page.svelte`

1. - [ ] Create trip parking lot page — loads all items where `parking_lot_scope != 'none'`:

```typescript
export const load = async ({ params, locals, parent }) => {
  const { trip } = await parent();
  const items = await locals.pb.collection('items').getFullList({
    filter: `trip="${trip.id}" && parking_lot_scope!="none"`,
    sort: '-created',
  });
  return { parkingLotItems: items };
};
```

2. - [ ] Create `ParkingLotSection.svelte` — groups items by scope and phase:

```svelte
<script lang="ts">
  import type { Item, Phase } from '$lib/types';
  import TypeIcon from '$lib/components/ui/TypeIcon.svelte';
  import Card from '$lib/components/ui/Card.svelte';

  let { items, phases, tripSlug }: {
    items: Item[];
    phases: Phase[];
    tripSlug: string;
  } = $props();

  const tripLevel = $derived(items.filter(i => i.parking_lot_scope === 'trip'));
  const phaseLevel = $derived(items.filter(i => i.parking_lot_scope === 'phase'));
  const dayLevel = $derived(items.filter(i => i.parking_lot_scope === 'day'));
</script>
```

3. - [ ] Create parking lot page UI with sections for trip/phase/day scoped items
4. - [ ] Add phase parking lot section to phase detail page — show items with `parking_lot_scope='phase'` for that phase
5. - [ ] Add "Parking lot" link to trip More page
6. - [ ] `pnpm check`

### ~~Task 4: Recommendations sidebar on archive~~ — CUT

**Already implemented.** The archive page (`src/routes/archive/[token]/+page.svelte`) already has a collapsible "What we considered" section with considered items loaded and rendered. No work needed.

### Task 5: OG metadata for archive pages

**What:** Add Open Graph meta tags to the public archive page so shared links show a rich preview.

**Files:** `src/routes/archive/[token]/+page.server.ts`, `src/routes/archive/[token]/+page.svelte`

1. - [ ] In the archive server loader, return OG-relevant data: trip title, location, date range, cover image URL
2. - [ ] Add `<svelte:head>` with OG tags:

```svelte
<svelte:head>
  <title>{data.trip.title} — Waypoint Archive</title>
  <meta property="og:title" content={data.trip.title} />
  <meta property="og:description" content="{data.trip.location_summary} · {formatDateRange(data.trip.start_date, data.trip.end_date)}" />
  <meta property="og:type" content="article" />
  {#if data.trip.cover_image}
    <meta property="og:image" content={coverImageUrl} />
  {/if}
  <meta property="og:url" content={$page.url.href} />
</svelte:head>
```

3. - [ ] `pnpm check`

### Task 6: Print-friendly itinerary

**What:** CSS-only print stylesheet that creates a clean, printable itinerary.

**Files:** New `src/lib/styles/print.css`, `src/routes/layout.css`

1. - [ ] Create print stylesheet:

```css
@media print {
  /* Hide non-print elements */
  nav, .bottom-nav, .side-rail, .fab, .notification-bell,
  button, [role="button"], .no-print {
    display: none !important;
  }

  /* Reset layout */
  body {
    background: white;
    color: black;
    font-size: 11pt;
    line-height: 1.4;
  }

  main {
    max-width: 100%;
    padding: 0;
    margin: 0;
  }

  /* Page breaks between days */
  .day-section {
    page-break-inside: avoid;
    page-break-before: auto;
  }

  /* Expand all collapsed sections */
  details { display: block; }
  details > * { display: block; }

  /* Print header */
  .print-header {
    display: block !important;
    text-align: center;
    margin-bottom: 1cm;
  }

  /* Remove decorative elements */
  .card {
    border: 1px solid #ccc;
    box-shadow: none;
    border-radius: 0;
  }

  a { text-decoration: none; color: inherit; }
}
```

2. - [ ] Import print stylesheet in `layout.css`
3. - [ ] Add a "Print itinerary" button on the trip More page (triggers `window.print()`)
4. - [ ] `pnpm check`

**Commit:**
```
git commit -m "M6e: trip cloning, checklist templates, parking lot, OG metadata, print view"
```

---

## M6f — E2E Tests & Final QA

**Focus:** Playwright E2E tests for M6 features plus full regression testing.

### Task 1: M6 E2E test suite

**Files:** New `tests/e2e/m6-polish.spec.ts`

1. - [ ] Test: create item with start/end times → verify times persist on detail and edit views
2. - [ ] Test: day navigation arrows → navigate between days
3. - [ ] Test: Places autocomplete → select a place → verify autofill (requires mock or skip if no API key in CI)
4. - [ ] Test: flight lookup → enter flight number → verify autofill (requires mock or skip)
5. - [ ] Test: trip cloning → clone with phases → verify new trip has phases
6. - [ ] Test: print button exists on More page
7. - [ ] Test: archive page has OG meta tags
8. - [ ] Test: parking lot page loads and shows items
9. - [ ] `pnpm check`

### Task 2: Responsive layout tests

1. - [ ] Test at 375px viewport: BottomNav visible, SideRail hidden
2. - [ ] Test at 900px viewport: SideRail visible, BottomNav hidden
3. - [ ] Test at 1280px viewport: 3-pane layout (if implemented)

### Task 3: Full regression

1. - [ ] Run full E2E suite: `pnpm test:e2e`
2. - [ ] Run type checking: `pnpm check`
3. - [ ] Fix any failures
4. - [ ] Manual smoke test on mobile device (or preview at 375px): create trip → add phase → add day → add item with times → navigate days → view parking lot → clone trip

**Commit:**
```
git commit -m "M6f: E2E tests for polish features, full regression passing"
```

---

## Resolved Decisions

| Decision | Resolution | Rationale |
|---|---|---|
| Dark mode | **Skipped** | Not worth the effort for v1. Token prep already in place from M6c CSS custom properties. |
| OCR agenda import | **Backlogged** | Not in spec. Added to SPEC_BACKLOG.md for a future milestone. |
| Day navigation UX | **Swipe + arrows** | Both touch swipe gestures AND arrow buttons for full mobile-native feel. |
| Recommendations/parking lot | **Decided during implementation** | Inline sections vs. standalone pages will be chosen based on how the data looks on real trips. |
| Desktop debt scope | **Full sub-milestone (M6c)** | Touches the layout shell used by every page — better to ship as a cohesive unit. |

---

## Acceptance Criteria Mapping

| Spec Feature | Sub-milestone | Acceptance |
|---|---|---|
| Trip cloning with per-category checklist | M6e Task 1 | Clone creates new trip with selected phases/items |
| Google Places autofill on item create | M6d Tasks 1–3 | Autocomplete works, place details fill location fields |
| AeroDataBox flight number lookup | M6d Tasks 4–6 | Flight number returns departure/arrival/times/timezones |
| Checklist templates (packing, grocery, to-book) | M6e Task 2 | Template picker populates checklist items |
| Recommendations / saved-options sidebar | ~~M6e Task 4~~ | **Already implemented** — archive has "What we considered" section |
| Phase/trip parking lot views | M6e Task 3 | Parking lot page shows items by scope |
| OG metadata for archive | M6e Task 5 | Shared archive link shows rich preview |
| Print-friendly itinerary | M6e Task 6 | `Ctrl+P` produces clean printout |
| Day navigation (swipe + arrows) | M6b Task 5 | Arrows navigate between days, swipe works on touch |
| App icon artwork refresh | M6c Task 5 | Home screen icon shows Waypoint brand |
| Start/end times saving | M6a Task 1 | Times persist through create/edit cycle |
| Today sort order | M6a Task 2 | Morning items sort first for next day |
| Keyboard/nav overlap | M6a Task 3 | Bottom nav hidden when keyboard is open |
| Desktop responsive layout | M6c Tasks 3–4 | SideRail at ≥900px, brand panel on login |

---

## Backlog additions (from this planning cycle)

These items were considered for M6 but explicitly deferred:

- **Photo/OCR agenda import** — add to SPEC_BACKLOG.md
- **Dark mode** — token prep done in M6c, toggle implementation deferred
- **3-pane layout at ≥1280px** — AppShell supports the breakpoint; actual 3-pane content layout deferred to when there's enough screen density to justify it
