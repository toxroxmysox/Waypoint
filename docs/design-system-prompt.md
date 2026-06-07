# Claude Design Prompt — Document the Waypoint Design System

**Goal:** Audit the *existing, shipped* Waypoint UI and produce one canonical design-system document that every future Claude Design prompt cites for consistency. You are **documenting reality, not redesigning.** Do not invent values, propose changes, or "improve" anything. If something is inconsistent in the live app, record the dominant pattern and flag the outlier in a "Drift" note — don't resolve it.

---

## What Waypoint is

A mobile-first PWA for planning group trips. Warm, editorial, cartographic feel — paper/ink with a four-point compass-star mark. Three contexts: **Planning Mode** (default, moss accent), **Trip Mode** (active travel, clay accent), **Archive** (public read-only). Core surfaces: trip list, day itinerary with time-slotted sections (Morning/Afternoon/Evening/Anytime), item detail, expenses + splitting, members, phases, settings, parking lot, closeout wizard.

Mobile-first: BottomNav < 768px, icon SideRail at ≥900px. Always design at 375px first.

---

## Sources of truth — read these, do not guess

Extract every value from the code and the running app. Where they disagree, the code wins; note the discrepancy.

| Source | What to pull from it |
|--------|----------------------|
| `src/routes/layout.css` (`@theme` block) | **Canonical tokens** — colors, fonts, radii, shadows, z-index. This is THE source of truth. Transcribe exact hex/px values. |
| `src/lib/ui/*.svelte` | Primitive components: `Button`, `Card`, `Pill`, `Avatar`, `NavBar`, `BottomSheet`, `SectionH`, `PhaseChip`, `SubTabs`, `Skeleton`, `Toast`, `TypeIcon`, `StarIcons`. Document each one's real props (variants, sizes), not idealized ones. |
| `src/lib/shell/components/*.svelte` | Layout/navigation shell: `AppShell`, `BottomNav`, `SideRail`, `FAB`, `TripTabs`, `DayNav`, `ContextRail`, `ModePill`, `A2HSBanner`. |
| `src/app.html` | Fonts loaded (Inter, Fraunces), theme-color, PWA meta. |
| `static/brand/` | Logo + mark assets (star-mark, lockups, app icons, sparkle, star-stamp). |
| The running app (Preview MCP) | Navigate every core route at **375px**, then 900px and 1280px. Screenshot. `preview_inspect` real computed values for type scale, spacing rhythm, component states. Spacing has **no custom tokens** — it's the Tailwind 8pt scale applied via utilities; document the scale you actually observe. |
| `docs/SPEC.md` §2 + design-decision log | Locked decisions (palette adoption, fonts, accent-per-mode rule, accessibility target WCAG 2.1 AA / contrast ≥4.5:1). |

Tooling: Tailwind v4 with tokens in the `@theme` block (utilities like `bg-moss`, `text-ink-muted` map to tokens). Svelte 5 runes (`$props`, `$derived`, snippets). Don't assume shadcn/Melt — verify what's actually used.

---

## Output

Overwrite `docs/design-system.md` with the canonical reference. Keep the existing **Branding & Logo** section (it's accurate); rebuild everything else from the audit. Structure:

1. **Foundations**
   - **Color** — every token: name, hex, semantic role, where it's used, and which contexts/accents own it (moss=Planning, clay=Trip). Note tint pairs (`*-tint`) and the error scale. Include a real contrast note for text-on-paper combos.
   - **Typography** — the three families and their jobs (Fraunces=display, Inter=UI/body, JetBrains Mono=codes/times/money). Document the actual size/weight/line-height scale observed in the app, with example usages.
   - **Spacing & layout** — the 8pt rhythm, container widths/max-widths per breakpoint, the breakpoint tokens.
   - **Radii, shadows, z-index** — transcribe the token ladders exactly; say what elevation each shadow is for (card / elevated / dropdown / overlay / modal).
   - **Iconography** — stroke style, stroke width, sizing conventions.

2. **Components** — one entry per primitive in `src/lib/ui/`. For each: purpose, variants, sizes, states (hover/disabled/loading/focus), tokens it consumes, and a usage rule. Use `Button.svelte` as the format template (variants: primary/moss/ghost/outline; sizes: sm/md/lg).

3. **Patterns** — codify the conventions already in CLAUDE.md and in use: forms (SvelteKit actions + progressive enhancement), loading (skeletons not spinners), errors (in-context validation vs. toasts), modals (bottom sheet on mobile, centered on tablet+), mode-accent rule, focus-visible treatment.

4. **Accessibility** — the standing rules: WCAG 2.1 AA, ≥4.5:1 contrast, visible focus rings, ≥16px inputs on mobile (iOS zoom guard), semantic HTML/ARIA.

5. **Drift log** — any inconsistencies found between code, docs, and the live app, so they're tracked rather than silently absorbed.

6. **Grounding block for future prompts** — a copy-pasteable ~15-line context preamble (palette + fonts + accent rule + component inventory + key constraints) that any future Claude Design prompt can lead with so its output matches the app. This is the whole point of the document.

Keep it terse and reference-grade — tables over prose. Every value must be traceable to a source file. End with a one-line pointer: source of truth for tokens is `src/routes/layout.css` `@theme`; this doc is the human-readable mirror.
