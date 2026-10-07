# #419 Card primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use svw:executing-plans (small plans) or svw:subagent-driven-development (large plans) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the shared card primitives every card shape builds on (time-shape classifier, time grammar, monochrome type icon, neutral initials bubble), retune gold-deep, and delete the orphaned Today components, with no layout change.

**Architecture:** Two pure additions at the existing seams: `timeShape()` in `src/lib/itinerary/timeline.ts` (the one classifier) and the text/rail grammar in `src/lib/shell/format.ts`, which calls it. Two new presentational primitives in `src/lib/ui/` (`MonoTypeIcon`, `PersonBubble`) that nothing renders yet; the legacy coloured `TypeIcon` keeps its exact output but takes its glyph paths from a new shared `TypeGlyph`. Downstream tickets (#420, #426, #428, #433, …) adopt the primitives on their surfaces.

**Tech Stack:** SvelteKit + Svelte 5 runes, Tailwind v4 `@theme` tokens, Vitest.

**Spec:** `docs/plans/2026-10-06-card-system/spec.md` (§Time grammar, §Colour, §Going, §Timeline Rail geometry "The icon node"); ticket #419.

**Intent sources:** `docs/CARD_SYSTEM.md` D1, D5, D9, D10, D11, §2 finding 13; `docs/adr/0011-item-card-avatars-denote-assignees.md` (2026-10-06 amendment); glossary `CONTEXT.md` (Anchor Time, Assignment, Today); `docs/design-system.md`. Visual reference: Scott's before/after page (https://claude.ai/artifact/1KG8VuJTLLZ7vzCXWA3mG7), whose mock code fixes the node, Hero icon and bubble treatments.

**Run:** `E2E_SLOT=1 pnpm verify:visual '/trips/{slug}' '/trips/{slug}/days/{day1}' --widths 375,768`. The primitives have no host surface yet, so they are shown on a scratch route (`src/routes/dev-primitives/+page.svelte`, never committed) screenshotted the same way.

## Global Constraints

- Clock format: `6:30p`, `10:30a`. The colon stays; the space and the "m" go.
- Text forms: start only `9:30p`; range `10:00a–12:00p` (en dash, no spaces); deadline `by 4:30p`; untimed omitted; flights `2:05p → 4:20p`. In text, an end time never appears without `by`.
- Rail: start on the top edge, end on the bottom edge, an end-only item shows a plain end label with **no `by`**, untimed shows no time.
- Date prefix: `Thu Oct 1 · 6:30p` (no comma; ` · ` separator). Calendar-day dates format with `timeZone: 'UTC'`.
- Icon sizes: 16px bare glyph; 24px disc with 16px glyph; 40px disc with 26px glyph. Variants: dashed (untimed), accent-filled (Hero).
- Node: monochrome, ink-soft glyph on surface-2 with a `line` ring; dashed when untimed.
- Bubble: neutral initials; not going = diagonal strike, **no opacity**, letter ≥ 4.5:1; accessible name `Kevin, not going`.
- gold-deep `#8a6f24` → `#745a1c` (5.81:1 on gold-tint, 6.52:1 on white).
- No layout change. The only visible changes are gold-deep and the removed dead code. No migrations.
- Dynamic styling uses inline `style` with CSS vars, never interpolated Tailwind class names.

## Review Focus

- Midnight and noon: `00:15` must read `12:15a`, `12:00` must read `12:00p` (Task 2 test).
- Stored shapes: `'YYYY-MM-DD HH:MM:SS.sssZ'`, ISO `'…THH:MM…'` and bare `'HH:MM'` all format the same wall clock, never shifted by the machine zone (Task 2 test, plus a `TZ=America/Detroit` run).
- Date prefix west of UTC: `'2026-10-01 00:00:00.000Z'` must read `Thu Oct 1`, not `Wed Sep 30` (Task 2 test under `TZ=America/Detroit`).
- An end-only item never loses `by` in text, even with a date prefix or as a flight (Task 2 tests).
- An untimed item with a date prefix reads as the date alone, with no dangling ` · ` (Task 2 test).

## Rulings

- Ruling: the initials bubble ships as a new neutral `PersonBubble`; existing `Avatar` / `AssigneeStacks` call sites are not swapped — "no layout change" and spec Out of Scope "colour outside Item Cards"; the card tickets (#420, #428, #433) retire the coloured fallback on cards when they adopt it — cost if wrong: one class swap in `Avatar.svelte` plus a visual pass over its ~19 importers.
- Ruling: the monochrome icon is a new `MonoTypeIcon` beside the legacy coloured `TypeIcon`; both draw from one extracted `TypeGlyph`, and `TypeIcon`'s DOM output is unchanged — keeps one glyph source without a visible change — cost if wrong: none visible; the legacy component is deleted when its last coloured caller migrates.
- Ruling: glyph shapes stay as built (the mock draws Lucide-style glyphs and a car for transportation) — no decision covers glyph shapes, only their colour — cost if wrong: swap paths in `TypeGlyph` (also changes the legacy icon).
- Ruling: the plain disc ring is the `line` token (spec text), not the mock's untokenised `#cfc7b8`; the dashed ring is 1.5px dashed ink-muted with an ink-muted glyph on surface (the mock), because a dashed `line` ring is 1.22:1 and invisible — cost if wrong: one value each.
- Ruling: `PersonBubble` renders initials only, never a photo — spec says "neutral initials bubbles" — cost if wrong: add an `img` prop; members with photos see initials on cards meanwhile.
- Ruling: the Now feed adopts `timeShape` in #431, not here; the rail (`isAnchored`) and the text forms adopt it now — adopting it in `now-state.ts` is the #392 bucket change itself — cost if wrong: #431 rewrites those predicates anyway.
- Ruling: legacy `formatTime` / `formatTimeRange` (`6:30 PM`) stay; surfaces switch to the new grammar in their own tickets — switching here is a visible change — cost if wrong: none; dead once the last caller moves.
- Ruling: no `outlined` (Earlier today) node variant — the AC names only dashed and filled; #429 owns Earlier today and extends the `variant` union — cost if wrong: #429 adds one branch.
- Ruling: the bubble's accessible name is built inline in the component, not as a helper in `assignment.ts` — #402 edits that file in parallel and the brief forbids new seams; proven by the accessibility tree on the scratch route — cost if wrong: a 3-line helper plus a test.
- Ruling: `railTimeLabels()` is included — the rail rules are part of §Time grammar and this makes "no `by` on the rail" a tested rule — cost if wrong: #420 deletes a six-line function.
- Ruling: untimed + date prefix renders the date alone (`Thu Oct 1`) — spec silent; the goal row and swipe face read a date alone — cost if wrong: one branch.
- Ruling: `docs/design-system.md` also lists the three new primitives; the sky row is untouched (#423 retires sky as the multi-day colour) — cost if wrong: doc lines.

---

### Task 1: The time-shape classifier

**Files:**
- Modify: `src/lib/itinerary/timeline.ts` (add the type, interface and function above `itemAnchorTime`; re-express `isAnchored`)
- Test: `src/lib/itinerary/timeline.test.ts` (new `describe('timeShape')`)

**Interfaces:**
- Produces:
  - `export type TimeShape = 'untimed' | 'start-only' | 'range' | 'end-only';`
  - `export interface TimeFields { start_time?: string; end_time?: string }`
  - `export function timeShape(item: TimeFields): TimeShape` — reads only the two time fields (an empty string counts as absent); `end_date` is ignored (Span text is #423's).
  - `isAnchored(item)` keeps its signature and now returns `timeShape(item) !== 'untimed'`.

- [ ] **Step 1: Write the failing test** — `describe('timeShape — one classifier for the rail, the text forms and the Now feed (#419)')`:
  - `{start_time:'2026-10-01 18:30:00.000Z', end_time:'2026-10-01 20:30:00.000Z'}` → `'range'`
  - `{start_time:'2026-10-01 21:30:00.000Z', end_time:''}` → `'start-only'`
  - `{start_time:'', end_time:'2026-10-01 16:30:00.000Z'}` → `'end-only'`
  - `{start_time:'', end_time:''}` and `{}` → `'untimed'`
  - `isAnchored` agrees: true for range / start-only / end-only, false for untimed (one `it` over the four shapes).
- [ ] **Step 2:** `pnpm vitest run src/lib/itinerary/timeline.test.ts` → FAIL (`timeShape` is not exported).
- [ ] **Step 3:** Implement `timeShape` and re-express `isAnchored` through it.
- [ ] **Step 4:** Same command → PASS, existing `buildTimeline` / `isAnchored` cases still green.
- [ ] **Step 5:** Commit `feat(#419): timeShape — the one time-shape classifier`.

### Task 2: The time grammar (clock, text forms, rail labels, date prefix)

**Files:**
- Modify: `src/lib/shell/format.ts` (append; import `timeShape`, `TimeFields` from `$lib/itinerary/timeline`)
- Test: `src/lib/shell/format.test.ts`

**Interfaces:**
- Consumes: `timeShape(item: TimeFields): TimeShape` (Task 1).
- Produces:
  - `export function formatClock(t: string): string` — `'6:30p'`; `''` for `''`. Same input parsing as `formatTime` (date part optional, `T` or space separator, wall clock taken from the string, no `Date`).
  - `export function formatDayDate(date: string): string` — `'Thu Oct 1'` from `'YYYY-MM-DD'` or a stored `'YYYY-MM-DD 00:00:00.000Z'` / ISO string; `''` for `''`. Uses `timeZone: 'UTC'`; joins weekday, month, day with single spaces (Intl's `en-US` output has a comma, so build from parts).
  - `export function formatTimeText(item: TimeFields & { type?: string }, opts?: { date?: string }): string` — text form by `timeShape`; a `type === 'flight'` range uses ` → `; with `opts.date`, prefix `formatDayDate(date)` and ` · ` (date alone when untimed).
  - `export function railTimeLabels(item: TimeFields): { top: string; bottom: string }` — `top` = start clock (range, start-only), `bottom` = end clock (range, end-only), never `by`; `''` where absent.

- [ ] **Step 1: Write the failing tests** — `describe('time grammar (#419, D5/D11)')`:
  - `formatClock`: `'2026-10-01 18:30:00.000Z'` → `'6:30p'`; `'2026-10-01 10:30:00.000Z'` → `'10:30a'`; `'12:00'` → `'12:00p'`; `'2026-10-01 00:15:00.000Z'` → `'12:15a'`; `'2026-10-01T09:05:00Z'` → `'9:05a'`; `''` → `''`.
  - `formatTimeText`: start-only → `'9:30p'`; range 10:00–12:00 → `'10:00a–12:00p'`; end-only 16:30 → `'by 4:30p'`; untimed → `''`; flight range 14:05→16:20 → `'2:05p → 4:20p'`; flight start-only → `'2:05p'`; flight end-only → `'by 4:20p'`.
  - Date prefix with `{ date: '2026-10-01 00:00:00.000Z' }`: start-only 18:30 → `'Thu Oct 1 · 6:30p'`; range → `'Thu Oct 1 · 10:00a–12:00p'`; end-only → `'Thu Oct 1 · by 4:30p'`; untimed → `'Thu Oct 1'`; `{ date: '2026-10-04' }` on a flight range → `'Sun Oct 4 · 2:05p → 4:20p'`.
  - `formatDayDate('2026-10-01')` → `'Thu Oct 1'`; `''` → `''`.
  - `railTimeLabels`: range → `{ top: '6:30p', bottom: '8:30p' }`; start-only → `{ top: '9:30p', bottom: '' }`; end-only → `{ top: '', bottom: '4:30p' }` (no `by`); untimed → `{ top: '', bottom: '' }`.
- [ ] **Step 2:** `pnpm vitest run src/lib/shell/format.test.ts` → FAIL (exports missing).
- [ ] **Step 3:** Implement the four functions.
- [ ] **Step 4:** Same command → PASS; then `TZ=America/Detroit pnpm vitest run src/lib/shell/format.test.ts` → PASS (date prefix not shifted a day early).
- [ ] **Step 5:** Commit `feat(#419): the time grammar — 6:30p, text forms, rail labels, date prefix`.

### Task 3: Monochrome type icon

**Files:**
- Create: `src/lib/ui/TypeGlyph.svelte` (the seven glyph `<svg>` branches moved verbatim out of `TypeIcon.svelte`)
- Modify: `src/lib/ui/TypeIcon.svelte` (render `<TypeGlyph type={type} size={glyphSize} />` inside its span; nothing else changes)
- Create: `src/lib/ui/MonoTypeIcon.svelte`

**Interfaces:**
- Produces:
  - `TypeGlyph.svelte` props `{ type: ItemType; size: number }` — bare `<svg>` in `currentColor`, `aria-hidden="true"`.
  - `MonoTypeIcon.svelte` props `{ type: ItemType; size: 16 | 24 | 40; variant?: 'plain' | 'dashed' | 'filled'; label?: string }`
    - `size 16`: the bare 16px glyph in ink-soft (Row, group heading); `variant` ignored.
    - `size 24`: 24px disc, 16px glyph (rail node, Span). `size 40`: 40px disc, 26px glyph (Hero). Box sizes include the border.
    - `plain`: ink-soft glyph, surface-2 fill, 1px `line` ring. `dashed` (untimed): ink-muted glyph, surface fill, 1.5px dashed ink-muted ring. `filled` (Hero, ongoing): `--color-accent` fill, surface-colour glyph, no visible ring.
    - `label` set → `role="img"` + `aria-label`; omitted → `aria-hidden="true"` (the card's accessible name carries the type).

- [ ] **Step 1:** Extract `TypeGlyph`, point `TypeIcon` at it, add `MonoTypeIcon`. No unit test: pure rendering, proven by screenshot (brief §2 TDD scope).
- [ ] **Step 2:** `pnpm check` → 0 errors.
- [ ] **Step 3:** Commit `feat(#419): MonoTypeIcon at 16/24/40 with dashed and filled; TypeGlyph shared with TypeIcon`.

### Task 4: Neutral initials bubble

**Files:**
- Create: `src/lib/ui/PersonBubble.svelte`

**Interfaces:**
- Produces: `PersonBubble.svelte` props `{ name: string; initial?: string; notGoing?: boolean; size?: number }` (default `size` 20; `initial` defaults to the first letter of `name`, upper-cased).
  - Going: surface-2 fill, ink-soft letter (8.36:1), 1px inset `line` ring, 2px surface border so stacked bubbles separate.
  - Not going: same bubble, ink-muted letter (5.71:1), a 1.5px ink-soft diagonal strike (−45°) across it; never opacity.
  - `role="img"`, `aria-label` and `title` = `name` or `` `${name}, not going` ``. Letter ~0.55 × size, weight 600.
  - Stacking, overlap margins, max 3 and `+n` belong to the strip (#420), not the bubble.

- [ ] **Step 1:** Add `PersonBubble`. No unit test (rendering; accessible name checked on the scratch route in Task 7).
- [ ] **Step 2:** `pnpm check` → 0 errors.
- [ ] **Step 3:** Commit `feat(#419): PersonBubble — neutral initials, struck not-going variant`.

### Task 5: gold-deep token

**Files:**
- Modify: `src/routes/layout.css:51` → `--color-gold-deep: #745a1c;`
- Modify: `docs/design-system.md` — gold-deep row to `#745a1c` with its ratios and "retuned from `#8a6f24`, D10"; add `MonoTypeIcon`, `TypeGlyph` and `PersonBubble` rows to the Primitives table, and note `TypeIcon` as the legacy coloured icon.

- [ ] **Step 1:** Edit both files.
- [ ] **Step 2:** `git grep -n 8a6f24 -- src docs/design-system.md` → no hits.
- [ ] **Step 3:** Commit `style(#419): retune gold-deep to #745a1c (D10, finding 13)`.

### Task 6: Delete the orphaned Today components

**Files:**
- Delete: `src/lib/trip-mode/components/TodayItemCard.svelte`, `src/lib/trip-mode/components/TodayTimeline.svelte`
- Modify: `src/routes/(app)/trips/[slug]/now/+page.svelte` (the auto-scroll comment that cites `TodayTimeline`)
- Modify: `CONTEXT.md` (Today entry: "orphaned code" → deleted in #419); `docs/CARD_SYSTEM.md` §1 Dead code (note the deletion)

- [ ] **Step 1: Prove zero importers** — `git grep -n "TodayItemCard\|TodayTimeline" -- src tests` → the only hits are `TodayTimeline.svelte` importing `TodayItemCard` and the Now page comment. Save the output for the report.
- [ ] **Step 2:** `git rm` both files; update the comment and the two docs.
- [ ] **Step 3:** `git grep -n "TodayItemCard\|TodayTimeline" -- src tests` → no hits; `pnpm check` → 0 errors.
- [ ] **Step 4:** Commit `chore(#419): delete the orphaned TodayItemCard and TodayTimeline`.

### Task 7: Verification

- [ ] `pnpm check` → 0 errors; `pnpm test:unit --run` → all pass (1099 + the new cases).
- [ ] `E2E_SLOT=1 pnpm verify:visual '/trips/{slug}' '/trips/{slug}/days/{day1}' --widths 375,768`; read every shot: nothing moved; only gold-deep text darkened.
- [ ] Scratch route `src/routes/dev-primitives/+page.svelte` (not committed) rendering every `MonoTypeIcon` size × variant and going / not-going bubbles; screenshot at 375; read the accessibility tree for `Kevin, not going`; delete the route.
- [ ] `E2E_SLOT=1 pnpm test:e2e:clean` (TypeIcon's internals changed on nearly every page).
- [ ] PR body with "Interfaces for later tickets" listing every Produces block above verbatim.
