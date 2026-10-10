# #436 The record on the rail — plan

Stories 57, 58. D2 (record), §4 item 7. Blocked-by #420, #433 (both merged).

## Decisions
- `RecordCard.svelte` (portability/components): read-only rail card. `RailStack` + `Card`, title, meta (`cardMeta`), FULL description, no link, no cost, no strip, no outcome stamp. Rationale: `ItemCard` is a stretched link over a full `Item` with planning chrome; archive rows (public, sanitized) link nowhere. Reuses the rail geometry (`RAIL`, `TIMED_MIN_HEIGHT`) and `RailStack` read-only. A note shows its description once (body), not also as meta.
- `ArchiveDaySection` renders `RecordCard`s on the day page's order (`orderDayItems`). Shared by the member Record view and the public archive (CARD_CONTENT_SPEC G2 lists both; lockstep). `buildArchiveView` adds `sort_order` and `end_date` (display-only, non-sensitive) so order matches the day and multi-day items don't print a backwards range.
- `ConsideredRows.svelte`: "What we considered" as `Row`s grouped via `ideaGroups` + `IdeaGroupHeading`; sub-line from `rowContent` (flights through `FlightSubLine`). Used by RecordView and the public archive page (replacing two duplicate blocks). Not links.
- Day headers: already `formatCalendarDate` (UTC, #393).
- Seed: `record: true` in dev-auth seed (before `// Optional { now:`): marks items done with descriptions, adds considered items across types, archives the trip with a share token. Route: `/trips/{slug}` closed.

## Tests
- Vitest: archive-view carries sort_order/end_date; pure helper for card time fields (multi-day clamp) if extracted.
- E2E: existing `trip-record-view` must pass. Layout proven by verify:visual.
- Docs: CARD_CONTENT_SPEC new section 4d.
