# Claude Design Prompt — Waypoint v2 Visual Design

I need visual designs for the v2 UI/UX updates to Waypoint, a self-hosted trip planning PWA. The app is feature-complete (6 milestones shipped) and this pass is purely usability, polish, and design quality. I have a full audit report with 53 findings organized into 13 work packages — you're handling the 10 items that need visual design judgment, not the ~30 that are pure code-level fixes (accessibility attributes, CSS token values, HTML performance attributes).

I'm attaching 14 screenshots of the current app state so you can see exactly what you're working with.

---

## What Waypoint is

A mobile-first PWA for planning group trips. Three modes: Planning (default), Trip Mode (active travel, clay accent), Archive (public read-only). Core views: trip list, day itinerary with time-slotted sections (Morning/Afternoon/Evening/Anytime), item details, expenses with splitting, members, phases, settings, parking lot, closeout wizard.

---

## Current design system

**Palette:**
- paper `#F6F2EA`, surface `#FFFFFF`, surface-2 `#FBF8F2`
- ink `#1C1B18`, ink-soft `#4C4A44`, ink-muted `#8A847A` (PROBLEM: fails WCAG AA at 3.31:1 on paper)
- line `#E2DCD0`
- moss `#3E5A3A`, moss-soft `#6F8B6A`, moss-tint `#E8EFE3`
- clay `#A5593A`, clay-tint `#F0E0D6`
- gold `#C89B3C`, gold-tint `#FBF1DC`
- sky `#3B6BA5`, sky-tint `#E6EEF8`
- error `#B33A3A` (exists but underused — error banners currently use clay instead)

**Fonts:** Fraunces 600 (display/headings — but currently missing from NavBar h1), Inter 400/500/600 (UI/body), JetBrains Mono (monospace)

**Radii:** 6 / 10 / 16 / 22px

**Shadows:** Only 2 levels defined:
- card: `0 1px 2px rgba(28,27,24, 0.03)` — barely visible
- card-strong: `0 1px 0 rgba(28,27,24, 0.04), 0 8px 24px rgba(28,27,24, 0.06)`
- PROBLEM: No elevation levels for FABs, modals, dropdowns, bottom sheets, overlays

**Spacing:** 8pt grid. Icons are inline SVGs, stroke-based, 1.75-2.25 stroke width.

**Responsive breakpoints:**
- Mobile (<768px): BottomNav (4 items: Itinerary, Money, Members, More), full-width content
- md-desktop (900px): 72px icon-only SideRail replaces BottomNav, content centered at max-w-lg (512px) — too narrow, bumping to max-w-2xl (672px)
- lg-desktop (1280px): Currently identical to 900px. Needs 3-pane layout.

---

## What I need designed (10 items)

### 1. Three-pane desktop layout (1280px+)

**Current state:** At wide desktop, the 72px SideRail sits left with icon-only nav (W logo, calendar, dollar, people, dots). Content is centered at 512px with 55%+ of the screen wasted. No right panel. No trip name visible in the rail.

**Design needed:**
- **Left: Expanded SideRail (240px)** — Trip name below "W" logo, full text nav labels (not just icons), phase list with color dots and date ranges, active phase highlighted. At md-desktop (900-1279px), keep the current 72px icon-only rail but add truncated trip name with tooltip.
- **Center: Main content** — fills remaining width, max-w-2xl (672px), centered in the available space.
- **Right: ContextRail (320px)** — contextual detail panel that changes by route:
  - Itinerary → item preview card for selected/hovered item, or day summary stats
  - Expenses → spending summary, budget vs actual, top categories
  - Members → role overview, recent activity
  - More → empty or collapsed

**Show it populated with realistic trip data** (a "Spain 2025" trip with phases like "Barcelona", "Seville", items in the day view, expenses). Show all three panes working together.

**Deliverable:** Full-width mockup at 1440px. Show the itinerary route and the expenses route as two separate compositions.

---

### 2. Toast / success feedback component

**Current state:** No success feedback anywhere in the app. You create an item, save settings, invite a member — nothing confirms it worked. The form just clears or navigates away silently.

**Design needed:**
- Three variants: success (moss-tint background, moss text/icon), error (error tint, error text), info (sky-tint, sky text)
- Auto-dismiss timing: 3s (success), 5s (error), 4s (info)
- Mobile positioning: horizontally centered, floating above BottomNav (account for iOS safe area). The BottomNav is ~56px + safe area inset.
- Desktop positioning: top-right of content area, below NavBar
- Animation: slide-in from bottom on mobile, slide-in from right on desktop. Exit at ~60% of entrance duration.
- Max 1 visible at a time
- Should feel like a gentle confirmation, not an alert. Compact — icon + short text + optional dismiss X.
- Must not overlap the FAB (dark circle, bottom-right on mobile)

**Deliverable:** All three variants in both mobile and desktop positions. Show one in context on the day view after adding an item ("Item added to Thursday, May 21").

---

### 3. Skeleton loading screens

**Current state:** No loading states. Pages flash from blank to content.

**Design needed:** Skeletons for four list views, matching the actual content layout dimensions from the screenshots:
- **Trip list card:** Left border accent bar, title line, date range line, location line, badge area. Matching the ~80px tall card with left colored border.
- **Day view:** Date heading, section labels (MORNING, AFTERNOON, etc.), item cards within each section (icon circle + title line + subtitle line). Match the ~60px tall item cards with left icon circle.
- **Expense row:** Category icon, title + payer/date lines, amount right-aligned. Match the ~56px row height.
- **Member card:** Avatar area, name/email lines, role badge. Match the current member list layout.

**Palette:** Use paper `#F6F2EA` as the base and surface `#FFFFFF` or surface-2 `#FBF8F2` for the shimmer highlight — NOT generic gray. Should feel like content materializing out of the paper.

**Shimmer:** Subtle left-to-right gradient sweep. Respect `prefers-reduced-motion` (static placeholder, no animation).

**Deliverable:** All four skeleton types. Show the trip list skeleton and day view skeleton side-by-side with their real content equivalents so I can verify dimensional accuracy.

---

### 4. Page transition motion language

**Current state:** No transitions. Pages swap instantly — feels static and disorienting, especially navigating between days (day 6 to day 7 looks identical except content changes).

**Design needed:** Define three transition types:
- **Peer navigation** (day-to-day, tab-to-tab): Horizontal slide. Going forward = content slides left, new content enters from right. Reverse for backward. 200-250ms.
- **Drill-down** (list-to-detail, trip card to trip overview): Vertical slide-up. Detail view slides up from bottom over the list. Back = slides down. 200-300ms.
- **Tab switch** (Itinerary/Money/Members/More): Crossfade. 150-200ms.

**Motion feel:** Confident and grounded, not bouncy. Ease-out for entering elements (decelerate to rest), ease-in for exiting (accelerate away). Think weighted paper sliding on a desk, not rubber balls.

**Deliverable:** Storyboard or transition diagram showing each type with timing curves. If you can show before/during/after frames for the day-to-day slide, that would be ideal — it's the most frequent transition in the app.

---

### 5. Elevation / shadow token scale

**Current state:** Only 2 shadow levels (card and card-strong). The card shadow is barely visible — cards rely on white background against paper for distinction. No differentiation between a card resting on the page, a dropdown floating above it, a modal above that, or a bottom sheet above everything.

**Design needed:** A 5-level elevation scale that fits the warm, organic palette:
1. **card** (resting) — the current subtle level, for content cards on paper
2. **elevated** — for FABs and sticky headers. Noticeably above the page but not dramatic.
3. **dropdown** — for dropdown menus, autocomplete panels. Clear floating-above-content feel.
4. **overlay** — for bottom sheets. Strong elevation, should feel like a physical sheet laid on top.
5. **modal** — highest level, for centered modals. Definitive "above everything" treatment.

**Constraint:** Shadows must use the ink color `rgba(28,27,24, ...)` not pure black. Should feel like natural shadows on warm paper, not digital drop-shadows.

**Deliverable:** Show all 5 levels on a paper background, stacked to demonstrate the progression. Then show the FAB with level 2, a dropdown with level 3, and a bottom sheet with level 4 in context.

---

### 6. ink-muted color refinement

**Current state:** `#8A847A` at 3.31:1 contrast on paper `#F6F2EA`. Used in 176 places across the app: metadata text, timestamps ("May 16 - May 29, 2026"), subtitles (NavBar trip location "Chengdu, China"), empty states ("Nothing scheduled."), section counters, attribution text. It's the workhorse secondary text color.

**Design needed:** A replacement value that:
- Hits 4.5:1 minimum on paper (AA compliance). Ideally ~5:1 to give breathing room.
- Still reads as "secondary/muted" — clearly subordinate to ink `#1C1B18` and ink-soft `#4C4A44`.
- Stays warm (matching the paper/ink warm undertone), not cool gray.
- Candidate range: `#6B665C` (4.5:1) to `#5C574E` (5.5:1). Pick the sweet spot.

**Show it in context across:**
- NavBar subtitle ("Chengdu, China" below the page title)
- Trip card metadata (date range, location)
- Day view "Nothing scheduled." empty state
- Expense row "You paid - May 23" subtitle
- Section labels (MORNING, AFTERNOON, etc. — these are currently `ink-muted` with letter-spacing)
- Phase date ranges in the overview

**Deliverable:** Side-by-side comparison: current `#8A847A` vs recommended value, shown on the same screens. I need to see whether the new value still feels "muted" or starts competing with ink-soft.

---

### 7. Error state visual redesign

**Current state:** Error banners use `text-clay` + `bg-clay/10` + `border-clay/30`. Clay is the Trip Mode accent color (#A5593A), not an error signal. This creates semantic confusion — the same color means "active trip" in one context and "something went wrong" in another.

**Design needed:** Error treatment using the dedicated error token `#B33A3A`:
- Error banner: `bg-error/10` + `border-error/30` + `text-error` (or a darker error variant for text)
- Inline field error: red text below the field, icon optional
- Destructive button: the "Delete" button currently has `border-error text-error` which is correct — keep this.

**Also show:** The closeout wizard currently uses off-brand `green-50`/`amber-50` (Tailwind defaults, not design tokens). Replace with `moss-tint`/`moss` for positive states and `gold-tint`/`gold` for warning states. Show before/after.

**Deliverable:** Error banner in context on a form page. Inline field error on the invite form (invalid email). Closeout wizard status indicators with the corrected token colors.

---

### 8. Button loading state

**Current state:** No loading indication on any button. Double-submit is possible on every form. The primary button style is moss-filled with white text (visible on the "Send invite" button in screenshots).

**Design needed:**
- Loading state for the primary (moss-filled) button: spinner replaces or sits beside label text. Button stays the same size. Reduced opacity or desaturated to signal non-interactive. `pointer-events-none`.
- Spinner: 16px, uses `currentColor` (white on filled buttons, moss on outline buttons). Simple rotating ring, not a complex animation.
- Show the transition: default state → loading state → (implicitly, the page navigates or toast confirms)

**Deliverable:** Primary button and outline button, each in default and loading states. Show the "Send invite" and "Save" buttons specifically.

---

### 9. NavBar with Fraunces + touch target sizing

**Current state from screenshots:**
- NavBar h1 uses Inter (the body font), not Fraunces (the display font). "Thu, May 21" and "Group Dinner" and "Members" are all in Inter. This flattens the typographic hierarchy — the page title looks like body text.
- The back chevron (`<`) is ~36px touch target, needs 44px minimum.
- NavBar subtitle (trip name: "Chengdu for ILS") is 12px in ink-muted — hard to read.

**Design needed:**
- NavBar with Fraunces on the h1 at `text-lg` (18px). Show it on: day view ("Thu, May 21"), item detail ("Group Dinner"), section pages ("Members", "Expenses").
- Back button at 44px hit area (can be visually smaller with expanded touch padding).
- Subtitle bumped to 13px minimum. Will benefit from the ink-muted darkening in item 6.

**Deliverable:** NavBar redesign showing 3-4 different page contexts. Before/after comparison with current Inter h1 vs Fraunces h1.

---

### 10. Card press feedback + phase color accessibility

**Current state:**
- Item cards in the day view have `active:scale-[0.997]` — a 0.3% scale that's imperceptible. Pressing a card gives no visual feedback.
- Phase indicators are color-only dots (gold circles for "ILS" phase, for example). A color-blind user can't distinguish phases.

**Design needed:**
- Card press: `active:scale-[0.98]` (2% — visible but not dramatic) and/or a subtle background tint shift on `:active`. Should feel like pressing a physical card down slightly.
- Phase dots: Add a text label or small icon/pattern alongside the color dot so meaning isn't conveyed by color alone. Show this on the day view item cards and on the overview phase list.

**Deliverable:** Card with default and pressed states side-by-side. Phase indicators with the accessible treatment in the day view context.

---

## Style direction

The app should feel like a well-worn travel journal — warm, tactile, organic. Not clinical or corporate. Fraunces gives it personality; Inter keeps it readable. The paper background should feel like actual paper, not just off-white. Interactions should feel physical — things slide, settle, have weight. No bouncy or playful animations; think confident and grounded.

---

## Constraints

- Mobile-first, always. Desktop is a nice-to-have; mobile is the primary experience.
- No dark mode (explicitly deprioritized)
- No notifications UI redesign
- Keep the existing palette — refine, don't replace
- Implementation is SvelteKit + Tailwind CSS v4 (@theme tokens), so designs should map cleanly to utility classes and CSS custom properties
- Shadows must use warm ink-based rgba, not pure black

---

## Deliverables summary

| # | Item | What I need |
|---|------|-------------|
| 1 | 3-pane layout | Full-width mockup at 1440px, itinerary + expenses routes |
| 2 | Toast component | All 3 variants, mobile + desktop positions, one in context |
| 3 | Skeleton screens | 4 skeleton types + side-by-side with real content |
| 4 | Page transitions | Storyboard with timing/easing for 3 transition types |
| 5 | Shadow scale | 5 levels on paper + in-context examples |
| 6 | ink-muted color | Before/after on 6 screen contexts |
| 7 | Error states | Banner, inline error, closeout corrections |
| 8 | Button loading | Primary + outline in default/loading states |
| 9 | NavBar redesign | 3-4 pages with Fraunces h1, before/after |
| 10 | Card press + phase dots | Pressed state + accessible phase indicators |
