# #429 Trip Mode lists on the rail Implementation Plan

> **For agentic workers:** Use svw:executing-plans (inline).

**Goal:** Now's Coming up / Earlier today and the Next 3 days tab use the day page's rail + `ItemCard` (Trip Mode), with the `✓ {code}` chip, Skip `⋯` on Coming up, no next accent, no overlap, muted Earlier today. `TripModeCard` is retired.

**Spec:** `docs/plans/2026-10-06-card-system/spec.md` (#418: Card anatomy strip item 3, Overlap, Earlier today, Rail node), `docs/CARD_SYSTEM.md` D2/D5/D10.

## Scope calls
- Several Heroes, `NOW · since`, free-time `until {next}`, deadline/start-only bucket rules: #430 / #431 own them (their issue bodies say so). Not built. Feed classification (`getNowFeed`) is unchanged.
- #423 (Span bands) later replaces the `MultiDayBanner` block at the top of Now. That block stays the first child of `<main>`; the lists below it are self-contained sections.
- Next 3 days gets no `⋯` (AC: Coming up cards only).

## Tasks
1. **Derivations (red first)** `src/lib/itinerary/card-anatomy.ts`: `stripCode(codes)` -> `{ text, value, label, extra }` (`ABC123`, `ABC123 +2`, null when no non-empty value). `stripEntries(...)` (pure): the strip's entries in priority order, with Trip Mode dropping overlap and adding the code chip only on a booked item. Tests: no code, one, several, blank values dropped; Trip Mode never emits overlap even when a pair is passed; booked-without-code keeps `Booked`. Now feed: boundary test (`getNowFeed`): ends exactly now -> Earlier today; a trip-tz `now` (from `tripNow`) splits the day.
2. **Chip** `CardStrip` renders kind `code` as a real `<button>` (copy + toast). Hit area via padding + equal negative margin; the strip's left box becomes `overflow-x-clip` (not `hidden`, which would clip the hit area).
3. **ItemCard** props: `muted` (Earlier today: transparent fill, ink-muted text, lighter rule), `menu` snippet (head, top-right, 44px hit that fits the card padding). `RailStack` `past` prop: lighter rule / segments, outlined node (`MonoTypeIcon` variant `outlined`).
4. **Now page**: Earlier today = muted ItemCards (drop `opacity-55`); Coming up = ItemCards with `⋯` (Skip only, via `itemPermissions` / `itemMenuEntries`); one shared Skip sheet target for the Hero and the cards. Loader adds `docCountByItem`.
5. **Next 3 days**: ItemCard per item; loader adds members + `docCountByItem`.
6. Retire `TripModeCard`; fix `trip-mode-skip-door` selectors.
7. Seed `{now:'rail'}` (hero + earlier-today + coming-up booked with/without codes), screenshots 375/768, CARD_CONTENT_SPEC section 2c.

## Verify
`pnpm check`; `pnpm test:unit`; `E2E_SLOT=1 pnpm test:e2e:clean`; `E2E_SLOT=1 VISUAL_SEED='{"now":"rail"}' pnpm verify:visual '/trips/{slug}/now' --viewport`.
