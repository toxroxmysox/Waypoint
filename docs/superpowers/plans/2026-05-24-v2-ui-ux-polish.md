# Waypoint v2 — UI/UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute all 13 work packages from V2_SPEC.md to bring Waypoint from feature-complete to production-polished — fixing accessibility, interaction feedback, loading states, animations, typography, error handling, and desktop layout.

**Architecture:** Pure UI/UX layer changes — no data model, no new routes, no PocketBase schema changes. All work is in Svelte components, CSS tokens, and SvelteKit layout files. Design token changes in `layout.css` cascade to all consumers. New components (Toast, Skeletons) are standalone `$lib/components/ui/` additions wired into existing routes.

**Tech Stack:** SvelteKit 2 + Svelte 5 (runes) + TypeScript strict + Tailwind CSS v4 (`@theme` tokens) + PocketBase

---

## File Structure

### Modified files (by work package)

**WP-1 (Server Errors):**
- `src/routes/(app)/trips/[slug]/parking-lot/+page.server.ts` — fix 500
- `src/routes/(app)/trips/[slug]/closeout/+page.server.ts` — fix 500

**WP-2 (Design Tokens):**
- `src/routes/layout.css` — add shadow tokens, z-index tokens, fix ink-muted
- `src/routes/(app)/trips/[slug]/closeout/+page.svelte` — replace off-brand colors
- ~6 files with `text-clay` error banners → `text-error`
- All components using `disabled:opacity-50` → `disabled:opacity-40`

**WP-3 (Accessibility):**
- `src/routes/+layout.svelte` — skip-link, route change focus management
- All interactive elements — focus-visible rings
- Heading hierarchy fixes across routes

**WP-4 (Touch & Interaction):**
- `src/lib/components/ui/NavBar.svelte` — 44px back button
- `src/lib/components/ui/NotificationBell.svelte` — 44px touch target
- `src/lib/components/ui/Card.svelte` — press feedback
- `src/lib/components/ui/SideRail.svelte` — nav item sizing
- `src/routes/layout.css` — `touch-action: manipulation`

**WP-5 (Typography):**
- `src/lib/components/ui/NavBar.svelte` — Fraunces h1
- Various components — tabular-nums, truncation tooltips

**WP-6 (Toast):**
- `src/lib/components/ui/Toast.svelte` — NEW
- `src/lib/stores/toast.ts` — NEW
- Integration into ~10 form action handlers

**WP-7 (Button Loading):**
- `src/lib/components/ui/Button.svelte` — loading prop + spinner

**WP-8 (Skeleton Loading):**
- `src/lib/components/ui/TripCardSkeleton.svelte` — NEW
- `src/lib/components/ui/DayItemSkeleton.svelte` — NEW
- `src/lib/components/ui/ExpenseRowSkeleton.svelte` — NEW
- `src/lib/components/ui/MemberCardSkeleton.svelte` — NEW

**WP-9 (Animation & Motion):**
- `src/lib/components/ui/BottomSheet.svelte` — exit animation
- `src/routes/layout.css` — reduced-motion media queries
- Route transition logic in layout files

**WP-10 (Desktop Layout):**
- `src/lib/components/ui/AppShell.svelte` — 3-pane layout
- `src/lib/components/ui/SideRail.svelte` — expanded 240px state
- `src/lib/components/ui/ContextRail.svelte` — NEW

**WP-11 (Form UX):**
- Form components — required field indicators, blur validation
- `src/lib/components/ui/NavBar.svelte` — explicit backHref

**WP-12 (Performance):**
- All `<img>` elements — lazy loading, dimensions
- `src/app.html` — font preload links

**WP-13 (Minor Polish):**
- `src/lib/components/ui/Card.svelte` — hex validation
- Various — CTA audit, tab overflow, bottom padding

---

## Session 1: WP-1 — Server Errors (P0)

> Unblocks testing everything else. Debug and fix the two 500 errors.

### Task 1: Fix `/parking-lot` 500 error

**Files:**
- Debug: `src/routes/(app)/trips/[slug]/parking-lot/+page.server.ts`
- Debug: `src/routes/(app)/trips/[slug]/+layout.server.ts`

- [ ] **Step 1: Reproduce the error**

```bash
pnpm dev
```

Navigate to a test trip's `/parking-lot` route in the browser. Check the terminal for the stack trace. The error is likely in the `load` function — either a missing parent data field or a PocketBase query failure.

- [ ] **Step 2: Read the server file and identify the crash point**

Read `src/routes/(app)/trips/[slug]/parking-lot/+page.server.ts`. The load function calls `parent()` to get trip/phases data. Check:
1. Does it destructure fields from `parent()` that don't exist?
2. Does the PocketBase filter query have a syntax error?
3. Is it accessing a property on a potentially undefined value?

- [ ] **Step 3: Fix the root cause**

The fix depends on what Step 2 reveals. Common patterns:
- If parent data field missing: align destructuring with what `+layout.server.ts` actually returns
- If PocketBase query fails: fix the filter string or add error handling
- If undefined access: add null checks

- [ ] **Step 4: Verify the fix**

```bash
pnpm dev
```

Navigate to `/parking-lot` — page loads without error. Check both empty state (no parking lot items) and populated state.

- [ ] **Step 5: Run type check**

```bash
pnpm check
```

Expected: clean output, no errors.

---

### Task 2: Fix `/closeout` 500 error

**Files:**
- Debug: `src/routes/(app)/trips/[slug]/closeout/+page.server.ts`

- [ ] **Step 1: Reproduce the error**

Navigate to a test trip's `/closeout` route. Check terminal for stack trace. This likely depends on trip state — the closeout page may assume the trip is in a specific phase/mode.

- [ ] **Step 2: Read the server file and identify the crash point**

Read `src/routes/(app)/trips/[slug]/closeout/+page.server.ts`. Check:
1. Does it enforce a trip state (e.g., trip must be in "completed" mode)?
2. Does it query collections that may return empty results and then access properties without null checks?
3. Does the role check (`owner`/`co_owner`) crash if membership is missing?

- [ ] **Step 3: Fix the root cause**

Apply the appropriate fix based on Step 2 findings. If the page requires a specific trip state, redirect to the trip overview with a message instead of crashing.

- [ ] **Step 4: Verify the fix**

Navigate to `/closeout` — page loads without error. Test with different trip states if the fix is state-dependent.

- [ ] **Step 5: Run checks and commit**

```bash
pnpm check
```

```bash
git add src/routes/\(app\)/trips/\[slug\]/parking-lot/+page.server.ts src/routes/\(app\)/trips/\[slug\]/closeout/+page.server.ts
git commit -m "v2-WP1: fix 500 errors on /parking-lot and /closeout routes"
```

---

## Session 2: WP-2 — Design Token Refinements

> Foundation changes that cascade to everything downstream. Tokens, colors, shadows, z-index.

### Task 3: Darken `ink-muted` for WCAG AA compliance

**Files:**
- Modify: `src/routes/layout.css`
- Test: visual verification across the app

- [ ] **Step 1: Update the token value**

In `src/routes/layout.css`, change `--color-ink-muted`:

```css
--color-ink-muted: #67625A;
```

Finalized value: 4.74:1 contrast on `#F6F2EA` paper — WCAG AA compliant, stays warm, reads as clearly subordinate to `ink-soft` (#4C4A44) and `ink` (#1C1B18).

- [ ] **Step 2: Run type check**

```bash
pnpm check
```

Expected: clean. This is a CSS-only change — no TS impact.

- [ ] **Step 3: Visual verify**

Start dev server, check these contexts:
- NavBar subtitle ("Chengdu, China" below page title)
- Trip card metadata (date range, location)
- Day view empty state ("Nothing scheduled.")
- Expense row subtitles ("You paid - May 23")
- Section labels (MORNING, AFTERNOON, etc.)
- Phase date ranges in trip overview

The text should still read as "secondary" but be noticeably more legible than before.

---

### Task 4: Add shadow token scale

**Files:**
- Modify: `src/routes/layout.css`

- [ ] **Step 1: Update shadow token block in `@theme` with finalized 5-level scale**

In `src/routes/layout.css`, replace/update the shadow token block:

```css
--shadow-card:     0 1px 2px rgba(28,27,24, 0.04);
--shadow-elevated: 0 1px 2px rgba(28,27,24, 0.05), 0 4px 10px rgba(28,27,24, 0.06);
--shadow-dropdown: 0 2px 4px rgba(28,27,24, 0.05), 0 8px 20px rgba(28,27,24, 0.09);
--shadow-overlay:  0 -2px 8px rgba(28,27,24, 0.05), 0 -12px 40px rgba(28,27,24, 0.13);
--shadow-modal:    0 4px 12px rgba(28,27,24, 0.10), 0 24px 60px rgba(28,27,24, 0.20);
```

Element mapping: card→`shadow-card`, FAB→`shadow-elevated`, dropdown→`shadow-dropdown`, bottom sheet→`shadow-overlay`, modal→`shadow-modal`.

- [ ] **Step 2: Verify tokens generate utilities**

```bash
pnpm dev
```

In browser devtools, confirm `shadow-elevated`, `shadow-dropdown`, `shadow-overlay`, `shadow-modal` classes are recognized by Tailwind.

---

### Task 5: Add z-index token scale

**Files:**
- Modify: `src/routes/layout.css`

- [ ] **Step 1: Add z-index tokens to `@theme`**

In `src/routes/layout.css`, add inside `@theme {}`:

```css
--z-dropdown: 20;
--z-sticky: 30;
--z-nav: 40;
--z-modal: 50;
--z-overlay: 60;
```

- [ ] **Step 2: Find and replace raw z-index values across components**

Search for raw `z-` utilities:

```bash
grep -rn 'z-[0-9]' src/lib/components/ src/routes/ --include='*.svelte' | grep -v node_modules
```

Replace each with the appropriate token:
- `z-40` on BottomNav → `z-nav`
- `z-50` on BottomSheet → `z-modal`
- `z-50` on modals → `z-modal`
- Any dropdown `z-` values → `z-dropdown`
- Sticky headers → `z-sticky`

---

### Task 6: Fix error banner colors (clay → error)

**Files:**
- Modify: `src/routes/layout.css` — add error tokens
- Find all files with `text-clay` + error context

- [ ] **Step 0: Add error token hex values to `@theme` in `layout.css`**

```css
--color-error:      #B33A3A;
--color-error-tint: #F5E0DE;
--color-error-deep: #8E2A2A;
```

- [ ] **Step 1: Find all error-colored elements using clay**

```bash
grep -rn 'text-clay\|bg-clay\|border-clay' src/ --include='*.svelte' | grep -v node_modules
```

Filter results to only error contexts (error banners, validation messages). Skip trip-mode accent uses of clay — those are intentional.

- [ ] **Step 2: Replace error uses of clay with error token**

For each error banner pattern:
- `text-clay` → `text-error-deep`
- `bg-clay/10` → `bg-error/10`
- `border-clay/30` → `border-error/30`

For inline field errors: border `1.5px solid var(--color-error)` + `bg-error/4%`.

Example replacement in a typical error banner:

```svelte
<!-- Before -->
<div class="rounded-md border border-clay/30 bg-clay/10 p-3 text-sm text-clay">

<!-- After -->
<div class="rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error-deep">
```

For inline field error borders:

```svelte
<!-- Before -->
<input class="border-line ..." />

<!-- After (error state) -->
<input class="border-[1.5px] border-error bg-error/[0.04] ..." />
```

- [ ] **Step 3: Run type check**

```bash
pnpm check
```

---

### Task 7: Fix closeout off-brand colors

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/closeout/+page.svelte`

- [ ] **Step 1: Replace all off-brand Tailwind colors**

Read the closeout page and replace:

| Find | Replace |
|------|---------|
| `bg-green-500` | `bg-moss` |
| `bg-green-50` | `bg-moss-tint` |
| `text-green-600` | `text-moss` |
| `text-green-700` | `text-moss` |
| `bg-amber-50` | `bg-gold-tint` |
| `text-amber-600` | `text-gold` |
| `text-amber-700` | `text-gold` |
| `hover:bg-gray-100` | `hover:bg-surface-2` |
| `border-border` | `border-line` |

- [ ] **Step 2: Visual verify**

Navigate to `/closeout` and confirm the color scheme now uses design tokens — green states are moss, warning states are gold, surfaces use paper/surface-2.

---

### Task 8: Standardize disabled opacity

**Files:**
- Find all files with `opacity-50` in disabled context

- [ ] **Step 1: Find and replace disabled opacity**

```bash
grep -rn 'disabled:opacity-50\|opacity-50' src/lib/components/ --include='*.svelte'
```

Replace all `disabled:opacity-50` with `disabled:opacity-40`.

The main hit is `Button.svelte`:

```svelte
// Before
const base = 'inline-flex items-center justify-center font-semibold border transition-colors disabled:opacity-50 disabled:pointer-events-none';

// After
const base = 'inline-flex items-center justify-center font-semibold border transition-colors disabled:opacity-40 disabled:pointer-events-none';
```

- [ ] **Step 2: Commit WP-2**

```bash
pnpm check
git add src/routes/layout.css src/routes/\(app\)/trips/\[slug\]/closeout/+page.svelte src/lib/components/
git commit -m "v2-WP2: design token refinements — ink-muted AA, shadow scale, z-index tokens, error colors, disabled opacity"
```

---

## Session 3: WP-4 + WP-7 — Touch Targets & Button Loading

> Two independent, small packages. Combined into one session.

### Task 9: Global `touch-action: manipulation`

**Files:**
- Modify: `src/routes/layout.css`

- [ ] **Step 1: Add touch-action to html**

In `src/routes/layout.css`, add to the `html, body` rule:

```css
html,
body {
	background: var(--color-paper);
	color: var(--color-ink);
	-webkit-font-smoothing: antialiased;
	touch-action: manipulation;
}
```

This eliminates the 300ms tap delay on all touch targets.

---

### Task 10: Fix NavBar back button touch target

**Files:**
- Modify: `src/lib/components/ui/NavBar.svelte`

- [ ] **Step 1: Increase back button to 44px**

Read NavBar.svelte. Find the back button (currently `h-9 w-9` = 36px).

Change the button classes:

```svelte
<!-- Before -->
<a ... class="flex h-9 w-9 items-center justify-center ...">

<!-- After -->
<a ... class="flex h-11 w-11 items-center justify-center ...">
```

`h-11 w-11` = 44px, meeting the minimum touch target.

---

### Task 11: Fix NotificationBell touch target

**Files:**
- Modify: `src/lib/components/ui/NotificationBell.svelte`

- [ ] **Step 1: Increase bell button to 44px**

Read NotificationBell.svelte. Find the button (currently `h-9 w-9` = 36px).

```svelte
<!-- Before -->
<button class="relative flex h-9 w-9 items-center justify-center ...">

<!-- After -->
<button class="relative flex h-11 w-11 items-center justify-center ...">
```

Also replace the dropdown's `shadow-md` with `shadow-dropdown`:

```svelte
<!-- Before -->
class="... shadow-md ..."

<!-- After -->
class="... shadow-dropdown ..."
```

---

### Task 12: Fix Card press feedback

**Files:**
- Modify: `src/lib/components/ui/Card.svelte`

- [ ] **Step 1: Increase active scale and add tint**

Read Card.svelte. Find the interactive computed class:

```svelte
// Before
const interactive = $derived(href || onclick ? 'hover:shadow-card-strong active:scale-[0.997]' : '');

// After
const interactive = $derived(href || onclick ? 'hover:shadow-card-strong active:scale-[0.98] active:bg-surface-2 transition-transform duration-100' : '');
```

The 2% scale is visible but not dramatic. The `bg-surface-2` tint gives a warm pressed-paper feel.

---

### Task 13: Fix SideRail nav item sizing

**Files:**
- Modify: `src/lib/components/ui/SideRail.svelte`

- [ ] **Step 1: Increase label size and item height**

Read SideRail.svelte. Find the nav items and labels:

```svelte
<!-- Labels: before -->
<span class="text-[10px] ...">

<!-- Labels: after -->
<span class="text-[11px] ...">
```

For nav item containers, ensure height is at least 44px:

```svelte
<!-- Before -->
class="... w-14 py-2 ..."

<!-- After -->
class="... w-14 py-2.5 ..."
```

- [ ] **Step 2: Commit WP-4**

```bash
pnpm check
git add src/routes/layout.css src/lib/components/ui/NavBar.svelte src/lib/components/ui/NotificationBell.svelte src/lib/components/ui/Card.svelte src/lib/components/ui/SideRail.svelte
git commit -m "v2-WP4: touch targets 44px, card press feedback, global touch-action manipulation"
```

---

### Task 14: Add Button loading state

**Files:**
- Modify: `src/lib/components/ui/Button.svelte`

- [ ] **Step 1: Add loading prop and spinner**

Read Button.svelte. Add a `loading` prop and spinner SVG:

```svelte
<script lang="ts">
	// Add to existing props:
	let {
		// ... existing props
		loading = false,
		// ... rest
	}: {
		// ... existing types
		loading?: boolean;
		// ... rest
	} = $props();
</script>
```

Add a spinner component inline (14px rotating ring using `currentColor`):

```svelte
{#snippet spinner()}
	<svg
		class="h-3.5 w-3.5 animate-spin"
		viewBox="0 0 24 24"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
	>
		<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
		<path
			class="opacity-75"
			fill="currentColor"
			d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
		/>
	</svg>
{/snippet}
```

In the button element, add loading behavior. Show spinner alongside label (not replacing it) to keep button width locked:

```svelte
<button
	class={buttonClasses}
	disabled={disabled || loading}
	aria-busy={loading}
	{...restProps}
>
	{#if loading}
		{@render spinner()}
	{/if}
	{@render children()}
</button>
```

Width-locked: spinner appears before label text so button does not resize. `aria-busy` announces the loading state to screen readers.

- [ ] **Step 2: Add reduced opacity when loading**

Add a loading-specific class to the base string computation:

```svelte
const loadingClass = $derived(loading ? 'opacity-[0.72] pointer-events-none' : '');
```

Include `loadingClass` in the final class concatenation.

- [ ] **Step 3: Run type check**

```bash
pnpm check
```

- [ ] **Step 4: Commit WP-7**

```bash
git add src/lib/components/ui/Button.svelte
git commit -m "v2-WP7: button loading state with spinner, disabled + aria-busy"
```

---

## Session 4: WP-3 — Accessibility Foundations

> Focus-visible rings, skip-link, heading hierarchy, aria-live, route change focus.

### Task 15: Add focus-visible rings globally

**Files:**
- Modify: `src/routes/layout.css`

- [ ] **Step 1: Add global focus-visible style**

In `src/routes/layout.css`, add after the existing rules:

```css
:focus-visible {
	outline: 2px solid var(--color-moss);
	outline-offset: 2px;
}

:focus:not(:focus-visible) {
	outline: none;
}
```

This gives every focusable element a moss-colored ring on keyboard focus, without showing it on mouse clicks.

- [ ] **Step 2: Verify with keyboard navigation**

Tab through the trip list, day view, and expense pages. Every link, button, and input should show a green ring on focus.

---

### Task 16: Add skip-link

**Files:**
- Modify: `src/routes/+layout.svelte`

- [ ] **Step 1: Add visually-hidden skip link**

At the very top of the layout's markup (before any nav), add:

```svelte
<a
	href="#main-content"
	class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-overlay focus:rounded-md focus:bg-moss focus:px-4 focus:py-2 focus:text-white"
>
	Skip to main content
</a>
```

- [ ] **Step 2: Add main content landmark**

Find the main content area and add `id="main-content"`:

If there's no `<main>` element, wrap the slot/children in one:

```svelte
<main id="main-content">
	{@render children()}
</main>
```

- [ ] **Step 3: Test**

Reload the page, press Tab. The skip link should appear at top-left, styled as a moss pill. Press Enter — focus should jump to main content.

---

### Task 17: Fix heading hierarchy

**Files:**
- Multiple route pages — audit all heading levels

- [ ] **Step 1: Find heading level violations**

```bash
grep -rn '<h[1-6]' src/routes/ --include='*.svelte' | sort
```

Known issues from V2_SPEC.md:
- Trip list: `h3` should be `h2` (or add visually-hidden `h1`)
- Day view: `h1→h2→h4` skip — change `h4` to `h3`

- [ ] **Step 2: Fix each violation**

For the day view `h4` → `h3`:
```svelte
<!-- Before -->
<h4 class="...">

<!-- After -->
<h3 class="...">
```

Ensure visual styling stays the same — just change the semantic element, keep the classes.

- [ ] **Step 3: Verify**

Install axe-core or use browser devtools accessibility audit to confirm no heading-level skip warnings.

---

### Task 18: Add `aria-live` regions

**Files:**
- Modify: form error containers across the app
- Modify: `src/routes/+layout.svelte` — route announcer

- [ ] **Step 1: Add route change announcer**

In `src/routes/+layout.svelte`, add an `aria-live` region that announces page changes:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';

	let routeAnnouncement = $state('');

	afterNavigate(() => {
		const title = document.title;
		routeAnnouncement = `Navigated to ${title}`;
	});
</script>

<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
	{routeAnnouncement}
</div>
```

- [ ] **Step 2: Add `aria-live="polite"` to form error containers**

Find form error message containers:

```bash
grep -rn 'form.*error\|error.*message\|{#if.*error' src/routes/ --include='*.svelte' | head -20
```

Wrap each error display in an `aria-live` region:

```svelte
<div aria-live="polite">
	{#if form?.error}
		<p class="text-sm text-error">{form.error}</p>
	{/if}
</div>
```

- [ ] **Step 3: Replace phase dots with phase chip component**

Find phase dot components (color-only indicators):

```bash
grep -rn 'phase.*color\|color.*dot\|rounded-full.*bg-' src/lib/components/ --include='*.svelte' | head -20
```

Create `src/lib/components/ui/PhaseChip.svelte` — a colored circle with white monogram letter:

```svelte
<script lang="ts">
	let { color, name, size = 'md' }: { color: string; name: string; size?: 'sm' | 'md' } = $props();
	const sizeClass = size === 'sm' ? 'h-4 w-4 text-[9px]' : 'h-5 w-5 text-[10px]';
</script>

<span
	class="inline-flex items-center justify-center rounded-full font-semibold text-white {sizeClass}"
	style="background: {color}"
	aria-label={name}
	title={name}
>
	{name[0].toUpperCase()}
</span>
```

Replace all `<span class="h-3 w-3 rounded-full" style="background: {phase.color}">` instances with `<PhaseChip color={phase.color} name={phase.name} />`. The monogram letter provides text-based meaning alongside color.

- [ ] **Step 4: Run checks and commit**

```bash
pnpm check
git add src/routes/+layout.svelte src/routes/layout.css src/lib/components/ src/routes/\(app\)/
git commit -m "v2-WP3: accessibility — focus-visible rings, skip-link, heading hierarchy, aria-live regions, phase labels"
```

---

## Session 5: WP-5 — Typography & Hierarchy

> NavBar Fraunces, type scale, tabular-nums, truncation tooltips.

### Task 19: NavBar h1 to Fraunces

**Files:**
- Modify: `src/lib/components/ui/NavBar.svelte`

- [ ] **Step 1: Change h1 font to Fraunces with letter-spacing**

Read NavBar.svelte. Find the h1:

```svelte
<!-- Before -->
<h1 class="text-ink truncate text-base font-semibold leading-tight">{title}</h1>

<!-- After -->
<h1 class="text-ink truncate font-display text-lg font-semibold leading-tight" style="letter-spacing: -0.2px">{title}</h1>
```

Changes: `font-display` adds Fraunces, `text-lg` (18px) from `text-base` (16px), inline letter-spacing -0.2px (finalized).

- [ ] **Step 2: Update subtitle to Inter 500 13px**

The current subtitle may use Fraunces italic 12px. Change to Inter 500 13px — remove any `font-display` and `italic` classes, add `font-medium`:

```svelte
<!-- Before (if Fraunces italic) -->
<span class="font-display italic text-[12px] text-ink-muted ...">

<!-- After -->
<span class="text-[13px] font-medium text-ink-muted ...">
```

If already using Inter, just bump from 12px to 13px and add `font-medium` (500).

- [ ] **Step 3: Visual verify**

Check NavBar on: day view ("Thu, May 21"), item detail ("Group Dinner"), section pages ("Members", "Expenses"). The Fraunces serif should give titles personality vs the Inter body text.

---

### Task 20: Add tabular-nums to expense amounts

**Files:**
- Find: expense-related components with numeric displays

- [ ] **Step 1: Find expense number displays**

```bash
grep -rn 'amount\|total\|balance\|\$\|USD\|toFixed\|toLocaleString' src/ --include='*.svelte' | grep -v node_modules | head -30
```

- [ ] **Step 2: Add `tabular-nums` to numeric columns**

For each expense amount display, add the `tabular-nums` font-feature:

```svelte
<!-- Before -->
<span class="text-sm font-medium">${amount.toFixed(2)}</span>

<!-- After -->
<span class="text-sm font-medium tabular-nums">${amount.toFixed(2)}</span>
```

Apply to: expense row amounts, budget totals, balance displays, split amounts.

---

### Task 21: Add truncation tooltips

**Files:**
- Find: elements using `truncate` class

- [ ] **Step 1: Find truncated elements**

```bash
grep -rn 'truncate' src/lib/components/ src/routes/ --include='*.svelte' | grep -v node_modules
```

- [ ] **Step 2: Add `title` attribute with full text**

For each truncated element, add a `title` attribute:

```svelte
<!-- Before -->
<span class="truncate">{item.title}</span>

<!-- After -->
<span class="truncate" title={item.title}>{item.title}</span>
```

- [ ] **Step 3: Commit WP-5**

```bash
pnpm check
git add src/lib/components/ src/routes/
git commit -m "v2-WP5: typography — Fraunces NavBar h1, tabular-nums expenses, truncation tooltips"
```

---

## Session 6: WP-9 — Animation & Motion

> Reduced-motion support, BottomSheet exit animation, page transitions.

### Task 22: Add `prefers-reduced-motion` support

**Files:**
- Modify: `src/routes/layout.css`
- Modify: any component with CSS animations

- [ ] **Step 1: Wrap existing animations in motion-safe**

Find all `@keyframes` and `animation-` usages:

```bash
grep -rn '@keyframes\|animation-\|animate-' src/ --include='*.svelte' --include='*.css' | grep -v node_modules
```

In `layout.css`, add a global reduced-motion override:

```css
@media (prefers-reduced-motion: reduce) {
	*,
	*::before,
	*::after {
		animation-duration: 0.01ms !important;
		animation-iteration-count: 1 !important;
		transition-duration: 0.01ms !important;
	}
}
```

This is a broad-stroke approach that respects the user preference while keeping the codebase simple.

---

### Task 23: Add BottomSheet exit animation

**Files:**
- Modify: `src/lib/components/ui/BottomSheet.svelte`

- [ ] **Step 1: Add slide-down exit animation**

Read BottomSheet.svelte. Currently it has `animate-slide-up` for entrance but snaps closed.

Replace the instant close with an animated exit. In Svelte 5, use the `transition:` directive or manage with CSS classes:

```svelte
<script lang="ts">
	import { fly } from 'svelte/transition';

	let { open = false, onclose, children }: {
		open: boolean;
		onclose?: () => void;
		children: import('svelte').Snippet;
	} = $props();
</script>

{#if open}
	<div class="fixed inset-0 z-modal">
		<!-- Backdrop -->
		<button
			class="absolute inset-0 bg-ink/30"
			onclick={onclose}
			aria-label="Close"
			transition:fade={{ duration: 200 }}
		></button>

		<!-- Sheet -->
		<div
			class="absolute bottom-0 left-0 right-0 rounded-t-xl bg-surface shadow-overlay"
			transition:fly={{ y: '100%', duration: 250, easing: cubicOut }}
		>
			{@render children()}
		</div>
	</div>
{/if}
```

The exit animation is automatically ~60% of entrance duration when using Svelte transitions (the out transition uses the same params but Svelte's default behavior handles it).

> **Note:** The exact implementation depends on the current BottomSheet structure. Read the file first and adapt this pattern to match existing props and slot/snippet usage.

---

### Task 24: Add page transition animations

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/+layout.svelte` or relevant route layouts
- Modify: `src/routes/+layout.svelte` — global transition hook

**Finalized timing:** peer nav horizontal 240ms, drill-down slide-up 280ms, tab switch crossfade 180ms. Reduced-motion fallback: fade (not disabled entirely).

**Approach:** Use `beforeNavigate`/`afterNavigate` hooks to manage a CSS transition class on the page wrapper, rather than `{#key}` blocks. This avoids remounting components on every navigation.

- [ ] **Step 1: Add tab switch crossfade (180ms)**

For tab switches (Itinerary/Money/Members/More), use a crossfade via `{#key}` on the shared layout:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { fade } from 'svelte/transition';
</script>

{#key page.url.pathname}
	<div in:fade={{ duration: 180, delay: 90 }} out:fade={{ duration: 108 }}>
		{@render children()}
	</div>
{/key}
```

Exit duration ≈ 60% of entrance (108ms). The `delay` ensures old content fades before new appears.

- [ ] **Step 2: Add peer nav horizontal slide (240ms)**

For peer-level navigation (day to day, item to item), track direction and use a horizontal fly:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { fly } from 'svelte/transition';

	let previousDay = $state(0);
	let direction = $state(1);

	$effect(() => {
		const currentDay = Number(page.params.dayIndex ?? 0);
		direction = currentDay >= previousDay ? 1 : -1;
		previousDay = currentDay;
	});
</script>

{#key page.params.dayIndex}
	<div
		in:fly={{ x: direction * 80, duration: 240, delay: 120 }}
		out:fly={{ x: direction * -80, duration: 144 }}
	>
		{@render children()}
	</div>
{/key}
```

- [ ] **Step 3: Add drill-down slide-up (280ms)**

For navigating into detail views (trip → day → item), use a vertical fly:

```svelte
<div
	in:fly={{ y: 32, duration: 280, delay: 140 }}
	out:fly={{ y: 32, duration: 168 }}
>
```

- [ ] **Step 4: Reduced-motion fallback**

Wrap all transition values in a motion check — use fade at 120ms instead of disabling:

```svelte
<script lang="ts">
	import { prefersReducedMotion } from '$lib/utils/motion';

	const transitionIn = $derived(
		prefersReducedMotion()
			? { duration: 120 }
			: { x: direction * 80, duration: 240, delay: 120 }
	);
</script>
```

> **Note:** Read the existing layout files first to determine where transitions slot in without double-wrapping. The `{#key}` approach is simpler than `beforeNavigate`/`afterNavigate` for most cases; use hooks only if you need to control transition state across components.

- [ ] **Step 3: Commit WP-9**

```bash
pnpm check
git add src/routes/layout.css src/lib/components/ui/BottomSheet.svelte src/routes/
git commit -m "v2-WP9: animation — reduced-motion support, BottomSheet exit animation, page transitions"
```

---

## Session 7: WP-6 — Toast System

> New component. Depends on WP-2 (shadow tokens) and WP-9 (motion).

### Task 25: Create toast store

**Files:**
- Create: `src/lib/stores/toast.ts`

- [ ] **Step 1: Write the toast store**

```typescript
import { writable } from 'svelte/store';

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
	id: string;
	message: string;
	variant: ToastVariant;
	duration: number;
}

const DURATIONS: Record<ToastVariant, number> = {
	success: 3000,
	error: 5000,
	info: 4000
};

function createToastStore() {
	const { subscribe, update } = writable<Toast[]>([]);

	function add(message: string, variant: ToastVariant = 'success') {
		const id = crypto.randomUUID();
		const duration = DURATIONS[variant];

		update((toasts) => {
			// Max 1 visible — replace existing
			return [{ id, message, variant, duration }];
		});

		setTimeout(() => {
			dismiss(id);
		}, duration);
	}

	function dismiss(id: string) {
		update((toasts) => toasts.filter((t) => t.id !== id));
	}

	return {
		subscribe,
		success: (message: string) => add(message, 'success'),
		error: (message: string) => add(message, 'error'),
		info: (message: string) => add(message, 'info'),
		dismiss
	};
}

export const toast = createToastStore();
```

---

### Task 26: Create Toast component

**Files:**
- Create: `src/lib/components/ui/Toast.svelte`

- [ ] **Step 1: Write the Toast component**

```svelte
<script lang="ts">
	import { toast, type Toast as ToastType } from '$lib/stores/toast';
	import { fly, fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';

	const variantStyles: Record<string, string> = {
		success: 'bg-moss-tint text-moss border-moss/20',
		error: 'bg-error/10 text-error border-error/20',
		info: 'bg-sky-tint text-sky border-sky/20'
	};

	const variantIcons: Record<string, string> = {
		success: 'M5 13l4 4L19 7',
		error: 'M6 18L18 6M6 6l12 12',
		info: 'M13 16h-1v-4h-1m1-4h.01'
	};

	let toasts: ToastType[] = $state([]);

	toast.subscribe((value) => {
		toasts = value;
	});
</script>

<!-- Mobile: above BottomNav -->
<div
	class="fixed bottom-20 left-1/2 z-overlay -translate-x-1/2 md-desktop:bottom-auto md-desktop:left-auto md-desktop:right-4 md-desktop:top-16 md-desktop:translate-x-0"
	role="status"
	aria-live="polite"
>
	{#each toasts as t (t.id)}
		<div
			class="flex items-center gap-2 rounded-[14px] border px-3 py-2.5 shadow-dropdown {variantStyles[t.variant]}"
			in:fly={{ y: 20, duration: 250 }}
			out:fly={{ y: 20, duration: 150 }}
			animate:flip={{ duration: 200 }}
		>
			<svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d={variantIcons[t.variant]} stroke-linecap="round" stroke-linejoin="round" />
			</svg>
			<span class="text-sm font-medium">{t.message}</span>
			<button
				class="ml-2 shrink-0 opacity-60 hover:opacity-100"
				onclick={() => toast.dismiss(t.id)}
				aria-label="Dismiss"
			>
				<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" />
				</svg>
			</button>
		</div>
	{/each}
</div>
```

> **Claude Design note:** If the design output specifies different positioning, padding, radius, or animation values, adjust accordingly. The core structure (store → component → variants) stays the same.

---

### Task 27: Mount Toast in root layout

**Files:**
- Modify: `src/routes/+layout.svelte`

- [ ] **Step 1: Add Toast component to root layout**

```svelte
<script lang="ts">
	import Toast from '$lib/components/ui/Toast.svelte';
	// ... existing imports
</script>

<!-- ... existing layout content -->
<Toast />
```

---

### Task 28: Integrate toast into form actions

**Files:**
- Modify: ~10 form action handlers across the app

- [ ] **Step 1: Find all form success handlers**

```bash
grep -rn 'use:enhance\|invalidateAll\|goto.*after.*form\|form.*success' src/routes/ --include='*.svelte' | head -30
```

- [ ] **Step 2: Add toast calls to each success path**

For each form that creates/edits/deletes an entity, add a toast after the successful action:

```svelte
<script lang="ts">
	import { toast } from '$lib/stores/toast';

	// In the enhance callback:
	function handleSubmit() {
		return async ({ result, update }) => {
			if (result.type === 'success' || result.type === 'redirect') {
				toast.success('Item added to Thursday, May 21');
			}
			await update();
		};
	}
</script>
```

Key integration points:
- Trip create → "Trip created"
- Item create/edit/delete → "Item added" / "Item updated" / "Item deleted"
- Expense create/edit/delete → "Expense added" / "Expense updated" / "Expense deleted"
- Member invite → "Invite sent"
- Settings save → "Settings saved"
- Phase create/edit/delete → "Phase added" / "Phase updated" / "Phase deleted"

- [ ] **Step 3: Commit WP-6**

```bash
pnpm check
git add src/lib/stores/toast.ts src/lib/components/ui/Toast.svelte src/routes/
git commit -m "v2-WP6: toast system — success/error/info variants, auto-dismiss, accessible announcements"
```

---

## Session 8: WP-8 — Skeleton Loading

> Depends on WP-9 (reduced-motion). Skeleton components for 4 list views.

### Task 29: Create shared shimmer animation

**Files:**
- Modify: `src/routes/layout.css`

- [ ] **Step 1: Add shimmer keyframes**

In `src/routes/layout.css`, add:

```css
@keyframes shimmer {
	0% {
		background-position: -200% 0;
	}
	100% {
		background-position: 200% 0;
	}
}

.skeleton-shimmer {
	background: linear-gradient(
		90deg,
		var(--color-paper) 25%,
		var(--color-surface-2) 50%,
		var(--color-paper) 75%
	);
	background-size: 200% 100%;
	animation: shimmer 1.5s ease-in-out infinite;
}
```

The shimmer uses paper → surface-2 → paper (warm, not gray). The `prefers-reduced-motion` rule from WP-9 will automatically disable this.

---

### Task 30: Create TripCardSkeleton

**Files:**
- Create: `src/lib/components/ui/TripCardSkeleton.svelte`

- [ ] **Step 1: Write the skeleton**

```svelte
<div class="flex rounded-lg border border-line bg-surface p-4 shadow-card" aria-hidden="true">
	<div class="mr-3 w-1 self-stretch rounded-full skeleton-shimmer"></div>
	<div class="flex-1 space-y-2.5">
		<div class="h-5 w-3/5 rounded skeleton-shimmer"></div>
		<div class="h-3.5 w-2/5 rounded skeleton-shimmer"></div>
		<div class="h-3.5 w-1/3 rounded skeleton-shimmer"></div>
		<div class="flex gap-2">
			<div class="h-5 w-16 rounded-full skeleton-shimmer"></div>
			<div class="h-5 w-12 rounded-full skeleton-shimmer"></div>
		</div>
	</div>
</div>
```

---

### Task 31: Create DayItemSkeleton

**Files:**
- Create: `src/lib/components/ui/DayItemSkeleton.svelte`

- [ ] **Step 1: Write the skeleton**

```svelte
<script lang="ts">
	let { count = 3 }: { count?: number } = $props();
</script>

<div class="space-y-3" aria-hidden="true">
	<div class="h-4 w-24 rounded skeleton-shimmer"></div>
	{#each Array(count) as _}
		<div class="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 shadow-card">
			<div class="h-9 w-9 rounded-full skeleton-shimmer"></div>
			<div class="flex-1 space-y-1.5">
				<div class="h-4 w-3/5 rounded skeleton-shimmer"></div>
				<div class="h-3 w-2/5 rounded skeleton-shimmer"></div>
			</div>
		</div>
	{/each}
</div>
```

---

### Task 32: Create ExpenseRowSkeleton

**Files:**
- Create: `src/lib/components/ui/ExpenseRowSkeleton.svelte`

- [ ] **Step 1: Write the skeleton**

```svelte
<script lang="ts">
	let { count = 4 }: { count?: number } = $props();
</script>

<div class="space-y-2" aria-hidden="true">
	{#each Array(count) as _}
		<div class="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
			<div class="h-8 w-8 rounded-full skeleton-shimmer"></div>
			<div class="flex-1 space-y-1.5">
				<div class="h-4 w-2/5 rounded skeleton-shimmer"></div>
				<div class="h-3 w-1/3 rounded skeleton-shimmer"></div>
			</div>
			<div class="h-4 w-16 rounded skeleton-shimmer"></div>
		</div>
	{/each}
</div>
```

---

### Task 33: Create MemberCardSkeleton

**Files:**
- Create: `src/lib/components/ui/MemberCardSkeleton.svelte`

- [ ] **Step 1: Write the skeleton**

```svelte
<script lang="ts">
	let { count = 3 }: { count?: number } = $props();
</script>

<div class="space-y-3" aria-hidden="true">
	{#each Array(count) as _}
		<div class="flex items-center gap-3 rounded-lg border border-line bg-surface p-4">
			<div class="h-10 w-10 rounded-full skeleton-shimmer"></div>
			<div class="flex-1 space-y-1.5">
				<div class="h-4 w-2/5 rounded skeleton-shimmer"></div>
				<div class="h-3 w-3/5 rounded skeleton-shimmer"></div>
			</div>
			<div class="h-5 w-14 rounded-full skeleton-shimmer"></div>
		</div>
	{/each}
</div>
```

---

### Task 34: Wire skeletons into list views

**Files:**
- Modify: trip list page, day view page, expense list page, member list page

- [ ] **Step 1: Find the list rendering locations**

```bash
grep -rn '{#each.*trips\|{#each.*items\|{#each.*expenses\|{#each.*members' src/routes/ --include='*.svelte' | head -20
```

- [ ] **Step 2: Add loading guards with skeleton fallbacks**

For each list view, wrap the content in a loading check. SvelteKit streams data by default, so use `{#await}` if the data is a promise, or check for undefined:

```svelte
<script lang="ts">
	import TripCardSkeleton from '$lib/components/ui/TripCardSkeleton.svelte';
</script>

{#if data.trips}
	{#each data.trips as trip}
		<!-- existing trip card rendering -->
	{/each}
{:else}
	{#each Array(3) as _}
		<TripCardSkeleton />
	{/each}
{/if}
```

> **Note:** The exact integration depends on how each page loads data. Some may use SvelteKit streaming (`+page.server.ts` returning promises), others may have synchronous data. Read each page to determine the right loading guard.

- [ ] **Step 3: Commit WP-8**

```bash
pnpm check
git add src/routes/layout.css src/lib/components/ui/TripCardSkeleton.svelte src/lib/components/ui/DayItemSkeleton.svelte src/lib/components/ui/ExpenseRowSkeleton.svelte src/lib/components/ui/MemberCardSkeleton.svelte src/routes/
git commit -m "v2-WP8: skeleton loading — trip cards, day items, expense rows, member cards with warm shimmer"
```

---

## Session 9: WP-12 — Image & Font Performance

> Independent package. Image optimization + font preloading.

### Task 35: Add image optimization attributes

**Files:**
- All files with `<img>` elements

- [ ] **Step 1: Find all img elements**

```bash
grep -rn '<img' src/ --include='*.svelte' | grep -v node_modules
```

- [ ] **Step 2: Add `loading`, `decoding`, and dimensions to each**

For each `<img>`:

```svelte
<!-- Before -->
<img src={url} alt={alt} />

<!-- After -->
<img src={url} alt={alt} loading="lazy" decoding="async" width={width} height={height} />
```

For above-fold images (hero, logo), use `loading="eager"` instead.

If width/height aren't known at build time, add a CSS aspect ratio:

```svelte
<img src={url} alt={alt} loading="lazy" decoding="async" class="aspect-video w-full object-cover" />
```

---

### Task 36: Add font preloading

**Files:**
- Modify: `src/app.html`

- [ ] **Step 1: Find the font file paths**

```bash
find src -name '*.woff2' -o -name '*.woff' 2>/dev/null
ls static/fonts/ 2>/dev/null
```

- [ ] **Step 2: Add preload links to `app.html`**

In the `<head>` of `src/app.html`:

```html
<link rel="preload" href="/fonts/inter-400.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/fonts/fraunces-600.woff2" as="font" type="font/woff2" crossorigin />
```

> **Note:** Adjust paths based on where the font files actually live. If fonts are loaded from Google Fonts CDN, add `<link rel="preconnect" href="https://fonts.googleapis.com">` instead.

- [ ] **Step 3: Commit WP-12**

```bash
pnpm check
git add src/app.html src/
git commit -m "v2-WP12: image lazy loading + font preloading"
```

---

## Session 10: WP-11 — Form UX Improvements

> Depends on WP-3 (aria-live) and WP-6 (toast for success). Required field indicators, blur validation, focus-to-first-error, explicit backHref.

### Task 37: Add required field indicators

**Files:**
- All form pages with required fields

- [ ] **Step 1: Find form label patterns**

```bash
grep -rn '<label' src/routes/ --include='*.svelte' | head -30
```

- [ ] **Step 2: Add required indicators**

For each required field label, add a red asterisk:

```svelte
<!-- Before -->
<label for="title" class="text-sm font-medium text-ink">Title</label>

<!-- After -->
<label for="title" class="text-sm font-medium text-ink">
	Title <span class="text-error" aria-label="required">*</span>
</label>
```

---

### Task 38: Add inline blur validation

**Files:**
- Form pages with email inputs, required fields, date ranges

- [ ] **Step 1: Add blur validation to email fields**

Find invite/email forms:

```bash
grep -rn 'type="email"\|type=.email' src/routes/ --include='*.svelte'
```

Add blur validation:

```svelte
<script lang="ts">
	let emailError = $state('');

	function validateEmail(e: FocusEvent) {
		const input = e.target as HTMLInputElement;
		if (input.value && !input.validity.valid) {
			emailError = 'Please enter a valid email address';
		} else {
			emailError = '';
		}
	}
</script>

<input type="email" onblur={validateEmail} ... />
{#if emailError}
	<p class="mt-1 text-sm text-error" aria-live="polite">{emailError}</p>
{/if}
```

- [ ] **Step 2: Add required field validation on blur**

For required fields:

```svelte
function validateRequired(e: FocusEvent) {
	const input = e.target as HTMLInputElement;
	if (!input.value.trim()) {
		error = 'This field is required';
	} else {
		error = '';
	}
}
```

---

### Task 39: Add focus-to-first-error after submission

**Files:**
- Form pages using `use:enhance`

- [ ] **Step 1: Add auto-focus on form errors**

In the `enhance` callback, after a failed submission:

```svelte
function handleSubmit() {
	return async ({ result, update }) => {
		if (result.type === 'failure') {
			await update();
			// Focus the first invalid field
			const firstError = document.querySelector('[aria-invalid="true"], .text-error')
				?.closest('.form-group')
				?.querySelector('input, select, textarea') as HTMLElement | null;
			firstError?.focus();
		}
		await update();
	};
}
```

---

### Task 40: Replace `history.back()` with explicit backHref

**Files:**
- Modify: `src/lib/components/ui/NavBar.svelte`
- Modify: all NavBar consumers

- [ ] **Step 1: Update NavBar to require explicit backHref**

Read NavBar.svelte. Find the back button's click/href handler. If it uses `history.back()`, replace with the `backHref` prop:

```svelte
<!-- The NavBar already has a backHref prop. Remove the history.back() fallback: -->

<!-- Before -->
<a href={backHref ?? '#'} onclick={!backHref ? () => history.back() : undefined} ...>

<!-- After -->
{#if backHref}
	<a href={backHref} ...>
		<!-- back icon -->
	</a>
{/if}
```

- [ ] **Step 2: Find NavBar usages missing backHref**

```bash
grep -rn '<NavBar' src/routes/ --include='*.svelte' | grep -v backHref
```

For each one, add the explicit `backHref` pointing to the logical parent route.

- [ ] **Step 3: Commit WP-11**

```bash
pnpm check
git add src/lib/components/ui/NavBar.svelte src/routes/
git commit -m "v2-WP11: form UX — required indicators, blur validation, focus-to-first-error, explicit backHref"
```

---

## Sessions 11–12: WP-10 — Desktop 3-Pane Layout

> Largest package. Depends on WP-2 (tokens) and WP-5 (typography). Split across two sessions.

### Task 41: Bump md-desktop content width

**Files:**
- Modify: content wrapper components/layouts

- [ ] **Step 1: Find content width constraints**

```bash
grep -rn 'max-w-lg\|max-w-md\|max-w-sm' src/ --include='*.svelte' | grep -v node_modules
```

- [ ] **Step 2: Replace `max-w-lg` with `max-w-2xl`**

```svelte
<!-- Before -->
class="mx-auto max-w-lg ..."

<!-- After -->
class="mx-auto max-w-2xl ..."
```

`max-w-2xl` = 672px, up from `max-w-lg` = 512px. Gives 31% more content width.

---

### Task 42: Expand SideRail for lg-desktop

**Files:**
- Modify: `src/lib/components/ui/SideRail.svelte`

- [ ] **Step 1: Add expanded state for lg-desktop**

Read SideRail.svelte. Add responsive width and content:

```svelte
<nav class="fixed left-0 top-0 h-full w-[72px] lg-desktop:w-60 border-r border-line bg-surface flex flex-col items-center lg-desktop:items-stretch z-nav">
	<!-- Logo -->
	<div class="flex h-14 items-center justify-center lg-desktop:justify-start lg-desktop:px-4">
		<span class="text-lg font-display font-bold text-moss">W</span>
	</div>

	<!-- Trip name (lg-desktop only) -->
	<div class="hidden lg-desktop:block px-4 pb-4 border-b border-line">
		<h2 class="font-display text-sm font-semibold text-ink truncate" title={tripName}>
			{tripName}
		</h2>
	</div>

	<!-- Nav items -->
	{#each navItems as item}
		<a href={item.href} class="flex items-center gap-3 w-14 lg-desktop:w-full py-2.5 lg-desktop:px-4 ...">
			<svelte:component this={item.icon} class="h-5 w-5" />
			<span class="text-[11px] lg-desktop:text-sm lg-desktop:font-medium">
				{item.label}
			</span>
		</a>
	{/each}

	<!-- Phase list (lg-desktop only) -->
	<div class="hidden lg-desktop:block mt-4 px-4 space-y-1">
		{#each phases as phase}
			<div class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm {phase.active ? 'bg-moss-tint text-moss' : 'text-ink-soft hover:bg-surface-2'}">
				<span class="h-2.5 w-2.5 rounded-full" style="background: {phase.color}" aria-hidden="true"></span>
				<span class="truncate">{phase.name}</span>
			</div>
		{/each}
	</div>
</nav>
```

> **Claude Design note:** The 3-pane layout design output will inform exact widths, spacing, and visual treatment. Adjust accordingly.

- [ ] **Step 2: Add trip name tooltip at md-desktop**

For the md-desktop (72px) state, add the truncated trip name:

```svelte
<div class="hidden md-desktop:block lg-desktop:hidden text-center px-1 pb-2">
	<span class="text-[10px] text-ink-muted truncate block" title={tripName}>
		{tripName}
	</span>
</div>
```

---

### Task 43: Create ContextRail component

**Files:**
- Create: `src/lib/components/ui/ContextRail.svelte`

- [ ] **Step 1: Write the ContextRail shell**

```svelte
<script lang="ts">
	import { page } from '$app/state';

	let { children }: { children?: import('svelte').Snippet } = $props();

	const currentRoute = $derived(page.route.id ?? '');
</script>

<aside class="hidden lg-desktop:block fixed right-0 top-0 h-full w-80 border-l border-line bg-surface overflow-y-auto p-4">
	{#if children}
		{@render children()}
	{:else}
		<div class="text-sm text-ink-muted">Select an item to see details.</div>
	{/if}
</aside>
```

The ContextRail is a shell — each route passes its own content via snippet. This keeps the component simple and the content route-specific.

---

### Task 44: Update AppShell for 3-pane layout

**Files:**
- Modify: `src/lib/components/ui/AppShell.svelte`

- [ ] **Step 1: Add lg-desktop grid layout**

Read AppShell.svelte. Update the desktop layout:

```svelte
<!-- Desktop layout -->
<div class="hidden md-desktop:block">
	<SideRail {slug} {role} tripName={tripName} phases={phases} />

	<!-- Content area adjusts margin based on SideRail width -->
	<div class="ml-[72px] lg-desktop:ml-60 lg-desktop:mr-80">
		<div class="mx-auto max-w-2xl px-4 py-6">
			{@render children()}
		</div>
	</div>

	<!-- ContextRail (lg-desktop only) -->
	<div class="hidden lg-desktop:block">
		{#if contextContent}
			<ContextRail>
				{@render contextContent()}
			</ContextRail>
		{:else}
			<ContextRail />
		{/if}
	</div>
</div>
```

- [ ] **Step 2: Pass context content per route**

The AppShell needs to accept an optional `contextContent` snippet from child routes. This lets each route provide its own ContextRail content:

```svelte
<script lang="ts">
	let {
		slug,
		role,
		tripName,
		phases,
		children,
		contextContent
	}: {
		slug: string;
		role: string;
		tripName: string;
		phases: any[];
		children: import('svelte').Snippet;
		contextContent?: import('svelte').Snippet;
	} = $props();
</script>
```

- [ ] **Step 3: Commit WP-10 (part 1)**

```bash
pnpm check
git add src/lib/components/ui/SideRail.svelte src/lib/components/ui/ContextRail.svelte src/lib/components/ui/AppShell.svelte src/routes/
git commit -m "v2-WP10a: 3-pane layout shell — expanded SideRail, ContextRail, content width bump"
```

---

### Task 45: Wire ContextRail content per route

**Files:**
- Modify: itinerary route — item preview card or day summary
- Modify: expenses route — spending summary
- Modify: members route — role overview

- [ ] **Step 1: Itinerary ContextRail content**

Content: selected item preview (title, type, time, notes) + day-at-a-glance (item count by type) + up-next (next item after current time or selection).

```svelte
{#snippet contextContent()}
	<div class="space-y-5">
		{#if selectedItem}
			<div class="space-y-1">
				<h3 class="font-display text-sm font-semibold text-ink">{selectedItem.title}</h3>
				<p class="text-xs text-ink-muted">{selectedItem.type} · {selectedItem.time}</p>
				{#if selectedItem.notes}
					<p class="text-xs text-ink-soft">{selectedItem.notes}</p>
				{/if}
			</div>
		{/if}
		<div class="space-y-1">
			<h4 class="text-xs font-semibold uppercase tracking-wide text-ink-muted">Day at a Glance</h4>
			<!-- item count by type (activity, transport, meal, accommodation) -->
		</div>
		<div class="space-y-1">
			<h4 class="text-xs font-semibold uppercase tracking-wide text-ink-muted">Up Next</h4>
			<!-- next item card -->
		</div>
	</div>
{/snippet}
```

- [ ] **Step 2: Expenses ContextRail content**

Content: budget vs actual (total spend vs trip budget) + top categories (ranked by spend) + who-owes-whom (simplified debt summary).

```svelte
{#snippet contextContent()}
	<div class="space-y-5">
		<div class="space-y-1">
			<h4 class="text-xs font-semibold uppercase tracking-wide text-ink-muted">Budget</h4>
			<!-- budget bar: actual / total, over/under indicator -->
		</div>
		<div class="space-y-1">
			<h4 class="text-xs font-semibold uppercase tracking-wide text-ink-muted">Top Categories</h4>
			<!-- top 3–4 categories with amounts -->
		</div>
		<div class="space-y-1">
			<h4 class="text-xs font-semibold uppercase tracking-wide text-ink-muted">Who Owes Whom</h4>
			<!-- simplified debt list from split algorithm -->
		</div>
	</div>
{/snippet}
```

- [ ] **Step 3: Members ContextRail content**

Content: role overview (count by role: owner, co_owner, member) + recent activity (last 5 actions by any member).

```svelte
{#snippet contextContent()}
	<div class="space-y-5">
		<div class="space-y-1">
			<h4 class="text-xs font-semibold uppercase tracking-wide text-ink-muted">Roles</h4>
			<!-- owner / co-owner / member count chips -->
		</div>
		<div class="space-y-2">
			<h4 class="text-xs font-semibold uppercase tracking-wide text-ink-muted">Recent Activity</h4>
			<!-- last 5 trip_log entries with member avatar + action text -->
		</div>
	</div>
{/snippet}
```

- [ ] **Step 4: Commit WP-10 (part 2)**

```bash
pnpm check
git add src/routes/
git commit -m "v2-WP10b: ContextRail content — day summary, spending breakdown, member overview"
```

---

## Session 13: WP-13 — Minor Polish

> Grab bag of small fixes. Independent.

### Task 46: Card accent color hex validation

**Files:**
- Modify: `src/lib/components/ui/Card.svelte`

- [ ] **Step 1: Add hex validation**

Read Card.svelte. Find the accent inline style:

```svelte
// Before
const accentStyle = $derived(accent ? `border-left-width:4px;border-left-color:${accent};` : '');

// After
function isValidHex(color: string): boolean {
	return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);
}

const accentStyle = $derived(
	accent && isValidHex(accent) ? `border-left-width:4px;border-left-color:${accent};` : ''
);
```

---

### Task 47: Audit and demote competing CTAs

**Files:**
- Various screens with multiple primary buttons

- [ ] **Step 1: Find screens with multiple primary buttons**

```bash
grep -rn 'variant="primary"\|variant="moss"\|bg-moss' src/routes/ --include='*.svelte' | grep -v node_modules
```

Group by route — any route with 2+ primary-variant buttons needs demotion. The secondary action should use `variant="outline"` or `variant="ghost"`.

- [ ] **Step 2: Demote secondary actions**

Change the less-important button's variant:

```svelte
<!-- Before: two primary buttons -->
<Button variant="primary">Save</Button>
<Button variant="primary">Cancel</Button>

<!-- After: one primary, one ghost -->
<Button variant="primary">Save</Button>
<Button variant="ghost">Cancel</Button>
```

---

### Task 48: Add `touch-action: pan-x` on tab containers

**Files:**
- Find: horizontal tab/scroll containers

- [ ] **Step 1: Find tab containers**

```bash
grep -rn 'overflow-x\|scroll.*horizontal\|tab.*container' src/ --include='*.svelte' | grep -v node_modules
```

- [ ] **Step 2: Add touch-action**

```svelte
<!-- Before -->
<div class="overflow-x-auto ...">

<!-- After -->
<div class="overflow-x-auto touch-pan-x ...">
```

---

### Task 49: Standardize bottom padding

**Files:**
- Find: pages with inconsistent bottom padding

- [ ] **Step 1: Find bottom padding values**

```bash
grep -rn 'pb-[0-9]\|pb-\[' src/routes/ --include='*.svelte' | grep -v node_modules | sort
```

- [ ] **Step 2: Standardize to consistent values**

Create a consistent pattern:
- Pages with FAB + BottomNav: `pb-32` (128px — clears both)
- Pages with BottomNav only: `pb-20` (80px)
- Desktop (no BottomNav): `pb-8` (32px)

Replace inconsistent values with the appropriate standard.

- [ ] **Step 3: Commit WP-13**

```bash
pnpm check
git add src/lib/components/ui/Card.svelte src/routes/
git commit -m "v2-WP13: minor polish — hex validation, CTA audit, tab touch-action, bottom padding"
```

---

## Session 14: WP-14 — Brand Assets

> Standalone package. No code dependencies. Can be done any time after WP-1.

### Task 50: Generate brand asset files

**Files:**
- Create: `static/brand/` — all SVG and PNG assets
- Create: `src/lib/icons/` — nav icon components
- Modify: `src/app.html` — favicon wiring
- Modify: `static/manifest.json` — PWA icon references

- [ ] **Step 1: Create mark variants**

Generate and place SVG files in `static/brand/`:
- `star-mark.svg` — primary mark (colored)
- `star-mark-inverse.svg` — white version for dark backgrounds
- `star-mark-outline.svg` — stroke-only version
- `sparkle.svg` — simplified sparkle accent
- `star-stamp.svg` — stamp/badge variant

- [ ] **Step 2: Create favicon assets**

- `static/brand/favicon.svg` — 32px viewBox, renders cleanly at 16 and 32px
- `static/brand/favicon-32.png` — PNG export at 32px

Wire favicon into `src/app.html`:
```html
<link rel="icon" href="/brand/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/brand/favicon-32.png" sizes="32x32" />
```

- [ ] **Step 3: Create app icon set**

Standard icons:
- `app-icon.svg`, `app-icon-512.png`, `app-icon-192.png`, `apple-touch-icon.png` (180px)

Variant icons:
- `app-icon-ink.svg`, `app-icon-ink-512.png` — ink-colored version
- `app-icon-maskable.svg`, `app-icon-maskable-512.png` — safe zone inset for Android adaptive icons

- [ ] **Step 4: Create lockup files**

- `lockup-horizontal.svg` (320×48) — mark + wordmark side by side
- `lockup-stacked.svg` (200×100) — mark above wordmark

**Wordmark spec:** Fraunces weight 500, letter-spacing -0.02em.

- [ ] **Step 5: Create nav icon components**

In `src/lib/icons/`, create `StarIcons.svelte` (or individual files) with 8 navigation icons at 24×24px, stroke-width 1.6:

```svelte
<!-- Example: ItineraryIcon.svelte -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <!-- star-system path data -->
</svg>
```

- [ ] **Step 6: Update PWA manifest**

In `static/manifest.json`, reference the correct icon sizes:

```json
{
  "icons": [
    { "src": "/brand/app-icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/brand/app-icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/brand/app-icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 7: Commit WP-14**

```bash
pnpm check
git add static/brand/ src/lib/icons/ src/app.html static/manifest.json
git commit -m "v2-WP14: brand assets — Star System mark, favicon, app icons, lockups, nav icons"
```

---

## Final Verification

### Task 50: Full regression check

- [ ] **Step 1: Run all checks**

```bash
pnpm check
pnpm test:e2e
```

- [ ] **Step 2: Visual walkthrough**

Walk through every major route on mobile (375px) and desktop (1440px):
- Trip list
- Trip overview
- Day view (navigate between days)
- Item detail
- Expenses list and detail
- Members
- Settings
- Parking lot
- Closeout

Check: focus rings, toast on actions, skeletons on load, transitions between pages, correct shadows, accessible phase labels, Fraunces headings, error colors, loading buttons.

- [ ] **Step 3: Update V2_SPEC.md tracking table**

Mark all WPs as complete with today's date.

- [ ] **Step 4: Final commit**

```bash
git add V2_SPEC.md
git commit -m "v2: mark all work packages complete"
```

---

## Design Handoff — Finalized Values (2026-05-24)

All 10 design items from the handoff are now incorporated into this plan. Values below are finalized — do not substitute unless the handoff is explicitly revised.

| Handoff Item | Work Package | Finalized value |
|--------------|-------------|-----------------|
| 1. Three-pane layout | WP-10 (Tasks 41–45) | 900px / 1280px breakpoints; 72px / 240px SideRail; 320px ContextRail |
| 2. Toast component | WP-6 (Tasks 25–28) | `py-2.5 px-3`, `rounded-[14px]`, `shadow-dropdown`, 3/5/4s |
| 3. Skeleton screens | WP-8 (Tasks 29–34) | Warm shimmer (paper→surface-2→paper), 4 component types |
| 4. Page transitions | WP-9 (Task 24) | 240ms / 280ms / 180ms; fade fallback for reduced-motion |
| 5. Shadow scale | WP-2 (Task 4) | 5-level scale with exact rgba values in Task 4 |
| 6. ink-muted color | WP-2 (Task 3) | `#67625A` (4.74:1) |
| 7. Error states | WP-2 (Tasks 6–7) | `#B33A3A` / `#F5E0DE` / `#8E2A2A`; banner + inline field specs |
| 8. Button loading | WP-7 (Task 14) | 14px spinner, `opacity-[0.72]`, width-locked |
| 9. NavBar redesign | WP-5 (Task 19) | Fraunces 18px/600/-0.2px h1; Inter 500 13px subtitle |
| 10. Card press + phases | WP-4 (Tasks 12–13) + WP-3 | `scale-[0.98]+bg-surface-2`; PhaseChip with monogram letter |
| Brand assets | WP-14 (Task 50) | Star System mark; Fraunces 500 wordmark / -0.02em |

---

## Estimated Effort

| Session | Work Package(s) | Estimated Time |
|---------|-----------------|---------------|
| 1 | WP-1: Server Errors | 30–45 min |
| 2 | WP-2: Design Tokens | 45–60 min |
| 3 | WP-5 + WP-4: Typography + Touch | 45–60 min |
| 4 | WP-7: Button Loading | 20–30 min |
| 5 | WP-3: Accessibility | 60–90 min |
| 6 | WP-9: Animation | 45–60 min |
| 7 | WP-6: Toast System | 60–90 min |
| 8 | WP-8: Skeleton Loading | 45–60 min |
| 9 | WP-14: Brand Assets | 45–60 min |
| 10–11 | WP-10: Desktop Layout | 90–120 min |
| 12 | WP-12: Performance | 30–45 min |
| 13 | WP-11: Form UX | 45–60 min |
| 14 | WP-13: Minor Polish | 30–45 min |
| — | Final Verification | 30 min |

**Total: ~11–15 sessions, 11–16 hours**
