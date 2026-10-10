# #445 Desktop day page: rail Up next + mouse drag-to-plan

> svw:executing-plans, inline. Spec stories 26-30, 80, 81, 83, 84. No open question.

**Goal:** at >=1280px the context rail on a day page shows (a) Up next as mini day cards (date, day title, item count, gold `N to book`) and (b) the phase Ideas as a live drag source: drag with the mouse (no long press) onto the day timeline; valid targets highlight in the accent and say what they offer (`Drop to plan · 2h free · 4:30p to 6:30p`).

## Decisions
- Pure module `src/lib/itinerary/drag-to-plan.ts` (+ Vitest): `dropPrompt(gap)`, `planDropLabels(items)` (which slot = the timed item that closes a free gap, what label), `canPlanOnDay` (reuses `resolveDrop`), `upNextRow` / `dayHeadline` (day title = notes, else lead item, as the overview day card).
- The rail lives in AppShell, outside the page, so the day page's `DragDropTimeline` (owner of the dnd handlers) publishes a getter into `day-rail.svelte.ts` (same pattern as #446's `now-rail.svelte.ts`). Only the instance inside the desktop tree (`[data-shell=desktop]`) publishes, because AppShell renders the page twice.
- Rail Ideas reuse `ParkingLotSection` in dnd mode (#424 grouping, #425 pills, mouse immediate / touch long-press). Dragging a day item back onto the rail unschedules it (existing `push`). Same-zone drag changes nothing (existing).
- Drop-target highlight: while an idea that can be planned here is in flight, the timeline gets an accent outline + corner badge `Drop to plan` (absolute, no layout shift), and each free-time label becomes `Drop to plan · {gap}`.
- Up next data: day loader adds `daySummaries` (same key as overview) to merged page data; rail falls back to phase names when absent. Rail changes stay in the itinerary branch (#446's Now branch untouched).
- Hover: rail cards lift (`-translate-y-px` + shadow). Nothing hover-only.
- Keyboard path ("Add to a day") is #442, blocked-by, not built here.

## Steps
- [ ] drag-to-plan.ts + tests (red, green)
- [ ] day loader `daySummaries`; DayCard uses `dayHeadline`
- [ ] day-rail state; DragDropTimeline publish + `planDrop`
- [ ] DayTimeline highlight; FreeTimeLabel drop variant
- [ ] ContextRail: Up next cards + dnd Ideas
- [ ] E2E on desktop tree; CARD_CONTENT_SPEC; verify:visual 375/768/1280
