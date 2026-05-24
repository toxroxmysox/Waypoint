# Waypoint UI/UX Audit Report

**Date:** 2026-05-23
**Auditor:** Claude (Preview MCP + ui-ux-pro-max skill)
**Viewports tested:** 375px (mobile), 900px (desktop), 1280px (wide desktop)
**Test trip:** China 2024 (active trip mode, multiple phases/days/items/expenses)

---

## Methodology

1. **Claude Preview MCP**: Navigated every app route at three viewport widths, took screenshots, ran `preview_inspect` on critical elements for computed CSS values
2. **ui-ux-pro-max 10-priority checklist**: Systematically evaluated against all 10 categories (Accessibility, Touch & Interaction, Performance, Style Selection, Layout & Responsive, Typography & Color, Animation, Forms & Feedback, Navigation Patterns, Charts & Data)
3. **Source code audit**: Verified component contracts, token usage, and pattern consistency

---

## Priority 1: Accessibility (CRITICAL)

### A1. Focus rings removed everywhere
- **Severity:** CRITICAL
- **Finding:** 14 inputs use `focus:outline-none` with only `focus:border-moss` (subtle border color change). Zero elements use `focus-visible` or `focus:ring-*`. Keyboard users cannot see which element is focused.
- **Files:** All form inputs in expenses, items/new, items/edit, settings, login
- **Fix:** Replace `focus:outline-none` with `focus:outline-none focus-visible:ring-2 focus-visible:ring-moss focus-visible:ring-offset-2` on all interactive elements. Consider a global base style.

### A2. ink-muted fails WCAG AA contrast on paper
- **Severity:** HIGH
- **Finding:** `ink-muted` (#8A847A) on `paper` (#F6F2EA) = **3.31:1 ratio**. WCAG AA requires 4.5:1 for normal text. Used in 176 instances across the codebase for secondary text, subtitles, metadata, timestamps.
- **Fix:** Darken `--color-ink-muted` to ~#6B665C (4.5:1) or ~#5C574E (5.5:1 for comfortable reading). Audit all `text-ink-muted` instances after the change.

### A3. NavBar subtitle at 12px
- **Severity:** MEDIUM
- **Finding:** NavBar subtitle (non-tagline variant) renders at `text-[12px]` in `text-ink-muted`. At 3.31:1 contrast and 12px size, this is nearly illegible for many users. Contains useful context (date ranges, phase counts).
- **Fix:** Bump to `text-[13px]` minimum. After fixing A2's contrast, 13px at 4.5:1 is acceptable.

### A4. No skip-link for keyboard navigation
- **Severity:** LOW
- **Finding:** No "skip to main content" link exists. Keyboard users must tab through all nav items on every page load.
- **Fix:** Add visually-hidden skip link in root layout, visible on focus.

### A5. Color-only meaning in some UI elements
- **Severity:** MEDIUM
- **Finding:** Phase color dots, expense balance indicators (green/red), and status states rely on color alone. No icon or text supplement for colorblind users.
- **Fix:** Add text labels or icons alongside color indicators (e.g., "Owes $20" not just red text with a number).

---

## Priority 2: Touch & Interaction (CRITICAL)

### T1. Back button undersized (36x36px)
- **Severity:** HIGH
- **Finding:** NavBar back button uses `h-9 w-9` (36x36px). Apple HIG minimum is 44x44pt. Also affects NotificationBell (36x36px) and PhaseColorPicker swatches (36x36px).
- **Fix:** Increase to `h-11 w-11` (44x44px) or keep visual size but extend hit area with padding/negative margins.

### T2. SideRail nav items cramped
- **Severity:** MEDIUM
- **Finding:** SideRail nav items are `w-14` (56px) wide with `py-2` and `text-[10px]` labels. Touch target height is approximately 40px. At 10px, labels are at the legibility floor.
- **Fix:** Increase label to `text-[11px]`, add `py-2.5` for 44px+ height.

### T3. BottomNav touch targets adequate but labels tiny
- **Severity:** LOW
- **Finding:** BottomNav items span full width (`flex-1`) so horizontal touch area is fine. Vertical height is ~48px (py-2 + icon + text). Labels at `text-[11px]` are small but standard for bottom navs.
- **Fix:** Acceptable for v2. Consider `text-xs` (12px) for v3.

### T4. No haptic feedback
- **Severity:** LOW (backlog)
- **Finding:** No haptic feedback on destructive actions, toggles, or confirmations. Standard on modern mobile PWAs.
- **Fix:** Add `navigator.vibrate()` for key actions (delete confirmations, expense logging, day completion).

---

## Priority 3: Performance (HIGH)

### P1. No skeleton/shimmer loading UI
- **Severity:** HIGH
- **Finding:** Zero skeleton screens or shimmer effects anywhere in the app. CLAUDE.md spec says "skeleton UI, not spinners, where the layout is known." Currently, pages either flash in instantly (cached) or show nothing during load.
- **Fix:** Add skeleton components for: trip list cards, day view item list, expense list, member list. These are the most-loaded views.

### P2. No lazy loading of below-fold content
- **Severity:** MEDIUM
- **Finding:** All content renders eagerly. Trip list, day items, and expense history load everything at once.
- **Fix:** For v3, virtualize the expense list (can grow to 100+ items). Day view items are typically <20, acceptable.

### P3. No service worker cache strategy visible
- **Severity:** LOW
- **Finding:** PWA manifest exists but service worker caching strategy not audited. Critical for trip mode when traveling (spotty connectivity).
- **Fix:** Audit and document SW caching in v3.

---

## Priority 4: Style Selection (HIGH)

### S1. Error messages use clay instead of error token
- **Severity:** MEDIUM
- **Finding:** Error feedback uses `text-clay` (#A5593A, 4.62:1 on paper) instead of `--color-error` (#B33A3A, 5.26:1). Clay is the trip-mode accent color, not semantically an error color. Using it for errors creates ambiguity.
- **Files:** trips/new, settings, days/[dayId], items/new, items/edit, phases — all use `text-clay` + `bg-clay/10` + `border-clay/30` for error banners.
- **Fix:** Switch to `text-error` + `bg-error/10` + `border-error/30`. Reserve clay exclusively for trip-mode state.

### S2. Closeout uses off-brand colors (green-50, amber-50)
- **Severity:** MEDIUM
- **Finding:** CloseoutItemRow and CloseoutDayCard use Tailwind preset greens (`bg-green-50`, `text-green-700`) and ambers (`bg-amber-50`, `text-amber-700`) instead of design system tokens. These stand out as visually disconnected from the paper/moss/clay palette.
- **Fix:** Map to design tokens: green states -> `moss-tint`/`moss`, amber -> `gold-tint`/`gold` or similar.

### S3. No elevation/shadow hierarchy
- **Severity:** LOW
- **Finding:** Only two shadow tokens exist (`shadow-card`, `shadow-card-strong`). Cards, modals, bottom sheets, and FAB all share from these two levels. Design handoff specified a richer elevation scale.
- **Fix:** Add `--shadow-elevated` (for FAB, modals) and `--shadow-overlay` (for bottom sheets, dropdowns) tokens.

### S4. Icon style consistency
- **Severity:** LOW (verified good)
- **Finding:** All icons are inline SVGs with consistent stroke-width (1.75-2.25), stroke-linecap round, and 20-24px viewBox. Good consistency.

---

## Priority 5: Layout & Responsive (HIGH)

### L1. Wide desktop (1280px+) wastes significant space
- **Severity:** HIGH
- **Finding:** Every page uses `max-w-lg` (512px) with `mx-auto`. At 1280px with a 72px SideRail, content area is 1208px but content column is only 512px centered. Over 55% of the screen is empty white space.
- **Fix (v2):** Bump to `max-w-2xl` (672px) for all content pages. This fills the space better without becoming too wide for readability (line length stays under 75 chars).
- **Fix (v3):** Implement the 3-pane layout from design handoff at `lg-desktop` (1280px+): SideRail (expanded to 240px) + main content (flex-1) + ContextRail (320px for item details, day summary, etc.).

### L2. SideRail is 72px icon-only, not 240px from design handoff
- **Severity:** MEDIUM
- **Finding:** Design handoff specified a 240px SideRail with full labels, trip name, and section headers. Current implementation is a minimal 72px icon rail.
- **Fix (v3):** At `lg-desktop` (1280px+), expand SideRail to 240px with trip name, full-text nav items, and section groups. Keep 72px icon rail at `md-desktop` (900-1279px).

### L3. No ContextRail implemented
- **Severity:** MEDIUM
- **Finding:** Design handoff specified a right-side ContextRail (320px) for contextual details (item preview, day summary, phase overview). Not implemented at any breakpoint.
- **Fix (v3):** Add ContextRail at `lg-desktop` breakpoint. Content varies by route: item detail on itinerary, spending summary on expenses, role overview on members.

### L4. Content padding inconsistency
- **Severity:** LOW
- **Finding:** Most pages use `px-4 pt-4 pb-8`, but today/upcoming uses `pb-24`, expenses uses `pb-24`, and closeout uses `pb-32`. The variation exists to clear the FAB/bottom nav but is inconsistent.
- **Fix:** Standardize bottom padding. Use a shared class or CSS variable that accounts for FAB presence.

---

## Priority 6: Typography & Color (MEDIUM)

### TC1. NavBar h1 uses Inter, not Fraunces
- **Severity:** HIGH
- **Finding:** Trip title in NavBar (`<h1>`) uses `text-base font-semibold` (Inter). Every other heading in the app uses `font-display` (Fraunces). The top-level page title is the most prominent heading and should use the display font.
- **File:** `src/lib/components/ui/NavBar.svelte` line 59
- **Fix:** Add `font-display` to the h1: `class="text-ink truncate text-base font-display font-semibold leading-tight"`. Consider bumping to `text-lg` for more presence.

### TC2. 176 instances of sub-14px text
- **Severity:** MEDIUM
- **Finding:** `text-[10px]` (10px), `text-[11px]` (11px), `text-[11.5px]` (11.5px), `text-[12px]` (12px), and `text-xs` (12px) used 176 times. Many are metadata/labels where small text is appropriate, but some carry important information (phase names, item subtypes, timestamps).
- **Fix:** Audit case-by-case. Bump informational text to 12px minimum. Keep decorative labels (attribution "Powered by Google") at 10px.

### TC3. No consistent heading scale
- **Severity:** MEDIUM
- **Finding:** Headings use ad-hoc sizes: h1 at 16px (NavBar), h2 at 20px (day view) or 18px (phases), h3 at 18px (trip cards). No systematic type scale is enforced.
- **Fix:** Define a type scale in design tokens: `--text-page-title: 20px`, `--text-section-title: 18px`, `--text-card-title: 16px`, `--text-label: 13px`, `--text-caption: 11px`.

### TC4. Section headers at 11px uppercase
- **Severity:** LOW
- **Finding:** Section headers like "NOTES", "MORNING", "AFTERNOON" use ~11px uppercase text-moss with tracking-wide. Readable but at the minimum threshold.
- **Fix:** Acceptable for v2. These are decorative section dividers with clear visual purpose.

---

## Priority 7: Animation (MEDIUM)

### AN1. No page transition animations
- **Severity:** MEDIUM
- **Finding:** Route changes are instant with no transition. Moving between days, items, and trip sections feels abrupt. Design handoff mentioned spatial continuity transitions.
- **Fix (v3):** Add SvelteKit page transitions: horizontal slide for same-level navigation (day-to-day), vertical slide-up for drill-down (list-to-detail), crossfade for tab switches.

### AN2. No reduced-motion support
- **Severity:** MEDIUM
- **Finding:** Zero instances of `prefers-reduced-motion` in CSS or JS. The FAB has `active:scale-95`, BottomSheet has `animate-slide-up`, and cards have `transition-shadow`. None of these respect user's motion preferences.
- **Fix:** Wrap all animations in `@media (prefers-reduced-motion: no-preference) { ... }`. The FAB scale and card shadow transitions should be suppressed for users who request reduced motion.

### AN3. Only one custom animation defined
- **Severity:** LOW
- **Finding:** Only `animate-slide-up` (BottomSheet) exists as a custom animation. No entrance animations for list items, no state transitions for interactive elements, no micro-interactions on key actions.
- **Fix (v3):** Add subtle animations: list item stagger on page load, success checkmark on form submit, FAB rotation when options expand.

---

## Priority 8: Forms & Feedback (MEDIUM)

### F1. No success feedback after form submissions
- **Severity:** HIGH
- **Finding:** Creating a trip, adding an item, logging an expense, inviting a member — none of these show success feedback. The page just navigates or the modal closes. Users can't confirm their action worked.
- **Fix:** Add a brief toast or inline success indicator for: item created, expense logged, member invited, settings saved, phase created. Auto-dismiss in 3-5s.

### F2. Error messages near field (verified good)
- **Severity:** N/A (passes)
- **Finding:** Error banners appear inline within the form, near the top of the form area. For single-field errors in expenses, the message is next to the field.

### F3. No progressive disclosure on complex forms
- **Severity:** MEDIUM
- **Finding:** Item create/edit form shows all fields at once (name, type, date, time, location, description, notes, confirmation codes, costs). This is 8+ fields on mobile, requiring significant scroll.
- **Fix (v3):** Group into collapsible sections: "Basics" (name, type, date, time) always open; "Location" collapsed; "Details" (description, notes, confirmation codes) collapsed; "Money" (cost) collapsed. Show summary when collapsed.

### F4. No autosave on long forms
- **Severity:** LOW
- **Finding:** Item edit form has many fields. If the user accidentally navigates away or the page crashes, all edits are lost.
- **Fix (backlog):** Draft autosave to localStorage for item create/edit forms.

### F5. Confirmation dialogs for destructive actions (verified good)
- **Severity:** N/A (passes)
- **Finding:** Delete actions in items, expenses, and members show confirmation dialogs via BottomSheet.

---

## Priority 9: Navigation Patterns (HIGH)

### N1. BottomNav: 4 items with icons + labels (verified good)
- **Severity:** N/A (passes)
- **Finding:** 4 items (Itinerary, Money, Members, More), well under the 5-item limit. Each has icon + text label. Active state uses moss color with tint background.

### N2. Back behavior inconsistent
- **Severity:** MEDIUM
- **Finding:** NavBar back button uses either `backHref` (explicit URL) or `history.back()`. The `history.back()` fallback is unpredictable — if the user deep-linked to the page, back goes to the previous site, not the parent route.
- **Fix:** Always provide explicit `backHref` pointing to the logical parent route. Never rely on `history.back()` as primary navigation.

### N3. No deep link support verification
- **Severity:** LOW
- **Finding:** All routes are SvelteKit file-based, so they're inherently deep-linkable. But item detail pages require trip membership auth — sharing a link to `/trips/china-2024/items/abc` would just redirect to login without context.
- **Fix (v3):** After login redirect, bounce the user back to the deep-linked page instead of always going to `/trips`.

### N4. SideRail has no trip name or context
- **Severity:** MEDIUM
- **Finding:** Desktop SideRail shows "W" logo and 4 nav tabs. No trip name, no phase indicator, no mode badge. Users managing multiple trips have no indication which trip they're viewing.
- **Fix:** Add trip name below "W" logo in SideRail. At `lg-desktop`, show full trip name; at `md-desktop`, show truncated or tooltip.

---

## Priority 10: Charts & Data (LOW)

### D1. Expense breakdown has no visual chart
- **Severity:** LOW
- **Finding:** Budget/expenses page shows numbers and categories in lists. No pie chart, bar chart, or visual breakdown of spending by category or member.
- **Fix (backlog):** Add a simple donut chart for category breakdown and a stacked bar for member spending. Use accessible colors from the design system.

---

## Server Errors Found

### E1. /parking-lot returns 500
- **Severity:** CRITICAL (blocking feature)
- **Finding:** Navigating to `/trips/[slug]/parking-lot` throws a server error. Not debugged yet.
- **Fix:** Debug and fix the server-side data loading in `parking-lot/+page.server.ts`.

### E2. /closeout returns 500
- **Severity:** HIGH (blocking feature)
- **Finding:** Navigating to `/trips/[slug]/closeout` throws a server error. Not debugged yet.
- **Fix:** Debug and fix. Closeout may have data dependency issues (requires specific trip state).

---

## Verified Good

These items passed the audit and need no changes:

- **FAB positioning**: 56x56px, bottom: 80px (clears bottom nav), z-40
- **Form input font size**: 16px on all inputs (avoids iOS auto-zoom)
- **Submit buttons**: Adequate height (46px), good contrast (moss on paper)
- **Bottom nav**: Hides on input focus (prevents keyboard overlap)
- **Safe area insets**: Bottom nav uses `env(safe-area-inset-bottom)`
- **FAB uses safe area**: Custom `.fab-safe-bottom` class
- **ARIA labels**: Present on icon-only buttons (back, close, notification bell, FAB)
- **Desktop breakpoint**: Side rail correctly replaces bottom nav at 900px
- **Design token usage**: Colors, fonts, radii, and shadows consistently use CSS custom properties via Tailwind v4 @theme
- **Icon consistency**: All SVG, consistent stroke weight, no emoji
- **Viewport meta**: Correctly set, zoom not disabled

---

## Implementation Plan

### v2: Ship Now (high-impact, UX-critical)

These fix real usability problems or broken features. Do before the next dogfood trip.

| # | Finding | Priority | Effort |
|---|---------|----------|--------|
| 1 | **E1** Fix /parking-lot 500 error | P0 | S |
| 2 | **E2** Fix /closeout 500 error | P0 | S |
| 3 | **A1** Add focus-visible rings to all interactive elements | P1 | M |
| 4 | **A2** Darken ink-muted to 4.5:1 contrast ratio | P1 | S |
| 5 | **TC1** NavBar h1: add font-display (Fraunces) | P1 | XS |
| 6 | **S1** Error messages: switch text-clay to text-error | P2 | S |
| 7 | **T1** Back button + NotificationBell: increase to 44px touch target | P2 | S |
| 8 | **L1** Bump max-w-lg to max-w-2xl on all content pages | P2 | S |
| 9 | **F1** Add success toast/feedback for form submissions | P2 | M |
| 10 | **N2** Replace history.back() with explicit backHref on all NavBars | P3 | S |
| 11 | **P1** Add skeleton loading screens for trip list, day view, expenses | P3 | M |
| 12 | **N4** Add trip name to SideRail | P3 | S |
| 13 | **L2** Expand SideRail to 240px at lg-desktop (1280px+) | P2 | M |
| 14 | **L3** Implement ContextRail for lg-desktop | P2 | L |
| 15 | **AN1** Add page transition animations (slide, crossfade) | P3 | M |
| 16 | **AN2** Add prefers-reduced-motion support | P3 | S |

**Estimated effort:** ~5-6 focused sessions

### v3: Polish (medium-impact, design refinements)

Design system maturation and remaining refinements.

| # | Finding | Priority | Effort |
|---|---------|----------|--------|
| 1 | **S2** Replace off-brand colors in closeout with design tokens | P3 | S |
| 2 | **TC2** Audit and bump critical sub-14px text to 12px+ | P3 | M |
| 3 | **TC3** Define and enforce systematic type scale | P3 | M |
| 4 | **A5** Add icon/text supplements to color-only indicators | P3 | M |
| 5 | **F3** Progressive disclosure on item create/edit forms | P4 | M |
| 6 | **S3** Expand shadow/elevation token system | P4 | S |
| 7 | **N3** Post-login redirect to deep-linked page | P4 | S |

**Estimated effort:** ~2-3 focused sessions

### Backlog: Nice to Have

| # | Finding | Notes |
|---|---------|-------|
| 1 | **AN3** Micro-interactions and list entrance animations | Visual delight |
| 2 | **T4** Haptic feedback on key actions | Mobile feel |
| 3 | **D1** Expense breakdown charts | Data visualization |
| 4 | **F4** Form draft autosave | Data loss prevention |
| 5 | **A4** Skip-link for keyboard navigation | Accessibility completeness |
| 6 | **P2** Virtualize long lists (expenses 100+) | Performance at scale |
| 7 | **P3** Service worker caching audit | Offline reliability |
| 8 | **L4** Standardize bottom padding across pages | Consistency |
| 9 | **TC4** Review 11px section headers | Typography refinement |

---

## Exclusions Per Scott's Instructions

The following were explicitly deprioritized and are not included:
- Dark mode
- Notifications system
- Role downgrade flows

---

## ui-ux-pro-max Deep Pass — Additional Findings

Cross-referenced against every sub-rule in the skill's 10 priority categories. Only net-new issues and severity adjustments listed below. Original findings (A1–A5, T1–T4, P1–P3, S1–S4, L1–L4, TC1–TC4, AN1–AN3, F1–F5, N1–N4, D1) remain unchanged unless explicitly noted.

### Severity Adjustments to Existing Findings

| ID | Change | Rationale |
|----|--------|-----------|
| **T1** | Upgrade: HIGH → CRITICAL | PhaseColorPicker swatches are also 36×36px (same as NavBar back button). Two separate components violate `touch-target-size` (44×44pt minimum). Scope is wider than originally captured. |

### Category 1 — Accessibility (CRITICAL)

| ID | Severity | Sub-rule | Finding | Fix |
|----|----------|----------|---------|-----|
| **DP-A1** | CRITICAL | `aria-live-errors` | Zero `aria-live` regions or `role="alert"` anywhere in the codebase. Form validation errors, toast messages, and dynamic content updates are invisible to screen readers. | Add `aria-live="polite"` wrapper around form error messages. Add `role="status"` to toast/snackbar container. Add `aria-live="assertive"` for critical errors. |
| **DP-A2** | HIGH | `heading-hierarchy` | Multiple heading level skips: trip list page uses `h3` with no `h1`/`h2` above it; day view jumps `h1→h2→h4` (skips `h3`). Sequential heading hierarchy required for screen reader navigation. | Restructure headings to follow sequential order. Trip list: add visually-hidden `h1` + `h2`, or promote existing `h3` to `h2`. Day view: change `h4` to `h3`. |
| **DP-A3** | MEDIUM | `voiceover-sr` | No focus management on SvelteKit route changes. Screen readers are not notified when pages navigate — users lose orientation. | Add an `afterNavigate` hook that focuses a skip target or announces the new page title via an `aria-live` region. |
| **DP-A4** | LOW | `keyboard-shortcuts` | No keyboard alternatives for swipe gestures (DayNav swipe-to-navigate between days). Keyboard-only users have no equivalent. | Add left/right arrow key handlers on the day view for day-to-day navigation. |

### Category 2 — Touch & Interaction (CRITICAL)

| ID | Severity | Sub-rule | Finding | Fix |
|----|----------|----------|---------|-----|
| **DP-T1** | MEDIUM | `tap-delay` | No `touch-action: manipulation` on general interactive elements. Only `DayNav.svelte` sets `touch-action: pan-y`. 300ms tap delay may persist on other touch targets in older WebKit. | Add `touch-action: manipulation` to `html` or `body` in `layout.css` as a global default. |
| **DP-T2** | MEDIUM | `press-feedback` | Card component's press feedback is nearly imperceptible: `active:scale-[0.997]` (0.3% scale) provides no visible feedback. Material Design recommends scale 0.95–1.05 or ripple/highlight on press. | Increase to `active:scale-[0.98]` or add a subtle background color shift on `:active` state. |
| **DP-T3** | LOW | `swipe-clarity` | DayNav swipe-to-navigate has no visual affordance (no chevron, edge hint, or tutorial). Users must discover the gesture by accident. | Add subtle left/right chevron indicators or a first-use tooltip hinting at swipe navigation. |

### Category 3 — Performance (HIGH)

| ID | Severity | Sub-rule | Finding | Fix |
|----|----------|----------|---------|-----|
| **DP-P1** | HIGH | `image-optimization` | Zero use of `srcset`, `sizes`, `loading="lazy"`, `decoding="async"`, or modern formats (WebP/AVIF) on any `<img>` element. All images load eagerly at original resolution. | Add `loading="lazy"` and `decoding="async"` to below-fold images. Add `width`/`height` attributes to prevent CLS. Use `srcset` where multiple resolutions are available. |
| **DP-P2** | MEDIUM | `font-preload` | Three font families (Inter 4 weights, Fraunces 4 weights + italic, JetBrains Mono 3 weights) loaded via a single Google Fonts `<link>`. No `<link rel="preload">` for the critical subset (Inter 400/500 for body, Fraunces 600 for display). All weights load with equal priority. | Add `<link rel="preload" as="font" crossorigin>` for Inter 400 and Fraunces 600 woff2 files. Consider self-hosting critical fonts to eliminate the Google Fonts round-trip. |
| **DP-P3** | LOW | `offline-support` | `service-worker.ts` exists but there is no user-facing offline indicator. When connectivity drops, the app silently fails with no messaging. | Add a slim offline banner (e.g., fixed top bar: "You're offline — changes will sync when you reconnect") triggered by `navigator.onLine` / `online`/`offline` events. |

### Category 4 — Style Selection (HIGH)

| ID | Severity | Sub-rule | Finding | Fix |
|----|----------|----------|---------|-----|
| **DP-S1** | MEDIUM | `elevation-consistent` | Only two shadow tokens defined (`shadow-card`, `shadow-card-strong`). No elevation scale for sheets, modals, dropdowns, FAB, or overlays. Components use arbitrary shadows or none. | Define a 4–5 level shadow/elevation scale in `@theme` (e.g., `shadow-sm`, `shadow-card`, `shadow-dropdown`, `shadow-modal`, `shadow-overlay`) and apply consistently. |
| **DP-S2** | LOW | `primary-action` | Some screens have competing primary-weight CTAs. The expense list has both FAB (+) and inline "Add" buttons visible simultaneously. | Ensure one primary CTA per screen. Demote secondary actions to outline/ghost variant. |

### Category 5 — Layout & Responsive (HIGH)

| ID | Severity | Sub-rule | Finding | Fix |
|----|----------|----------|---------|-----|
| **DP-L1** | MEDIUM | `z-index-management` | Raw `z-` utilities scattered across components (z-20, z-30, z-40, z-50) with no documented scale or design tokens. No `z-index` tokens in `@theme`. | Define z-index tokens in `@theme` (e.g., `--z-dropdown: 20`, `--z-sticky: 30`, `--z-nav: 40`, `--z-modal: 50`, `--z-overlay: 60`) and reference them via Tailwind utilities or CSS vars. |
| **DP-L2** | LOW | `scroll-behavior` | `TripTabs` and `SubTabs` use `overflow-x-auto`, creating horizontally-scrollable regions inside the main vertical scroll. On mobile, this can intercept vertical swipes when the finger angle is ambiguous. | Add `touch-action: pan-x` on the tab containers and ensure they have visible scroll affordances (fade edges or scroll indicators). |

### Category 6 — Typography & Color (MEDIUM)

| ID | Severity | Sub-rule | Finding | Fix |
|----|----------|----------|---------|-----|
| **DP-TC1** | MEDIUM | `number-tabular` | Expense amounts, budget totals, and cost figures use default proportional figures. Numbers in columns shift layout as values change (e.g., $1.00 vs $999.99). | Add `font-variant-numeric: tabular-nums` (Tailwind: `tabular-nums`) to expense amount displays, budget summaries, and any numeric columns. |
| **DP-TC2** | LOW | `truncation-strategy` | Many elements use `truncate` (text-overflow: ellipsis) but none provide a tooltip or expand mechanism to reveal full text. Trip names, item titles, and member names can be silently clipped. | Add `title` attribute with full text on truncated elements, or use a tooltip component on hover/long-press. |
| **DP-TC3** | LOW | `color-semantic` | Card component injects accent color via inline style (`border-left-color:${accent}`). The color value comes from user-defined phase colors (hex strings from DB), bypassing the design token system. | This is acceptable for user-customizable colors but should sanitize the hex value (validate format) to prevent style injection. Wrap in a validation function. |

### Category 7 — Animation (MEDIUM)

| ID | Severity | Sub-rule | Finding | Fix |
|----|----------|----------|---------|-----|
| **DP-AN1** | MEDIUM | `exit-faster-than-enter` | `BottomSheet` has a `slide-up` entrance animation but no corresponding exit animation. Closing snaps instantly, breaking spatial continuity. | Add a `slide-down` exit animation at ~60–70% of entrance duration. Use Svelte `transition:fly` or `out:fly={{ y: 300, duration: 200 }}`. |
| **DP-AN2** | LOW | `interruptible` | No evidence that animations can be interrupted by user interaction. If a sheet is animating in and the user taps elsewhere, behavior is undefined. | Ensure transition components allow cancellation. Svelte transitions are interruptible by default; verify no `animation-fill-mode: forwards` blocks re-trigger. |

### Category 8 — Forms & Feedback (MEDIUM)

| ID | Severity | Sub-rule | Finding | Fix |
|----|----------|----------|---------|-----|
| **DP-F1** | HIGH | `loading-buttons` | `Button.svelte` has no loading/spinner state. Async form submissions (create trip, add expense, etc.) leave the button clickable during the request, risking double-submits. | Add an optional `loading` prop to Button that shows a spinner and sets `disabled` + `aria-busy="true"` during async operations. |
| **DP-F2** | MEDIUM | `required-indicators` | HTML `required` attribute is used on many form fields, but there is no visual asterisk or "required" label. Users cannot distinguish required from optional fields visually. | Add a red asterisk (`*`) or "(required)" text next to required field labels. Consider a form-level note: "Fields marked * are required." |
| **DP-F3** | MEDIUM | `disabled-states` | Disabled element opacity is inconsistent across components: 0.30 (closeout buttons), 0.40 (item detail actions), 0.50 (Button, settings toggles, expense items, item edit). Material Design recommends 0.38. | Standardize to `opacity-40` (0.40, closest to MD's 0.38) across all disabled states. Define as a shared Tailwind utility or component class. |
| **DP-F4** | MEDIUM | `inline-validation` | No blur-triggered inline validation on form inputs. Errors only surface on form submission. Users fill entire forms before learning of errors. | Add `on:blur` validation for critical fields (email format, required fields, date ranges). Show inline error message below the field immediately on blur. |
| **DP-F5** | MEDIUM | `focus-management` | After form submission errors, focus is not moved to the first invalid field. Users must manually scroll/tab to find the error. | After server-side validation failure, auto-focus the first field with an error using `element.focus()` in the form's `use:enhance` result handler. |

### Category 9 — Navigation Patterns (HIGH)

| ID | Severity | Sub-rule | Finding | Fix |
|----|----------|----------|---------|-----|
| **DP-N1** | LOW | `breadcrumb-web` | Deep pages like `items/[itemId]/edit` (3+ levels deep) and `expenses/[expenseId]/edit` have no breadcrumb trail. Users rely solely on the back button with no orientation of where they are in the hierarchy. | Add a lightweight breadcrumb or "back to [parent]" link on edit pages. Doesn't need to be a full breadcrumb component — even "< Itinerary" as a text link above the NavBar h1 would help. |
| **DP-N2** | LOW | `back-behavior` | NavBar uses `history.back()` as fallback when no explicit `backHref` is provided. If the user deep-linked or opened in a new tab, `history.back()` navigates away from the app entirely. | Always provide an explicit `backHref` prop to NavBar pointing to the logical parent route. Remove `history.back()` fallback or guard it with a same-origin check. |

### Summary

| Priority | Category | New Findings | Severity Adjustments |
|----------|----------|-------------|---------------------|
| 1 | Accessibility | 4 (DP-A1 through DP-A4) | T1 upgraded to CRITICAL |
| 2 | Touch & Interaction | 3 (DP-T1 through DP-T3) | — |
| 3 | Performance | 3 (DP-P1 through DP-P3) | — |
| 4 | Style Selection | 2 (DP-S1, DP-S2) | — |
| 5 | Layout & Responsive | 2 (DP-L1, DP-L2) | — |
| 6 | Typography & Color | 3 (DP-TC1 through DP-TC3) | — |
| 7 | Animation | 2 (DP-AN1, DP-AN2) | — |
| 8 | Forms & Feedback | 5 (DP-F1 through DP-F5) | — |
| 9 | Navigation | 2 (DP-N1, DP-N2) | — |
| 10 | Charts & Data | 0 | — |
| **Total** | | **26 net-new** | **1 upgrade** |

### Recommended Fix Order

**Batch 1 — Quick wins with high impact:**
1. **DP-A1** aria-live regions (CRITICAL, pattern-level fix)
2. **DP-F1** Button loading state (HIGH, single component)
3. **DP-P1** Image lazy loading + dimensions (HIGH, find-and-replace)
4. **DP-T1** Global touch-action: manipulation (MEDIUM, one CSS line)
5. **DP-F3** Standardize disabled opacity (MEDIUM, find-and-replace)

**Batch 2 — Structural improvements:**
6. **DP-A2** Fix heading hierarchy (HIGH)
7. **DP-F2** Required field indicators (MEDIUM)
8. **DP-TC1** Tabular numbers on expenses (MEDIUM)
9. **DP-L1** Z-index token scale (MEDIUM)
10. **DP-AN1** BottomSheet exit animation (MEDIUM)

**Batch 3 — Polish:**
11. **DP-A3** Focus on route change (MEDIUM)
12. **DP-F4** Inline blur validation (MEDIUM)
13. **DP-F5** Focus first invalid field (MEDIUM)
14. **DP-S1** Elevation/shadow scale (MEDIUM)
15. **DP-P2** Font preload optimization (MEDIUM)
16. Remaining LOW items as time permits
