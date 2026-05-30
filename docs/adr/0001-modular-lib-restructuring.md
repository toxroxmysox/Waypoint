# ADR-0001: Modular lib/ Restructuring

**Status:** Proposed
**Date:** 2026-05-29
**Updated:** 2026-05-29
**Deciders:** Scott

## Context

Waypoint's `src/lib/` is a flat grab bag: 67 files across 7 top-level folders (`components/`, `utils/`, `stores/`, `config/`, `actions/`, `icons/`, `assets/`) plus loose files (`types.ts`, `pb.ts`, `index.ts`). There's no grouping by domain. A developer looking at `debt-simplify.ts` next to `phase-palette.ts` gets no signal about which functional area either belongs to.

The codebase is ~9,400 lines of frontend (routes + lib) and ~2,600 lines of backend hooks. It's small enough that the flat structure hasn't caused real pain yet. But with v1 complete and v3 design alignment underway, the cost of reorganizing only goes up over time.

### Current state

```
src/lib/
  actions/          1 file  (validate-form)
  assets/           static assets
  components/       18 files (feature-specific: FlightLookup, VoteButtons, etc.)
    skeletons/      8 files
    ui/             17 files (Button, Card, NavBar, etc.)
  config/           2 files (checklist-templates, item-fields)
  icons/            1 file
  stores/           2 files (toast, reduced-motion)
  utils/            15 files (crypto, debt-simplify, export, import, format, etc.)
  types.ts          326 lines, 30+ type exports covering ALL domains
  pb.ts             15 lines, PocketBase client singleton
  index.ts          barrel export
```

### Problems

1. **types.ts is a god file.** 326 lines, every domain type in one file. Itinerary types (Trip, Phase, Day, Item) live next to money types (Expense, Settlement, Budget) and collaboration types (Suggestion, Notification).

2. **utils/ is a junk drawer.** `crypto.ts` (vault), `debt-simplify.ts` (money), `export.ts` (portability), `trip-mode.ts` (trip mode), `phase-palette.ts` (itinerary) -- no cohesion.

3. **components/ mixes UI primitives with domain components.** `ui/Button.svelte` is a design-system primitive. `VoteButtons.svelte` is collaboration-domain logic. They're siblings.

4. **No domain boundary signals.** A new contributor (or future-Claude) can't tell which files belong to which functional area without reading every import.

5. **Test files are colocated but domain-scattered.** `crypto.test.ts` tests vault logic, `debt-simplify.test.ts` tests money logic -- they sit in the same `utils/` folder with no shared context.

### What's NOT broken

- Route structure (`src/routes/`) is well-organized by SvelteKit convention. No change needed.
- Backend hooks (`backend/pb_hooks/`) are already one-file-per-domain. Clean.
- Migrations are sequential and fine as-is.
- Component-to-route coupling is healthy -- most components are used by 2-6 routes.

## Decision

Restructure `src/lib/` into domain modules aligned with the bounded contexts defined in `CONTEXT.md`.

### Target structure

```
src/lib/
  itinerary/
    types.ts          Trip, Phase, Day, Item, ItemType, ItemStatus, Slot,
                      ParkingLotScope, ChecklistItem, ConfirmationCode
    phases.ts
    item-fields.ts
    checklist-templates.ts
    components/       InlineQuickAdd, MoveItemSheet, ParkingLotSection,
                      FlightLookup, PlacesAutocomplete,
                      CloseoutDayCard, CloseoutItemRow
  collaboration/
    types.ts          TripMember, MemberRole, InviteRole, PendingInvite,
                      Suggestion, SuggestionStatus, SuggestionTargetType,
                      Comment, Notification, NotificationType, Vote
    components/       VoteButtons, NotificationBell
  money/
    types.ts          Expense, ExpenseCategory, SplitMode, SplitData,
                      SplitDataEqual, SplitDataByAmount, Settlement,
                      BudgetMode, BudgetCategory, TripBudget
    debt-simplify.ts
  trip-mode/
    types.ts          (created empty — populated with NowState, OngoingState
                      as v3 derived types are built)
    trip-mode.ts
    components/       NowDivider, TripModeCard
  portability/
    types.ts          TripExport
    export.ts
    import.ts
    archive-token.ts
    components/       ArchiveDaySection
  vault/
    types.ts          VaultEntry, VaultEntryDecrypted
    crypto.ts
    vault-password.ts
  ui/
    Button.svelte, Card.svelte, NavBar.svelte, SubTabs.svelte, ...
    PhaseChip.svelte, Pill.svelte, SectionH.svelte, TypeIcon.svelte
    Avatar.svelte, BottomSheet.svelte, Toast.svelte
    Skeleton.svelte
    skeletons/        DayItemSkeleton, TripCardSkeleton, etc.
  shell/
    pb.ts
    format.ts
    trip-nav.ts
    stores/           toast.ts, reduced-motion.ts
    actions/          validate-form.ts
    components/       AppShell, BottomNav, TripTabs, ContextRail,
                      SideRail, DayNav, A2HSBanner, FAB
  types.ts            Re-export barrel: export * from './itinerary/types' etc.
```

### Placement rules

These rules determine where new files go:

1. **Does it import domain types and contain domain logic?** → domain module (`itinerary/`, `collaboration/`, `money/`, `trip-mode/`, `portability/`)
2. **Is it a technical capability with no domain dependency?** → standalone module (`vault/`)
3. **Is it a generic UI primitive usable without trip/item/member knowledge?** → `ui/`
4. **Is it app chrome, navigation, or infrastructure?** → `shell/`
5. **When in doubt:** check what types the file imports. The import graph determines the module, not the UI shape.

### Files excluded from migration

- `phase-palette.ts` — deleted during v3 (phase colors removed per CONTEXT.md)
- `PhaseColorPicker.svelte` — deleted during v3 (same reason)
- `date-math.test.ts` — standalone test mirroring backend hook logic, not a lib file

### v3 component destinations

These components don't exist yet but are planned for v3. When built, they go here:

| Component | Module |
|-----------|--------|
| NowCard, UpNextCard, LaterRow, QuickActions, DayWrapCard | `trip-mode/components/` |
| OngoingCard, UntimedItem, AnchoredItem, TripDayItem, TimelineSection | `itinerary/components/` |
| PlanningBottomNav, TripBottomNav, TripModeNavBar, SyncDot | `shell/components/` |
| CatGlyph, CatIconCircleV3 | `ui/` |

## Options Considered

### Option A: Domain modules in lib/ (chosen)

See target structure above.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium -- ~50 file moves, import rewrites, barrel re-exports |
| Risk | Low -- no logic changes, purely organizational. Tests validate nothing broke. |
| Discoverability | High -- file location signals domain intent |
| Migration effort | ~2 hours with automated import rewriting |

**Pros:**
- Domain boundaries become visible in the file tree
- types.ts splits into focused, smaller files
- New features have a clear "home" via placement rules
- Aligns with CONTEXT.md bounded contexts
- Each module is independently testable

**Cons:**
- Every `$lib/types` import (63 across the codebase) needs updating or a barrel re-export
- Deeper nesting (2 levels instead of 1)
- Churn in git blame

### Option B: Keep flat, split types only

Split `types.ts` into per-domain type files but leave everything else flat.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low -- 1 file split into 6, import barrel stays compatible |
| Risk | Very low -- only types.ts changes |
| Discoverability | Marginal improvement -- types are clearer, but utils/components still mixed |
| Migration effort | ~30 minutes |

**Pros:**
- Minimal churn
- Fixes the worst offender (god types file)
- Barrel re-export means zero import changes in routes

**Cons:**
- Doesn't solve the utils junk drawer
- Components still mixed domain/UI
- Doesn't create domain boundaries

### Option C: Full feature-sliced design

Each feature gets its own folder with types + logic + components + tests.

| Dimension | Assessment |
|-----------|------------|
| Complexity | High -- deep restructuring, unclear boundaries for shared components |
| Risk | Medium -- feature slicing works better for larger apps |
| Discoverability | High but potentially over-engineered for this codebase size |
| Migration effort | ~4 hours |

**Pros:** Maximum cohesion per feature.
**Cons:** Overkill for ~67 lib files. Creates more folders than files in some slices.

## Trade-off Analysis

Option A hits the sweet spot. The codebase is small enough that the restructuring is a single-session task, but large enough that the flat structure already hides domain relationships. Option B is too conservative -- it only fixes types, leaving the real navigation problem (which util goes where?) unsolved. Option C is over-engineered for 67 files.

The key risk with Option A is import churn. Mitigated by:
1. Barrel `types.ts` at `src/lib/types.ts` that re-exports all domain types -- existing `$lib/types` imports work unchanged
2. Module-level barrel exports (`$lib/itinerary`, `$lib/money`, etc.) for new code
3. Automated import rewriting via search-and-replace

## Consequences

- **Easier:** Finding where to add a new type, utility, or component. Understanding domain boundaries. Writing focused tests.
- **Harder:** Nothing significant -- barrel re-exports preserve existing import paths.
- **Revisit:** If a module grows past ~15 files, consider sub-modules. If modules develop circular dependencies, re-examine boundaries.

## Action Items

1. [ ] Create module folders and barrel files
2. [ ] Move type definitions into per-module types.ts files
3. [ ] Move utility files into their domain modules
4. [ ] Move domain-specific components into their domain modules
5. [ ] Move shell components (AppShell, BottomNav, TripTabs, ContextRail, SideRail, DayNav, A2HSBanner, FAB) into shell/components/
6. [ ] Move SubTabs into ui/
7. [ ] Consolidate skeletons under ui/
8. [ ] Delete phase-palette.ts and PhaseColorPicker.svelte (or defer to v3)
9. [ ] Update all imports (or verify barrel re-exports cover them)
10. [ ] Run `pnpm check` + `pnpm test` + `pnpm test:e2e` to verify no breakage
11. [ ] Update `.wolf/anatomy.md` with new file locations
