# #420 Day page timeline Implementation Plan

> **For agentic workers:** svw:executing-plans, inline. Steps are checkboxes.

**Goal:** Rebuild the planning day timeline: the Timeline Rail owns time; cards use head/meta/strip anatomy.

**Architecture:** Pure derivations in `src/lib/itinerary/card-anatomy.ts` (rail geometry, strip overflow, meta, Going bubbles, overlap pairs, free-time gaps, accessible name), unit-tested. Reusable components in `src/lib/itinerary/components/`: `RailStack`, `ItemCard`, `CardStrip`, `GoingBubbles`, `TimeSlotDivider`, `FreeTimeLabel`. `DayTimeline` composes them; dndzone wrapper contract (one `div[aria-label=title]` child per item) is unchanged.

**Tech Stack:** SvelteKit 5, Tailwind 4, Vitest, Playwright, `pnpm verify:visual`.

**Spec:** `docs/plans/2026-10-06-card-system/spec.md` (Timeline Rail geometry, Card anatomy, Colour, Overlap, Going, Accessibility); `docs/CARD_SYSTEM.md` D2 D5 D7 D8 D9 D10.

**Intent sources:** ADR-0011 (amended), ADR-0016; `CONTEXT.md`; `docs/CARD_CONTENT_SPEC.md`.

**Run:** `E2E_SLOT=1 PB_BIN=/Users/Scott/Waypoint/backend/pocketbase pnpm verify:visual '/trips/{slug}/days/{day1}' --widths 375,768`

## Global Constraints
- Rail column 48px + 8px to card; 5px rule-to-text, 4px text-to-segment, 4px segment-to-icon, >=3px side padding; disc 24 / glyph 16.
- Segment < 6px dropped; no line between cards; min height ~62px for timed cards.
- Time format `6:30p`; rail end-only label has no `by`.
- Colour: gold = Needs booking, red = overlap only when Going shared, else ink. No votes on planned cards. No time on card.
- 44px hit areas on new controls; "+ Me" chip untouched.

## Review Focus
- Overlap with nobody Going: ink, not red.
- Card with 0 timed labels (untimed): no rules, dashed icon only.
- End-only item: bottom label only, no `by`.
- Tight strip (375px) with all four entries: overflow ladder.
- Overlap partner title very long: truncated.

### Task 1: Pure derivations (TDD)
**Files:** Create `src/lib/itinerary/card-anatomy.ts`, `card-anatomy.test.ts`.
**Produces:** `railSegments(height, shape)`, `fitStrip(entries, available)`, `cardMeta(item)`, `goingBubbles(item, memberIds)`, `overlapPairs(items)`, `freeTimeGaps(items)`, `cardAccessibleName(...)`, `clockMinutes(t)`.
- [ ] Write tests for each (segments dropped <6px, ladder icon-then-drop, meta flight/note, overlap shared/not, gap >=60 and start-only resets, a11y name example).
- [ ] Run vitest: fails. Implement. Run: passes. Commit `feat(#420)`.

### Task 2: Components
**Files:** Create `RailStack`, `GoingBubbles`, `CardStrip`, `ItemCard`, `TimeSlotDivider`, `FreeTimeLabel`; modify `AssigneeStacks` (PersonBubble variant, `notGoing`), `DayTimeline`, day `+page.server.ts` (doc counts), delete `TimelineItemCard`.
- [ ] Build, `pnpm check`, commit.

### Task 3: Visual proof
- [ ] `verify:visual` days 1-6 at 375/768; Read PNGs; iterate. Commit.

### Task 4: E2E + docs
- [ ] `grep -rn` old labels in tests; `E2E_SLOT=1 pnpm test:e2e:clean`; amend `docs/CARD_CONTENT_SPEC.md` section 2; PR.
