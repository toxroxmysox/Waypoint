# M5 — Closure

**Status:** Complete
**Branch:** `claude/thirsty-swirles-704b1e`

## Sub-milestones

- [x] **M5a** — Backend foundation: `considered` status migration, archive token util, export builder, import validator + unit tests
- [x] **M5b** — Closeout wizard UI: day-by-day review, done/swap/skip actions, archive settings in trip settings, InlineQuickAdd component
- [x] **M5c** — Public archive view: admin-auth loader, sanitized data (strips PII/costs), responsive timeline, considered items section
- [x] **M5d** — JSON export endpoint + import page with preview, links on trips list and more page
- [x] **M5e** — E2E Playwright tests, full test suite passing

## Key decisions

- Archive reads use standalone PB admin auth (not user session) to bypass collection rules for public routes
- `considered` is a new ItemStatus — "Did something else" marks original as `considered`, creates replacement as `done`; "Skipped" leaves item as `planned`
- Archive route (`/archive/[token]`) is outside `(app)` layout group — no NavBar, no auth
- Export includes budget categories but excludes individual expenses/settlements (member IDs don't round-trip)
- Closeout is online-only, blocked with message when offline

## Files created/modified

### M5a (backend)
- `backend/pb_migrations/0026_item_considered_status.js`
- `src/lib/types.ts` — ItemStatus, TripExport
- `src/lib/utils/archive-token.ts`
- `src/lib/utils/export.ts` + `export.test.ts`
- `src/lib/utils/import.ts` + `import.test.ts`

### M5b (closeout UI)
- `src/routes/(app)/trips/[slug]/closeout/+page.server.ts`
- `src/routes/(app)/trips/[slug]/closeout/+page.svelte`
- `src/lib/components/CloseoutDayCard.svelte`
- `src/lib/components/CloseoutItemRow.svelte`
- `src/lib/components/InlineQuickAdd.svelte`
- `src/routes/(app)/trips/[slug]/settings/+page.server.ts` — toggleArchive action
- `src/routes/(app)/trips/[slug]/settings/+page.svelte` — archive settings section
- `src/routes/(app)/trips/[slug]/more/+page.svelte` — closeout link

### M5c (public archive)
- `src/routes/archive/[token]/+page.server.ts`
- `src/routes/archive/[token]/+page.svelte`
- `src/lib/components/ArchiveDaySection.svelte`

### M5d (export/import)
- `src/routes/(app)/trips/[slug]/export/+server.ts`
- `src/routes/(app)/trips/import/+page.server.ts`
- `src/routes/(app)/trips/import/+page.svelte`
- `src/routes/(app)/trips/+page.svelte` — import links
- `src/routes/(app)/trips/[slug]/more/+page.svelte` — export link

### M5e (tests)
- `tests/e2e/m5-closure.spec.ts`
