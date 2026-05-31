# Waypoint Design System

Living reference for colors, typography, components, and patterns. Source of truth for design tokens is `src/routes/layout.css` `@theme {}` block.

---

## Branding & Logo

### Symbol

The Waypoint mark is a **four-point star** (compass-star shape). Single cubic-bezier path, pinched at the center, giving a hand-drawn cartographic feel.

```
M 0 -50 C 4 -12 12 -4 50 0 C 12 4 4 12 0 50 C -4 12 -12 4 -50 0 C -12 -4 -4 -12 0 -50 Z
```

### Logo Assets

Source files in `design_handoff_v3/brand/`. To be installed at `static/` per PWA manifest.

| Asset | Description | Background | Star | Usage |
|-------|-------------|-----------|------|-------|
| `app-icon.svg` / `.png` | Primary app icon | moss (`#3E5A3A`), rx=112 | paper (`#F6F2EA`) | PWA icon, app stores |
| `app-icon-ink.svg` / `.png` | Dark variant | ink (`#1C1B18`), rx=112 | paper | Dark contexts, social preview |
| `app-icon-maskable.svg` / `.png` | Maskable (no rounding) | moss, no radius | paper (smaller scale) | Android adaptive icon |
| `favicon.svg` / `favicon-32.png` | Browser tab | transparent | ink | `<link rel="icon">` |
| `apple-touch-icon.png` | iOS home screen | (rasterized) | | `<link rel="apple-touch-icon">` |

### Wordmarks (Lockups)

| Asset | Layout | Font |
|-------|--------|------|
| `lockup-horizontal.svg` | Star left, "Waypoint" right | Fraunces 500, -0.02em tracking |
| `lockup-stacked.svg` | Star above, "Waypoint" below | Fraunces 500, -0.02em tracking |

Text color: ink (`#1C1B18`). Star color: ink. Both on transparent background.

### Decorative Marks

| Asset | Description | Usage |
|-------|-------------|-------|
| `star-mark.svg` | Solid ink star, no background | Inline decoration, watermarks |
| `star-mark-inverse.svg` | Solid paper star, no background | On dark backgrounds |
| `star-mark-outline.svg` | Ink stroke-only star (6px) | Subtle/lightweight contexts |
| `star-stamp.svg` | Star inside a circle (passport-stamp style) | Badges, completion marks, archive branding |
| `sparkle.svg` | Tiny 24px star, `currentColor` fill | Inline icon, UI accent (empty states, loading) |

### Brand Rules

- **Primary palette:** moss background + paper star (app icon). Ink + paper for dark variant.
- **Wordmark font:** Fraunces at weight 500, -0.02em letter-spacing. Never substitute.
- **Minimum clear space:** Half the star's width on all sides.
- **Do not:** rotate the star, add drop shadows, use non-token colors, stretch the lockup.

---

## Color Semantics

### Base Theme

| Token | Hex | Role |
|-------|-----|------|
| `paper` | `#f6f2ea` | Page background. Warm off-white. |
| `surface` | `#ffffff` | Card/input backgrounds. |
| `surface-2` | `#fbf8f2` | Subtle surface variant (empty states, secondary panels). |
| `ink` | `#1c1b18` | Primary text. |
| `ink-soft` | `#4c4a44` | Secondary text, labels. |
| `ink-muted` | `#67625a` | Tertiary text, timestamps, metadata. |
| `line` | `#e2dcd0` | Borders, dividers, separators. |

### Accent Colors

| Token | Hex | Concept |
|-------|-----|---------|
| `moss` | `#3e5a3a` | **Planning Mode** accent. Nav highlights, phase indicators, primary CTAs, focus rings. |
| `moss-soft` | `#6f8b6a` | Lighter moss for secondary emphasis. |
| `moss-tint` | `#e8efe3` | Moss background tint (phase chips, selected states). |
| `clay` | `#a5593a` | **Trip Mode** accent. Nav highlights, destructive-adjacent actions (delete confirmation). |
| `clay-tint` | `#f0e0d6` | Clay background tint. |
| `gold` | `#c89b3c` | Unplanned items, suggestion cards (dashed gold border). |
| `gold-deep` | `#8a6f24` | High-contrast gold for text on light backgrounds. |
| `gold-tint` | `#fbf1dc` | Gold background tint. |
| `sky` | `#3b6ba5` | Multi-day / ongoing indicator. |
| `sky-tint` | `#e6eef8` | Sky background tint. |

### Error

| Token | Hex | Role |
|-------|-----|------|
| `error` | `#b33a3a` | Inline field validation text. |
| `error-tint` | `#f5e0de` | Error banner background. |
| `error-deep` | `#8e2a2a` | Error banner text (higher contrast on tinted bg). |

---

## Typography

| Token | Family | Usage |
|-------|--------|-------|
| `--font-display` | **Fraunces** (Georgia fallback) | Page titles, section headers, empty-state messages. Italic for decorative emphasis. |
| `--font-sans` | **Inter** (system-ui fallback) | Body text, labels, buttons, form inputs — everything else. |
| `--font-mono` | **JetBrains Mono** (ui-monospace fallback) | Dates, timestamps, counts, budget figures. Uses `tabular-nums` for numeric alignment. |

### Scale

No formal type scale — sizes are set per-component via Tailwind utilities. Common patterns:

- Page titles: `text-lg font-semibold font-display`
- Section headers: `text-sm font-semibold uppercase tracking-wider` (via `SectionH`)
- Body: `text-sm`
- Metadata: `text-[11.5px] font-mono text-ink-muted`
- Labels: `text-sm font-medium text-ink-soft`

---

## Spacing & Layout

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 6px | Small elements (pills, chips). |
| `--radius-md` | 10px | Cards, inputs, buttons. |
| `--radius-lg` | 16px | Bottom sheets, modals. |
| `--radius-xl` | 22px | FAB, large rounded elements. |

### Breakpoints

| Token | Value | Behavior |
|-------|-------|----------|
| `--breakpoint-md-desktop` | 900px | Desktop layout: SideRail replaces BottomNav. |
| `--breakpoint-lg-desktop` | 1280px | Wide desktop: ContextRail appears alongside SideRail. |

### Content Width

Main content: `max-w-lg` (mobile), `md-desktop:max-w-2xl` (desktop).

---

## Elevation (Shadows)

| Token | Usage |
|-------|-------|
| `shadow-card` | Default card resting state. |
| `shadow-card-strong` | Cards needing more presence (feature cards). |
| `shadow-elevated` | Raised elements (dropdowns at rest). |
| `shadow-dropdown` | Dropdown menus, popovers. |
| `shadow-overlay` | Bottom sheets (upward shadow). |
| `shadow-modal` | Modal dialogs. |

### Z-Index

| Token | Value | Layer |
|-------|-------|-------|
| `z-dropdown` | 20 | Dropdown menus. |
| `z-sticky` | 30 | Sticky headers, SubTabs. |
| `z-nav` | 40 | BottomNav, SideRail, NavBar. |
| `z-modal` | 50 | Modals, bottom sheets. |
| `z-overlay` | 60 | Full-screen overlays. |

---

## Component Patterns

### Primitives (`src/lib/ui/`)

| Component | Purpose |
|-----------|---------|
| `Button` | Primary (`moss`), ghost, destructive variants. Sizes: sm, md. |
| `Card` | Surface container with optional `accent` left-border and optional `href` for clickable cards. |
| `NavBar` | Top navigation bar with title, subtitle, back button. |
| `SubTabs` | Horizontal tab row (Overview / Phases, etc.). |
| `SectionH` | Section header — small caps, muted, with tracking. |
| `Pill` | Small label/tag (status badges, categories). |
| `PhaseChip` | Circular phase initial with moss background. Sizes: 16, 18, 20px. |
| `Avatar` | User avatar circle with initials fallback. |
| `TypeIcon` | Item type icon (lodging, flight, activity, etc.). |
| `BottomSheet` | Mobile modal sliding up from bottom. |
| `FAB` | Floating action button with safe-area positioning. |
| `Toast` | Transient notification bar. |
| `Skeleton` | Loading placeholder (+ domain-specific skeletons in `ui/skeletons/`). |

### Domain Components

| Component | Module | Purpose |
|-----------|--------|---------|
| `ItemForm` | Itinerary | Shared create/edit form for items. Type-driven field visibility. |
| `InlineQuickAdd` | Itinerary | Compact inline item creation (closeout flow). |
| `FlightLookup` | Itinerary | AeroDataBox flight search integration. |
| `PlacesAutocomplete` | Itinerary | Google Places (New) API autocomplete. |
| `ParkingLotSection` | Itinerary | Phase-scoped unplanned items (suggestion cards). |
| `MoveItemSheet` | Itinerary | Bottom sheet for moving items between days. |
| `CloseoutDayCard` | Itinerary | Day card in closeout wizard. |
| `VoteButtons` | Collaboration | Love/Like/Flexible/Dislike vote controls. |
| `NotificationBell` | Collaboration | Unread notification indicator. |
| `ExpenseForm` | Money | Expense create/edit with split configuration. |
| `BudgetSummary` | Money | Per-category budget progress bars. |
| `SettleUpFlow` | Money | Debt settlement wizard. |
| `TripModeCard` | Trip Mode | Now/timeline item card for active trips. |
| `NowDivider` | Trip Mode | "Now" marker in today's timeline. |
| `ArchiveDaySection` | Portability | Day section for public archive view. |

### Shell Components

| Component | Purpose |
|-----------|---------|
| `AppShell` | Responsive layout wrapper. Detects mobile/desktop breakpoint. |
| `BottomNav` | Mobile bottom navigation (5 tabs planning, 4 tabs trip mode). Hides on input focus. |
| `SideRail` | Desktop left navigation (900px+). |
| `ContextRail` | Desktop right panel (1280px+). Contextual info per active section. |
| `DayNav` | Swipeable day navigation header. |
| `TripTabs` | Planning/Trip mode tab switcher. |
| `A2HSBanner` | Add-to-home-screen prompt. |

---

## Mode-Specific Chrome

### Planning Mode (default)

- **Accent:** moss (`#3e5a3a`)
- **Navigation:** 5 tabs — Itinerary, Money, Activity, Vault, More
- **Available:** All trip statuses

### Trip Mode (active trips)

- **Accent:** clay (`#a5593a`)
- **Navigation:** 4 tabs — Now, Today, Add, Vault
- **Available:** Only when trip status = active
- **Default:** Auto-selected for active trips

---

## Vote Iconography

| Vote | Weight | Icon |
|------|--------|------|
| Love | +2 | Heart (filled) |
| Like | +1 | Thumbs up |
| Flexible | 0 | Shrug / meh |
| Dislike | -2 | Thumbs down |

Score is never shown numerically. Items sort by aggregate vote score. UI shows avatar stacks per vote option.

---

## Interaction Patterns

- **Forms:** SvelteKit form actions + progressive enhancement. In-context error messages, not toasts.
- **Loading:** Skeleton UI where layout is known, not spinners.
- **Modals:** Bottom sheets on mobile (<400px), centered modals on tablet+.
- **Toasts:** Transient success messages only (via `toast.show()`).
- **Focus:** `2px solid moss` ring with `2px` offset on `:focus-visible`.
- **iOS:** 16px minimum font-size on inputs to prevent auto-zoom.

---

## Print

`print.css` (imported via `layout.css`): hides nav, FAB, bottom nav. Main content goes full-width.
