# Plan — Phase calendar editor (#330, V2 of ADR-0021)

**Issue:** #330 · **Design:** Claude Design "calendar direction" handoff (README in the design bundle — high-fidelity spec) · **Engine:** ADR-0021 / #323 (shipped) · **Ceremony:** feature → plan (this) → build → e2e → PR → review.

## Decisions (RESOLVED — Scott, 2026-07-02)
1. **Mount = replace the phases page.** The calendar editor becomes the primary content of `/trips/[slug]/phases`.
2. **Live-persist on commit.** Every completed gesture (drag drop, split tap, rename blur/Enter) writes immediately via the existing engine — one write per deliberate edit, no draft, no "Save phases" button (it becomes "Done" = back). Rejected: batch-draft + save-on-leave (unreliable on mobile close; adds dirty-state machinery for a non-problem, since writes are per-gesture not per-pixel).

## Why this is low-risk
The design's state model is a **1:1 match** with the shipped engine — the editor is a new UI, **no model/migration work**:
- Design `boundaries[i]` (shared travel day) == phase `i+1`'s `start_date`. Phase spans are already derived by `retilePhases`.
- Gestures map straight onto existing pure validators + `applyRetile`:

| Design gesture | Engine call | Persist |
|---|---|---|
| Drag route handle to move a boundary | `validateMovePhaseStart(phaseId, newStart, tiled, tripStart, tripEnd)` → update phase `start_date` | `applyRetile` |
| Tap a normal day to split | `validateNewPhaseStart(start, tripStart, tripEnd, existingStarts)` → create phase "New phase" | `applyRetile` |
| Tap a name → rename | update phase `name` only | — (no retile) |
| Delete (phase-list row) | existing `?/delete` action (merge + re-home items) | `applyRetile` |

- **Palette is derived, not stored** — cycle `[moss, sky, gold, clay]` by phase order (ADR removed stored phase colors). No schema change.

## Component architecture
- **Replace** `src/routes/(app)/trips/[slug]/phases/+page.svelte` with the editor. **Preserve** the two non-editor concerns the current page carries: the **voting launch-deck** entry (`unratedTotal`/`launchPhaseId`) and the **orphan re-home** list (`orphans`) — relocate them BELOW the editor body (or into a collapsed section). The load already returns them; keep it.
- **New `PhaseCalendarEditor.svelte`** — the editor body in the handoff's order: hint line → phase-name pills → month header → weekday header → calendar grid → phase list rows → Done row.
- **New pure `phase-calendar.ts`** (Vitest) — given `startDate`, `totalDays`, and the tiled phases, produce the render model: weeks[], each cell `{ tripDay, date, phaseIndex, isTravelDay, isMonthFirst, monthTag, leading/trailingBlank }`, weekday-aligned (Monday-first default) with leading/trailing blanks. Keeps all date math out of the component and testable.
- **New route-arrow icon** — a two-way dashed travel arrow (viewBox `0 0 30 14`, per README §Route handle), added to the `StarIcon`/icon family; used on the handle and the travel-day divider rows.
- Reuse `Button`, `Card`, `Pill`, tokens (moss primary, clay = travel-day accent ONLY, tint fills by palette).

## Interactions
- **Drag (move boundary):** Pointer Events on the route handle (`touch-action:none` on grid+handle). On pointermove, `document.elementFromPoint` → read `data-day` on the cell under the pointer → set as the candidate boundary; update local state live (smooth) clamped to `[prevStart+1, nextStart-1]` (mirror `validateMovePhaseStart`). On **pointerup**, POST `?/moveStart` (progressive enhancement); `enhance` invalidates the load → server truth re-seeds. On validation fail, revert to server state. (Not svelte-dnd-action — this is a boundary scrub, not a list reorder.)
- **Split (tap a normal day):** POST `?/create` with `start_date = that day`, `name = "New phase"`; on success, open the new phase's name for inline rename.
- **Rename (tap a pill or list name):** inline text input (Fraunces, accent border); commit on Enter/blur → POST `?/rename`; Escape cancels; empty keeps prior name.
- Live-persist: every commit posts immediately; the calendar always reflects server truth after `enhance` invalidation.

## Server actions (`phases/+page.server.ts`)
- Keep `create` (= split) and `delete`.
- **Add `moveStart`** — `validateMovePhaseStart` → update the phase's `start_date` → `applyRetile`. (Consolidate from `phases/[phaseId]/+page.server.ts` if a move/rename action already lives there; the editor drives everything from the one page.)
- **Add `rename`** — update `name` only.
- All guard via the existing phase hooks (first-phase-pinned, delete-blocks-on-unplanned-items).

## Empty / first-run state
Trips always carry the auto-seed **"Phase 1"** (covers the whole trip), so there is never truly zero phases. Map the design's "empty first-run" to the **single-phase** state: the calendar shows one tint across all days; the editorial "Add your first phase" CTA splits it. The design's ghost-calendar empty state is largely vestigial here — confirm during build whether to show it at all (likely only if a trip somehow has no phase).

## SPEC reconciliation
- Phase mechanism section: the phase editor is now a **calendar grid with drag-to-move-boundary / tap-to-split / tap-to-rename** (replaces the start-only date-picker forms from #323; same tiling engine). Nav unchanged (`/phases`).

## Test plan
- **Vitest** — `phase-calendar.ts` grid model: weekday alignment (leading/trailing blanks), travel-day flagging (a day in `boundaries`), month tags, palette cycling, short (4d) and long (30d) trips.
- **e2e** (fresh :8097) — tap-to-split creates a phase and re-tiles; rename persists; delete merges. **Drag-to-move-boundary needs manual verification** (real Pointer-Event drag can't be faithfully automated — the #201/#234 / #324 scar); e2e will assert the `?/moveStart` action directly (POST a new start → tiling updates) to cover the *logic*, with the gesture itself dogfooded by Scott.
- `pnpm check` 0; `pnpm test:unit` green.

## Out of scope
Batch/draft save (rejected). Stored phase colors. Multi-month scroll beyond the natural grid. Reordering phases by anything other than start (order is derived).

## Risks / watch-items
1. **Touch-drag verification** — same limitation as #324; the drag gesture is dogfood-verified, the logic is e2e/unit-verified.
2. **Preserving the launch-deck + orphans** on the replaced page — don't drop them.
3. **elementFromPoint during drag** — the dragged handle must be `pointer-events:none` (or hit-test excludes it) so it doesn't shadow the day cell under the finger.
4. Live-persist reconciliation — optimistic local move must revert cleanly if the server rejects (clamp mirrors the validator, so rejections should be rare).
