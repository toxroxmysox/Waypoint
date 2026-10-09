# #437 — item page header bar and the role-filtered ⋯ menu

Refs #437, parent #418, D12 in `docs/CARD_SYSTEM.md`. Builds on #416 (`itemPermissions`).

## Decisions
- Menu content is a pure function, `itemMenuEntries(perms)` in `item-actions.ts`: Move (canMove), Skip… (canSkip), divider, Delete (canDelete). Divider only when something precedes Delete. No entries → no `⋯`.
- NavBar: back · trip name (title leaves; Hero already shows it) · Edit (canEdit) · `⋯` (entries.length > 0). The old NavBar "Move" button goes.
- `⋯` opens a small popover anchored under the button (rows 44px, closes on Escape / outside tap). Each row opens its own `BottomSheet`: Move (existing MoveItemSheet), Skip (confirm, keeps "Nothing is deleted"), Delete (confirm with doc count). Errors from `ITEM_ACTION_ERRORS` render inside the sheet that acted.
- Bottom "Not happening?" and "Delete item" panels removed. Edit page's Delete panel untouched.
- New component `ItemActionsMenu.svelte` (menu + Skip + Delete sheets); page keeps the form actions (`?/skipItem`, `?/delete`) and `skipDestination`.

## Tasks
1. Red: Vitest for `itemMenuEntries` per role; then implement.
2. Red: rewrite `tests/e2e/item-role-gating.spec.ts` to drive `⋯`; `grep` other specs for removed UI.
3. Build `ItemActionsMenu.svelte`; wire the page; remove panels.
4. CARD_CONTENT_SPEC §3 (item detail) amended.
5. Verify: check, unit, `E2E_SLOT=1 test:e2e:clean`, 375/768 screenshots (owner closed/open/skip sheet; traveler).
