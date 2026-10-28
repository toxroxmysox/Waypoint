# #571 plan: code follows the glossary

Source: [#571](https://github.com/toxroxmysox/Waypoint/issues/571), grill record `grill.md`. Refactor, no behaviour change. One commit per group.

## Never renamed

Stored or contract names: PB fields `scenarios.champion` / `scenarios.keystones`, migrations, the Decision Record payload keys `champion_name` / `keystone_labels` (stored JSON in `decisions.payload`), the MCP contract (`propose_changes`, `proposal_id`), `/api/glance` + `computeGlance`, PB hook routes (`/api/scenarios/promote`, `/api/members/promote`). Scenario promotion (`planPromotion`, `promoteScenario`, availability `?/promote`) IS a Promotion and keeps its name. Span naming (#546) and the Organizer predicate (#543) are owned elsewhere.

## Groups

1. **Planning an Idea.** `trip-mode/promote.ts` → `plan-idea.ts` (`promotedDisplayOrder` → `plannedDisplayOrder`, `promotePlacement` → `planPlacement`). Now page: `?/promoteIdea` → `?/planIdea`, `canPromote` → `canPlan`, error copy → "plan". Comments that call putting an Idea on a day (or approving a Suggestion) a promotion get reworded.
2. **Scenario Creator / Core Idea.** View models: `championName`/`championId`/`isChampion` → `creator*`; `keystoneLabels`/`keystoneItemIds`/`ConvergeDimensions.keystones` → `coreIdea*`. Composer form fields and test id → `core_idea`. Error copy "Only the champion…" → creator. Backend hook error copy ditto.
3. **Money summary.** `money/money-glance.ts` → `money-summary.ts`; `moneyGlance`/`MoneyGlance*`/`GlanceItem` → summary; page data `glance` → `summary`.
4. **Money Unit route.** `/trips/[slug]/groups` → `/money-units`, `/groups` 308-redirects. Tab id → `money-units`; "group id" error strings → money unit. UI labels ("Groups", "New group") stay: UI copy is out of scope, as with Organizer.
5. **Group input.** `src/lib/collaboration` → `src/lib/group-input`.
6. **Phases.** Delete `isTravelTransition`; rewrite `phases.ts` comments for non-overlapping Phases (ADR-0021).

After each group: `grep -rn '<old>' tests/`, fix in the same commit, `pnpm check` + vitest.

## Gate

`pnpm check`, vitest, harnesses, `E2E_SLOT=6 pnpm test:e2e:clean` (background), `pnpm verify:visual` at 375 for the changed copy, then PR → `svw:requesting-code-review` → merge. No deploy.
