# #427 The empty day — plan

Story 35. Overview card half already shipped (#426/#467: headline "Nothing planned yet" + `data-day-empty-hint` "Add something, or drag an idea here") and matches the AC verbatim: no change.

1. `DayTimeline.svelte`: replace the one-line empty link with a dashed panel: "Nothing planned" · "Add something, or drag an idea here." + `+ Add item` button (link to `items/new?day=`, 44px hit area). Panel stays outside the dndzone (the zone keeps its min-h as the drop target).
2. `CARD_CONTENT_SPEC.md` 2a: add the empty-state row.
3. Verify: check, unit, e2e:clean (grep tests for old copy: none), verify:visual `{day5}` at 375/768.

No test: layout/copy only (proven by screenshots).
Final: review by PM.
