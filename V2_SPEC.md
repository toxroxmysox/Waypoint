# Waypoint v2 — UI/UX Polish Specification

> Owner: Scott Vanden Warsen
> Created: 2026-05-23
> Source: UI_AUDIT.md (53 findings + 2 server errors across two audit passes)
> Gate: Traverse City October 2026 trip

---

## Scope

v2 is **UI/UX polish only**. No new features, no data model changes, no new routes. Every item traces back to a finding in UI_AUDIT.md. The app is feature-complete (M1–M6 shipped); this pass makes it feel finished.

### What v2 is NOT

- No dark mode
- No notifications system redesign
- No role downgrade flows
- No new pages or features
- No backend/PocketBase schema changes

---

## Work Packages

Organized by implementation dependency, not audit priority. Each package is session-sized (~1 sub-milestone). Packages are independent unless noted.

---

### WP-1: Server Errors (P0)

Fix broken routes before anything else.

| ID | Finding | Fix |
|----|---------|-----|
| E1 | `/parking-lot` returns 500 | Debug `+page.server.ts` data loading |
| E2 | `/closeout` returns 500 | Debug — likely trip state dependency |

**Acceptance:** Both routes load without error on the China 2024 test trip.

---

### WP-2: Design Token Refinements

Foundation changes that affect everything downstream. Do these first.

| ID | Finding | Change |
|----|---------|--------|
| A2 | `ink-muted` fails WCAG AA (3.31:1 on paper) | Set `--color-ink-muted: #67625A` (finalized, 4.74:1 on paper — WCAG AA). Visual verify across all ~176 usages. |
| S1 | Error banners use `text-clay` instead of `text-error` | Add tokens: `--color-error: #B33A3A`, `--color-error-tint: #F5E0DE`, `--color-error-deep: #8E2A2A`. Banner: `bg-error/10 border-error/30 text-error-deep`. Inline field: `1.5px border-error bg-error/4%`. Replace clay in all error contexts (~6 files). |
| S2 | Closeout uses off-brand `green-50`/`amber-50` | Map to `moss-tint`/`moss` and `gold-tint`/`gold`. |
| DP-S1 | Only 2 shadow tokens | Add finalized 5-level shadow scale to `@theme` (see below). Element mapping: card→`shadow-card`, FAB→`shadow-elevated`, dropdown→`shadow-dropdown`, sheet→`shadow-overlay`, modal→`shadow-modal`. |
| DP-L1 | No z-index token scale | Add `--z-dropdown: 20`, `--z-sticky: 30`, `--z-nav: 40`, `--z-modal: 50`, `--z-overlay: 60` to `@theme`. Replace raw `z-` utilities across components. |
| DP-F3 | Disabled opacity inconsistent (0.30–0.50) | Standardize to `opacity-40` everywhere. |

**Shadow scale (finalized):**
```css
--shadow-card:     0 1px 2px rgba(28,27,24, 0.04);
--shadow-elevated: 0 1px 2px rgba(28,27,24, 0.05), 0 4px 10px rgba(28,27,24, 0.06);
--shadow-dropdown: 0 2px 4px rgba(28,27,24, 0.05), 0 8px 20px rgba(28,27,24, 0.09);
--shadow-overlay:  0 -2px 8px rgba(28,27,24, 0.05), 0 -12px 40px rgba(28,27,24, 0.13);
--shadow-modal:    0 4px 12px rgba(28,27,24, 0.10), 0 24px 60px rgba(28,27,24, 0.20);
```

**Acceptance:** `pnpm check` clean. Visual verify ink-muted contrast on metadata text, error banners use error-deep text (not clay), closeout uses design tokens, disabled states uniform, shadow utilities applied per element mapping above.

---

### WP-3: Accessibility Foundations

| ID | Finding | Change |
|----|---------|--------|
| A1 | No focus-visible rings | Add `focus:outline-none focus-visible:ring-2 focus-visible:ring-moss focus-visible:ring-offset-2` to all interactive elements. Consider a global base input style. |
| DP-A1 | Zero `aria-live` regions | Add `aria-live="polite"` wrapper around form error messages. Add `role="status"` to toast container (WP-6). Add `aria-live="assertive"` for critical errors. |
| DP-A2 | Heading hierarchy broken | Trip list: promote `h3` to `h2` or add visually-hidden `h1`. Day view: fix `h1→h2→h4` skip (change `h4` to `h3`). Audit all routes for sequential heading order. |
| A5 | Color-only meaning (phase dots, balance indicators) | Phase dot → **phase chip**: 16–20px colored circle with white monogram letter (first char of phase name). Build `PhaseChip.svelte` for reuse in dense contexts. Balance indicators: retain color + text approach. |
| A3 | NavBar subtitle at 12px + failing contrast | Bump to 13px minimum. Will benefit from A2's ink-muted darkening. |
| DP-A3 | No focus management on route changes | Add `afterNavigate` hook in root layout that focuses a skip target or announces page title via `aria-live` region. |
| A4 | No skip-link | Add visually-hidden skip link in root layout, visible on `:focus`. |

**Acceptance:** Tab through every page — focus is always visible. Screen reader announces form errors and route changes. Headings pass automated hierarchy check.

---

### WP-4: Touch & Interaction

| ID | Finding | Change |
|----|---------|--------|
| T1 | Back button, NotificationBell, PhaseColorPicker all 36px | Increase to 44px touch targets (visual or hit area). |
| DP-T1 | No global `touch-action: manipulation` | Add to `html` in `layout.css`. |
| DP-T2 | Card press feedback imperceptible (0.3% scale) | `active:scale-[0.98]` + `active:bg-surface-2` — both effects together (was `active:scale-[0.997]`). |
| T2 | SideRail nav items cramped (40px height, 10px labels) | Increase label to 11px, add `py-2.5` for 44px+ height. |

**Acceptance:** Tap targets pass 44px minimum on mobile. Card presses have visible feedback. No 300ms tap delay.

---

### WP-5: Typography & Hierarchy

| ID | Finding | Change |
|----|---------|--------|
| TC1 | NavBar h1 uses Inter, not Fraunces | h1: Fraunces 18px / weight 600 / letter-spacing -0.2px. Subtitle: Inter 500 13px (was Fraunces italic 12px — change font family, weight, and size). |
| TC3 | No systematic heading scale | Define type scale in `@theme` or as documented constants. Apply consistently. |
| TC2 | 176 instances of sub-14px text | Audit case-by-case. Bump informational text to 12px minimum. Keep decorative labels (attribution) at 10px. |
| DP-TC1 | Expense numbers use proportional figures | Add `tabular-nums` to expense amounts, budget totals, numeric columns. |
| DP-TC2 | Truncated text has no tooltip/expand | Add `title` attribute with full text on elements using `truncate`. |

**Acceptance:** NavBar uses Fraunces. Heading sizes follow documented scale. Expense numbers align in columns.

---

### WP-6: Toast / Success Feedback System

New component needed. Depends on WP-2 (design tokens) for elevation.

| ID | Finding | Change |
|----|---------|--------|
| F1 | No success feedback after any form submission | Build `Toast.svelte` component. Auto-dismiss 3–5s. Position above BottomNav on mobile, top-right on desktop. |
| DP-A1 | Toast needs `role="status"` | Include `aria-live="polite"` and `role="status"` on toast container. |

**Toast spec:**
- Variants: success (moss tint), error (error tint), info (sky tint)
- Auto-dismiss: 3s (success), 5s (error), 4s (info)
- Layout: `inline-flex`, padding `10px 12px` (`py-2.5 px-3`), border-radius 14px (`rounded-[14px]`), `shadow-dropdown`
- Animation: slide-in from bottom on mobile, slide-in from right on desktop. Exit at ~60% of entrance duration.
- Position: mobile bottom above BottomNav + FAB; top-right on desktop
- Max 1 visible toast at a time (queue if needed)
- Accessible: `role="status"`, `aria-live="polite"`, does not steal focus

**Integration points:** trip create, item create/edit/delete, expense create/edit/delete, member invite, settings save, phase create/edit/delete.

**Acceptance:** Every create/edit/delete action shows brief success confirmation. Toasts auto-dismiss. Screen reader announces them.

---

### WP-7: Button Loading State

| ID | Finding | Change |
|----|---------|--------|
| DP-F1 | Button has no loading/spinner state — double-submit risk | Add optional `loading` prop to `Button.svelte`. Shows spinner, sets `disabled` + `aria-busy="true"`. |

**Spec:**
- `loading: boolean` prop (default false)
- When loading: 14px spinner at `currentColor`, `opacity-[0.72]`, `pointer-events-none`, `aria-busy="true"`
- Width-locked: button does not resize when loading (use `min-width` or show spinner alongside label text)
- 4 variant specs: primary, secondary, outline, ghost — spinner inherits `currentColor` in all

**Acceptance:** Submit buttons show loading state during async operations. Double-click impossible during submission.

---

### WP-8: Skeleton Loading

| ID | Finding | Change |
|----|---------|--------|
| P1 | No skeleton loading screens | Add skeleton components for trip list, day view, expense list, member list. |

**Spec:**
- Use `paper`/`surface` palette, not generic gray
- Subtle shimmer animation (left-to-right gradient sweep)
- Match actual content layout dimensions
- Respect `prefers-reduced-motion` (static placeholder, no shimmer)

**Components needed:**
- `TripCardSkeleton.svelte`
- `DayItemSkeleton.svelte`
- `ExpenseRowSkeleton.svelte`
- `MemberCardSkeleton.svelte`

**Acceptance:** Each list view shows skeletons during load. Shimmer respects reduced motion. Layout doesn't shift when real content replaces skeletons.

---

### WP-9: Animation & Motion

| ID | Finding | Change |
|----|---------|--------|
| AN2 | No `prefers-reduced-motion` support | Wrap all animations in `@media (prefers-reduced-motion: no-preference)`. |
| DP-AN1 | BottomSheet snaps closed (no exit animation) | Add `slide-down` exit at ~60% of entrance duration. |
| AN1 | No page transition animations | 3 types via `beforeNavigate`/`afterNavigate`: peer nav horizontal slide 240ms, drill-down slide-up 280ms, tab switch crossfade 180ms. Reduced-motion fallback: simple fade (not disabled). |

**Acceptance:** Reduced motion preference disables all non-essential animation. BottomSheet animates both open and close. Page transitions feel spatial and intentional.

---

### WP-10: Desktop Layout (lg-desktop 1280px+)

| ID | Finding | Change |
|----|---------|--------|
| L1 | Content area wastes 55%+ screen at 1280px | Bump `max-w-lg` to `max-w-2xl` (672px) for all content pages at md-desktop. |
| L2 | SideRail is 72px, design calls for 240px | Breakpoints: 900px (`md-desktop`) and 1280px (`lg-desktop`). At md-desktop: 72px icon SideRail. At lg-desktop: expand to 240px with full nav labels, trip name, phase list. |
| L3 | No ContextRail | At lg-desktop: 320px right ContextRail. Content per route — **itinerary**: selected item preview + day-at-a-glance + up-next; **expenses**: budget vs actual + top categories + who-owes-whom; **members**: role overview + recent activity. |
| N4 | SideRail shows no trip name | Add trip name below "W" logo. Full text at lg-desktop, truncated/tooltip at md-desktop. |

**Acceptance:** 3-pane layout renders correctly at 1280px+. SideRail shows trip context. ContextRail shows route-appropriate content. Content doesn't feel cramped or wasteful at any breakpoint.

---

### WP-11: Form UX Improvements

| ID | Finding | Change |
|----|---------|--------|
| DP-F2 | Required fields have no visual indicator | Add red asterisk or "(required)" to required field labels. |
| DP-F4 | No inline validation on blur | Add blur validation for critical fields (email, required, date ranges). |
| DP-F5 | No focus-to-first-error after submission | Auto-focus first invalid field in `use:enhance` result handler. |
| N2 | `history.back()` fallback is unpredictable | Always provide explicit `backHref` on NavBar. Remove or guard `history.back()`. |

**Acceptance:** Required fields visually indicated. Blur validation fires on email and required fields. Failed submissions focus the first error field.

---

### WP-12: Image & Font Performance

| ID | Finding | Change |
|----|---------|--------|
| DP-P1 | Zero image optimization | Add `loading="lazy"`, `decoding="async"`, `width`/`height` to all `<img>` elements. |
| DP-P2 | No font preloading | Add `<link rel="preload">` for Inter 400 and Fraunces 600 woff2 files. Consider self-hosting critical fonts. |

**Acceptance:** Below-fold images lazy load. No CLS from images without dimensions. Critical fonts preloaded.

---

### WP-13: Minor Polish (grab bag)

| ID | Finding | Change |
|----|---------|--------|
| DP-TC3 | Card accent color via unsanitized inline style | Add hex validation function before injecting `border-left-color`. |
| DP-S2 | Competing primary CTAs on some screens | Audit and demote secondary actions to outline/ghost variant. |
| DP-L2 | Tab overflow scroll conflicts | Add `touch-action: pan-x` on tab containers. |
| L4 | Bottom padding inconsistent (pb-8 to pb-32) | Standardize using a shared class accounting for FAB/BottomNav presence. |

**Acceptance:** No style injection via card accents. One primary CTA per screen. Consistent bottom spacing.

---

### WP-14: Brand Assets

Finalize the Star System logo as canonical brand mark. Generate all required asset files.

| Asset group | Files |
|-------------|-------|
| Mark variants | `star-mark.svg`, `star-mark-inverse.svg`, `star-mark-outline.svg`, `sparkle.svg`, `star-stamp.svg` |
| Favicon | `favicon.svg` (32px viewBox), `favicon-32.png` |
| App icons | `app-icon.svg`, `app-icon-512.png`, `app-icon-192.png`, `apple-touch-icon.png` |
| App icon variants | `app-icon-ink.svg`, `app-icon-ink-512.png`, `app-icon-maskable.svg`, `app-icon-maskable-512.png` |
| Lockups | `lockup-horizontal.svg` (320×48), `lockup-stacked.svg` (200×100) |
| Nav icons | `logo/star-system.jsx` → `StarIcons` (8 nav icons, 24×24px, stroke 1.6) |

**Wordmark spec:** Fraunces 500, letter-spacing -0.02em.

**Asset placement:** `static/brand/` for SVGs and PNGs. `src/lib/icons/` for nav icon components. Wire favicon and PWA manifest icons into `src/app.html` and `static/manifest.json`.

**Acceptance:** PWA manifest references correct icon sizes (192, 512, maskable). Favicon renders cleanly at 16px and 32px. Nav icons render at 24×24 with consistent stroke-width 1.6. Lockup wordmark matches Fraunces 500 / -0.02em spec.

---

## Dependency Order

```
WP-1 (server errors) ──────────────────────────────► can start immediately
WP-2 (design tokens) ──────────────────────────────► can start immediately
WP-3 (accessibility) ─── depends on WP-2 (ink-muted)
WP-4 (touch) ──────────────────────────────────────► can start immediately
WP-5 (typography) ─────── depends on WP-2 (tokens)
WP-6 (toast) ──────────── depends on WP-2 (shadow tokens), WP-9 (animation)
WP-7 (button loading) ─────────────────────────────► can start immediately
WP-8 (skeletons) ─────── depends on WP-9 (reduced motion)
WP-9 (animation) ──────────────────────────────────► can start immediately
WP-10 (desktop layout) ── depends on WP-2 (tokens), WP-5 (typography)
WP-11 (form UX) ───────── depends on WP-3 (aria-live), WP-6 (toast for success)
WP-12 (performance) ───────────────────────────────► can start immediately
WP-13 (minor polish) ──────────────────────────────► can start immediately
WP-14 (brand assets) ──────────────────────────────► can start immediately
```

### Suggested session order

Canonical priority from design handoff (tokens first, then visual/interaction, then animation, then layout):

1. **WP-1** — Server errors (P0, unblocks testing)
2. **WP-2** — Design tokens (foundation; ink-muted, shadow scale, error tokens)
3. **WP-5 + WP-4** — Typography + touch targets (NavBar Fraunces, 44px targets, card press, phase chip)
4. **WP-7** — Button loading (small, independent)
5. **WP-3** — Accessibility (focus rings, aria-live, heading hierarchy)
6. **WP-9** — Animation & motion (before WP-8 needs reduced-motion)
7. **WP-6** — Toast system (depends on WP-2 shadow tokens)
8. **WP-8** — Skeleton loading (depends on WP-9 reduced-motion)
9. **WP-14** — Brand assets
10. **WP-10** — Desktop 3-pane layout (largest package)
11. **WP-12** — Image & font performance
12. **WP-11** — Form UX improvements
13. **WP-13** — Minor polish

**Estimated total: 11–15 sessions** depending on WP-10 and WP-14 complexity.

---

## Tracking

Each WP gets committed at completion with message format: `v2-WPn: description`

Progress tracked in this file — mark each WP with completion date when done.

| WP | Status | Date |
|----|--------|------|
| WP-1 | Done | 2026-05-23 |
| WP-2 | Done | 2026-05-23 |
| WP-3 | Done | 2026-05-24 |
| WP-4 | Done | 2026-05-24 |
| WP-5 | Done | 2026-05-24 |
| WP-6 | Done | 2026-05-25 |
| WP-7 | Done | 2026-05-24 |
| WP-8 | Done | 2026-05-25 |
| WP-9 | Not started | |
| WP-10 | Not started | |
| WP-11 | Not started | |
| WP-12 | Not started | |
| WP-13 | Not started | |
| WP-14 | Not started | |

---

## Exclusions (deferred to v3+ or backlog)

These items from UI_AUDIT.md are explicitly **not** in v2 scope:

| ID | What | Why deferred |
|----|------|-------------|
| DP-A4 | Keyboard alternatives for swipe gestures | Low severity, niche use case |
| DP-T3 | Swipe affordance hints | Low severity, discoverability polish |
| DP-P3 | Offline state banner | Needs service worker audit first |
| DP-AN2 | Animation interruptibility audit | Svelte transitions handle this by default |
| DP-N1 | Breadcrumbs on deep pages | Low severity, NavBar back works |
| T3 | BottomNav label size (11px) | Acceptable for nav pattern |
| T4 | Haptic feedback | Backlog polish |
| D1 | Expense breakdown charts | Feature, not polish |
| F3 | Progressive disclosure on item forms | Significant refactor |
| F4 | Form draft autosave | Feature, not polish |
| P2 | List virtualization | Performance at scale, not needed yet |
| P3 | Service worker cache audit | Needs dedicated investigation |
| TC4 | 11px section headers | Acceptable |
| AN3 | Micro-interaction animations | Visual delight, not usability |
| N3 | Post-login deep link redirect | Feature, not polish |
| S3 | Shadow token expansion | Implemented in WP-2 as full 5-level scale (no longer deferred) |
